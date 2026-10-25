import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequestActive, AuthError } from '@/lib/auth/authenticate';
import { notifyUser } from '@/services/notifications/notificationEngine';
import { auditFromRequest } from '@/lib/api/audit';

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequestActive(request);
    if (auth.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Action réservée aux administrateurs.' }, { status: 403 });
    }

    const body = await request.json();
    const { studentIds, fromClassId, toClassId } = body;

    if (!Array.isArray(studentIds) || studentIds.length === 0 || !toClassId) {
      return NextResponse.json(
        { error: 'Veuillez spécifier les élèves à transférer et la classe de destination.' },
        { status: 400 }
      );
    }

    // Vérifier que la classe de destination appartient bien à l'école de l'admin
    const destinationClass = await db.schoolClass.findUnique({
      where: { id: toClassId },
      select: { id: true, name: true, schoolId: true, level: true, cycle: true, section: true, option: true, deletedAt: true },
    });

    if (!destinationClass || destinationClass.schoolId !== auth.schoolId || destinationClass.deletedAt) {
      return NextResponse.json({ error: 'Classe de destination introuvable.' }, { status: 404 });
    }
    if (fromClassId) {
      const sourceClass = await db.schoolClass.findFirst({ where: { id: fromClassId, schoolId: auth.schoolId, deletedAt: null }, select: { id: true } });
      if (!sourceClass) return NextResponse.json({ error: 'Classe d’origine introuvable dans votre école.' }, { status: 404 });
      if (sourceClass.id === destinationClass.id) return NextResponse.json({ error: 'Choisissez une classe de destination différente.' }, { status: 400 });
    }

    // Vérifier les élèves
    const validStudents = await db.user.findMany({
      where: {
        id: { in: studentIds },
        schoolId: auth.schoolId,
        role: 'STUDENT',
        active: true,
        deletedAt: null,
      },
      select: { id: true, fullName: true, parentId: true },
    });

    const validIds = validStudents.map((s) => s.id);
    if (validIds.length === 0) {
      return NextResponse.json({ error: 'Aucun élève valide sélectionné.' }, { status: 400 });
    }

    // Effectuer le transfert dans une transaction :
    // Supprimer les inscriptions de ces élèves (de la classe d'origine ou de toutes)
    // et créer l'inscription dans la nouvelle classe
    await db.$transaction(async (tx) => {
      if (fromClassId) {
        await tx.enrolledClass.deleteMany({
          where: {
            userId: { in: validIds },
            classId: fromClassId,
          },
        });
      } else {
        await tx.enrolledClass.deleteMany({
          where: {
            userId: { in: validIds },
            class: { schoolId: auth.schoolId },
          },
        });
      }

      await tx.enrolledClass.createMany({
        data: validIds.map((userId) => ({
          userId,
          classId: toClassId,
        })),
        skipDuplicates: true,
      });
    });
    await auditFromRequest(request, {
      schoolId: auth.schoolId, userId: auth.userId, action: 'CLASS_STUDENTS_TRANSFERRED', entity: 'SchoolClass', entityId: destinationClass.id,
      before: { fromClassId: fromClassId || null, studentIds: validIds },
      after: { toClassId: destinationClass.id, studentIds: validIds },
    }).catch((error) => console.error('[ClassesTransfer] Audit write failed:', error));

    const changedAt = new Date();
    const when = changedAt.toLocaleString('fr-FR');
    const cycleDescription = destinationClass.cycle === 'Humanites'
      ? `Humanités, section ${destinationClass.section}, option ${destinationClass.option}`
      : `${destinationClass.level}${destinationClass.cycle && destinationClass.cycle !== destinationClass.level ? ` · ${destinationClass.cycle}` : ''}`;
    const notices = validStudents.flatMap((student) => [
      notifyUser({
        schoolId: auth.schoolId, senderId: auth.userId, userId: student.id, targetRole: 'STUDENT',
        title: 'Classe mise à jour',
        message: `${auth.name} vous a transféré en classe de « ${destinationClass.name} » (${cycleDescription}), le ${when}.`,
        type: 'CLASS', priority: 'NORMAL', metadata: { studentId: student.id, classId: destinationClass.id, changedAt: changedAt.toISOString() },
      }),
      ...(student.parentId ? [notifyUser({
        schoolId: auth.schoolId, senderId: auth.userId, userId: student.parentId, targetRole: 'PARENT',
        title: 'Classe de votre enfant mise à jour',
        message: `${auth.name} a transféré ${student.fullName} en classe de « ${destinationClass.name} » (${cycleDescription}), le ${when}.`,
        type: 'CLASS', priority: 'NORMAL', metadata: { studentId: student.id, classId: destinationClass.id, changedAt: changedAt.toISOString() },
      })] : []),
    ]);
    const noticeResults = await Promise.allSettled(notices);
    noticeResults.filter((result) => result.status === 'rejected').forEach((result) => console.error('[ClassesTransfer] Notification failed:', result.reason));

    return NextResponse.json({
      success: true,
      count: validIds.length,
      destinationName: destinationClass.name,
      message: `${validIds.length} élève(s) transféré(s) avec succès vers la classe "${destinationClass.name}".`,
    });
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Erreur lors du transfert';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
