import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { authenticateRequest, AuthError } from '@/lib/auth/authenticate';
import { notifyUser } from '@/services/notifications/notificationEngine';
import { auditFromRequest } from '@/lib/api/audit';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Lecture : utilisateur authentifié de la même école
    const auth = await authenticateRequest(request);
    const { id } = await params;

    const schoolClass = await db.schoolClass.findUnique({
      where: { id },
      include: {
        school: { select: { id: true } },
        _count: {
          select: {
            enrollments: true,
            courses: true,
          },
        },
        enrollments: {
          select: {
            user: {
              select: {
                id: true,
                fullName: true,
                email: auth.role === 'ADMIN',
                role: true,
                photoUrl: true,
                parentId: true,
              },
            },
          },
        },
      },
    });

    if (!schoolClass) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }
    if (schoolClass.schoolId !== auth.schoolId) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }

    let visibleEnrollments = schoolClass.enrollments;
    if (auth.role === 'TEACHER') {
      const assigned = await db.course.findFirst({ where: { schoolId: auth.schoolId, classId: id, teacherId: auth.userId, deletedAt: null }, select: { id: true } });
      if (schoolClass.titulaireId !== auth.userId && !assigned) return NextResponse.json({ error: 'Accès limité à vos classes.' }, { status: 403 });
    } else if (auth.role === 'STUDENT') {
      visibleEnrollments = schoolClass.enrollments.filter((enrollment) => enrollment.user.id === auth.userId);
      if (!visibleEnrollments.length) return NextResponse.json({ error: 'Accès limité à votre classe.' }, { status: 403 });
    } else if (auth.role === 'PARENT') {
      visibleEnrollments = schoolClass.enrollments.filter((enrollment) => enrollment.user.parentId === auth.userId);
      if (!visibleEnrollments.length) return NextResponse.json({ error: 'Accès limité aux classes de vos enfants.' }, { status: 403 });
    } else if (!['ADMIN', 'LECTEUR'].includes(auth.role)) {
      return NextResponse.json({ error: 'Accès non autorisé.' }, { status: 403 });
    }

    const safeEnrollments = auth.role === 'ADMIN'
      ? visibleEnrollments
      : visibleEnrollments.map(({ user, ...enrollment }) => ({
        ...enrollment,
        user: { id: user.id, fullName: user.fullName, role: user.role, photoUrl: user.photoUrl },
      }));
    return NextResponse.json({ class: { ...schoolClass, enrollments: safeEnrollments } });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Modification : ADMIN uniquement + même école
    const auth = await authenticateRequest(request);
    if (auth.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Seul un administrateur peut modifier une classe.' }, { status: 403 });
    }
    const { id } = await params;
    const body = await request.json();
    const { name, level, cycle, section, option, fees, titulaireId } = body;

    const existing = await db.schoolClass.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }
    if (existing.schoolId !== auth.schoolId) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }

    const classData: Prisma.SchoolClassUncheckedUpdateInput = {
      ...(name !== undefined && { name }),
      ...(level !== undefined && { level }),
      ...(fees !== undefined && { fees: typeof fees === 'number' ? fees : parseFloat(fees) || 0 }),
      ...(titulaireId !== undefined && { titulaireId: titulaireId || null }),
    };
    if (level !== undefined || cycle !== undefined || section !== undefined || option !== undefined) {
      const nextLevel = level ?? existing.level;
      const nextCycle = nextLevel !== 'Secondaire'
        ? nextLevel
        : cycle ?? (existing.cycle === 'Humanites' ? 'Humanites' : 'EB');
      const isHumanites = nextLevel === 'Secondaire' && nextCycle === 'Humanites';
      const nextSection = isHumanites ? String(section ?? existing.section ?? '').trim() : '';
      const nextOption = isHumanites ? String(option ?? existing.option ?? '').trim() : '';
      classData.cycle = nextCycle;
      classData.section = nextSection;
      classData.option = nextOption;
      if (isHumanites) {
        if (!nextSection || !nextOption) return NextResponse.json({ error: 'Une section et une option sont obligatoires pour une classe d’Humanités.' }, { status: 400 });
        const configured = await db.humanitiesOption.findFirst({ where: { name: nextOption, section: { schoolId: auth.schoolId, name: nextSection } }, select: { id: true } });
        if (!configured) return NextResponse.json({ error: 'Cette option ne fait pas partie de la section configurée pour votre école.' }, { status: 400 });
      }
    }

    if (titulaireId) {
      const teacher = await db.user.findFirst({ where: { id: titulaireId, schoolId: auth.schoolId, role: 'TEACHER', active: true, deletedAt: null }, select: { id: true } });
      if (!teacher) return NextResponse.json({ error: 'Le professeur titulaire doit être actif dans cette école.' }, { status: 400 });
    }

    const schoolClass = await db.schoolClass.update({
      where: { id },
      data: classData,
      include: {
        titulaire: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
          },
        },
        _count: {
          select: {
            enrollments: true,
            courses: true,
          },
        },
      },
    });
    await auditFromRequest(request, {
      schoolId: auth.schoolId,
      userId: auth.userId,
      action: 'CLASS_UPDATED',
      entity: 'SchoolClass',
      entityId: id,
      before: { name: existing.name, level: existing.level, cycle: existing.cycle, section: existing.section, option: existing.option, titulaireId: existing.titulaireId },
      after: { name: schoolClass.name, level: schoolClass.level, cycle: schoolClass.cycle, section: schoolClass.section, option: schoolClass.option, titulaireId: schoolClass.titulaireId },
    }).catch((error) => console.error('[Classes] Audit write failed:', error));

    if (titulaireId) {
      await db.user.updateMany({
        where: { id: titulaireId, schoolId: auth.schoolId },
        data: { isTitulaire: true },
      });
    }

    const changedAt = new Date();
    const when = changedAt.toLocaleString('fr-FR');
    if (titulaireId !== undefined && existing.titulaireId !== schoolClass.titulaireId) {
      const assignmentNotices: Promise<unknown>[] = [];
      if (existing.titulaireId) assignmentNotices.push(notifyUser({
        schoolId: auth.schoolId, senderId: auth.userId, userId: existing.titulaireId, targetRole: 'TEACHER',
        title: 'Titulariat retiré', message: `${auth.name} vous a retiré le titulariat de la classe « ${existing.name} », le ${when}.`,
        type: 'CLASS', priority: 'NORMAL', metadata: { classId: id, changedAt: changedAt.toISOString() },
      }));
      if (schoolClass.titulaireId) assignmentNotices.push(notifyUser({
        schoolId: auth.schoolId, senderId: auth.userId, userId: schoolClass.titulaireId, targetRole: 'TEACHER',
        title: 'Classe attribuée', message: `${auth.name} vous a confié le titulariat de la classe « ${schoolClass.name} », le ${when}.`,
        type: 'CLASS', priority: 'NORMAL', metadata: { classId: id, changedAt: changedAt.toISOString() },
      }));
      await Promise.allSettled(assignmentNotices);
    }

    const classDetailsChanged =
      (name !== undefined && name !== existing.name) ||
      (level !== undefined && level !== existing.level) ||
      (cycle !== undefined && cycle !== existing.cycle) ||
      (section !== undefined && section !== existing.section) ||
      (option !== undefined && option !== existing.option);
    if (classDetailsChanged) {
      const structure = schoolClass.cycle === 'Humanites'
        ? `Humanités, section ${schoolClass.section}, option ${schoolClass.option}`
        : `${schoolClass.level}${schoolClass.cycle && schoolClass.cycle !== schoolClass.level ? ` · ${schoolClass.cycle}` : ''}`;
      const enrolledStudents = await db.enrolledClass.findMany({
        where: { classId: id, class: { schoolId: auth.schoolId }, user: { schoolId: auth.schoolId, role: 'STUDENT', active: true, deletedAt: null } },
        select: { user: { select: { id: true, parentId: true } } },
      });
      const parentIds = [...new Set(enrolledStudents.map(({ user }) => user.parentId).filter((parentId): parentId is string => Boolean(parentId)))];
      const notices = [notifyUser({
        schoolId: auth.schoolId, senderId: auth.userId, targetRole: 'STUDENT', targetClassId: id,
        title: 'Classe mise à jour', message: `${auth.name} a modifié « ${schoolClass.name} » (${structure}), le ${when}.`,
        type: 'CLASS', priority: 'NORMAL', metadata: { classId: id, changedAt: changedAt.toISOString() },
      }), ...parentIds.map((parentId) => notifyUser({
        schoolId: auth.schoolId, senderId: auth.userId, userId: parentId, targetRole: 'PARENT',
        title: 'Classe de votre enfant mise à jour', message: `${auth.name} a modifié la classe de votre enfant : « ${schoolClass.name} » (${structure}), le ${when}.`,
        type: 'CLASS', priority: 'NORMAL', metadata: { classId: id, changedAt: changedAt.toISOString() },
      }))];
      const results = await Promise.allSettled(notices);
      results.filter((result) => result.status === 'rejected').forEach((result) => console.error('[Classes] Update notification failed:', result.reason));
    }

    return NextResponse.json({ class: schoolClass });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Suppression : ADMIN uniquement + même école
    const auth = await authenticateRequest(request);
    if (auth.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Seul un administrateur peut supprimer une classe.' }, { status: 403 });
    }
    const { id } = await params;

    const existing = await db.schoolClass.findUnique({ where: { id }, include: { _count: { select: { enrollments: true, courses: true, evaluations: true, reportCards: true, transmissions: true, bulletins: true, coefficients: true, passageSource: true, passageTarget: true, subjectRules: true, gradingDecisionRules: true } } } });
    if (!existing) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }
    if (existing.schoolId !== auth.schoolId) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }

    const feeCount = await db.fee.count({ where: { classId: id, schoolId: auth.schoolId, deletedAt: null } });
    const dependents = Object.values(existing._count).reduce((total, count) => total + count, feeCount);
    if (dependents > 0) {
      return NextResponse.json({ error: `Cette classe possède encore des données liées (${existing._count.enrollments} inscription(s), ${existing._count.courses} cours, ${feeCount} barème(s) et autres éléments). Transférez les élèves et réaffectez les données avant de supprimer la classe.`, usage: { ...existing._count, fees: feeCount } }, { status: 409 });
    }
    await db.schoolClass.delete({ where: { id } });

    return NextResponse.json({ message: 'Class deleted successfully' });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
