import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequestActive, AuthError } from '@/lib/auth/authenticate';
import { auditFromRequest } from '@/lib/api/audit';
import { notifyUser } from '@/services/notifications/notificationEngine';

const cleanName = (value: unknown) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';

async function authorize(request: NextRequest, write = false) {
  const auth = await authenticateRequestActive(request);
  if (write ? auth.role !== 'ADMIN' : !['ADMIN', 'LECTEUR'].includes(auth.role)) {
    throw Object.assign(new Error('Accès non autorisé.'), { status: 403 });
  }
  return auth;
}

async function notifyHumanitiesClasses(
  request: NextRequest,
  auth: { schoolId: string; userId: string; name: string },
  affected: Array<{ id: string; name: string; titulaireId: string | null }>,
  change: string,
) {
  const changedAt = new Date();
  const when = changedAt.toLocaleString('fr-FR');
  const notices = affected.flatMap((schoolClass) => {
    const message = `${auth.name} a modifié ${change} pour la classe « ${schoolClass.name} », le ${when}.`;
    return [
      notifyUser({ schoolId: auth.schoolId, senderId: auth.userId, targetRole: 'STUDENT', targetClassId: schoolClass.id, title: 'Structure de classe mise à jour', message, type: 'CLASS', priority: 'NORMAL', metadata: { classId: schoolClass.id, changedAt: changedAt.toISOString() } }),
      ...(schoolClass.titulaireId ? [notifyUser({ schoolId: auth.schoolId, senderId: auth.userId, userId: schoolClass.titulaireId, targetRole: 'TEACHER', title: 'Structure de classe mise à jour', message, type: 'CLASS', priority: 'NORMAL', metadata: { classId: schoolClass.id, changedAt: changedAt.toISOString() } })] : []),
    ];
  });
  for (const schoolClass of affected) {
    const enrollments = await db.enrolledClass.findMany({
      where: { classId: schoolClass.id, class: { schoolId: auth.schoolId }, user: { schoolId: auth.schoolId, role: 'STUDENT', active: true, deletedAt: null, parentId: { not: null } } },
      select: { user: { select: { parentId: true } } },
    });
    const parents = [...new Set(enrollments.map(({ user }) => user.parentId).filter((id): id is string => Boolean(id)))];
    notices.push(...parents.map((parentId) => notifyUser({
      schoolId: auth.schoolId, senderId: auth.userId, userId: parentId, targetRole: 'PARENT',
      title: 'Classe de votre enfant mise à jour', message: `${auth.name} a modifié ${change} pour la classe « ${schoolClass.name} », le ${when}.`,
      type: 'CLASS', priority: 'NORMAL', metadata: { classId: schoolClass.id, changedAt: changedAt.toISOString() },
    })));
  }
  const results = await Promise.allSettled(notices);
  results.filter((result) => result.status === 'rejected').forEach((result) => console.error('[HumanitiesStructure] Notification failed:', result.reason));
  await auditFromRequest(request, {
    schoolId: auth.schoolId,
    userId: auth.userId,
    action: 'HUMANITIES_STRUCTURE_APPLIED_TO_CLASSES',
    entity: 'SchoolClass',
    after: { classIds: affected.map((item) => item.id), change, changedAt: changedAt.toISOString() },
  });
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    const sections = await db.humanitiesSection.findMany({
      where: { schoolId: auth.schoolId },
      include: { options: { orderBy: { name: 'asc' } } },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json({ sections });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erreur serveur.' }, { status: Number((error as { status?: number })?.status) || 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request, true);
    const body = await request.json();
    const action = String(body?.action || '');
    const name = cleanName(body?.name);
    if (!name || name.length > 80) return NextResponse.json({ error: 'Le nom doit contenir de 1 à 80 caractères.' }, { status: 400 });

    let result: unknown;
    if (action === 'create-section') {
      result = await db.humanitiesSection.create({ data: { schoolId: auth.schoolId, name } });
    } else if (action === 'create-option') {
      const section = await db.humanitiesSection.findFirst({ where: { id: String(body?.sectionId || ''), schoolId: auth.schoolId }, select: { id: true } });
      if (!section) return NextResponse.json({ error: 'Section introuvable dans votre école.' }, { status: 404 });
      result = await db.humanitiesOption.create({ data: { sectionId: section.id, name } });
    } else {
      return NextResponse.json({ error: 'Action de configuration invalide.' }, { status: 400 });
    }

    await auditFromRequest(request, { schoolId: auth.schoolId, userId: auth.userId, action: 'HUMANITIES_STRUCTURE_CREATE', entity: action === 'create-section' ? 'HumanitiesSection' : 'HumanitiesOption', after: result });
    return NextResponse.json({ item: result }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    const code = (error as { code?: string })?.code;
    if (code === 'P2002') return NextResponse.json({ error: 'Ce nom existe déjà dans cette configuration.' }, { status: 409 });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erreur serveur.' }, { status: Number((error as { status?: number })?.status) || 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await authorize(request, true);
    const body = await request.json();
    const kind = body?.kind;
    const id = String(body?.id || '');
    const name = cleanName(body?.name);
    if (!id || !name || name.length > 80 || !['section', 'option'].includes(kind)) {
      return NextResponse.json({ error: 'Section, option et nouveau nom requis.' }, { status: 400 });
    }

    let before: unknown;
    let after: unknown;
    if (kind === 'section') {
      const section = await db.humanitiesSection.findFirst({ where: { id, schoolId: auth.schoolId } });
      if (!section) return NextResponse.json({ error: 'Section introuvable.' }, { status: 404 });
      before = section;
      const affectedClasses = name === section.name ? [] : await db.schoolClass.findMany({
        where: { schoolId: auth.schoolId, cycle: 'Humanites', section: section.name, deletedAt: null },
        select: { id: true, name: true, titulaireId: true },
      });
      after = await db.$transaction(async (tx) => {
        const renamed = await tx.humanitiesSection.update({ where: { id }, data: { name } });
        await tx.schoolClass.updateMany({ where: { schoolId: auth.schoolId, cycle: 'Humanites', section: section.name }, data: { section: name } });
        return renamed;
      });
      if (affectedClasses.length) await notifyHumanitiesClasses(request, auth, affectedClasses, `la section « ${section.name} » devenue « ${name} »`);
    } else {
      const option = await db.humanitiesOption.findFirst({ where: { id, section: { schoolId: auth.schoolId } }, include: { section: { select: { id: true, name: true } } } });
      if (!option) return NextResponse.json({ error: 'Option introuvable.' }, { status: 404 });
      before = option;
      const affectedClasses = name === option.name ? [] : await db.schoolClass.findMany({
        where: { schoolId: auth.schoolId, cycle: 'Humanites', section: option.section.name, option: option.name, deletedAt: null },
        select: { id: true, name: true, titulaireId: true },
      });
      after = await db.$transaction(async (tx) => {
        const renamed = await tx.humanitiesOption.update({ where: { id }, data: { name } });
        await tx.schoolClass.updateMany({ where: { schoolId: auth.schoolId, cycle: 'Humanites', section: option.section.name, option: option.name }, data: { option: name } });
        return renamed;
      });
      if (affectedClasses.length) await notifyHumanitiesClasses(request, auth, affectedClasses, `l’option « ${option.name} » devenue « ${name} »`);
    }
    await auditFromRequest(request, { schoolId: auth.schoolId, userId: auth.userId, action: 'HUMANITIES_STRUCTURE_RENAME', entity: kind === 'section' ? 'HumanitiesSection' : 'HumanitiesOption', entityId: id, before, after });
    return NextResponse.json({ item: after });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    if ((error as { code?: string })?.code === 'P2002') return NextResponse.json({ error: 'Ce nom existe déjà dans cette configuration.' }, { status: 409 });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erreur serveur.' }, { status: Number((error as { status?: number })?.status) || 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await authorize(request, true);
    const body = await request.json();
    const { kind, id } = body || {};
    if (!id || !['section', 'option'].includes(kind)) return NextResponse.json({ error: 'Section ou option requise.' }, { status: 400 });

    if (kind === 'section') {
      const section = await db.humanitiesSection.findFirst({ where: { id: String(id), schoolId: auth.schoolId }, include: { options: true } });
      if (!section) return NextResponse.json({ error: 'Section introuvable.' }, { status: 404 });
      const classes = await db.schoolClass.findMany({
        where: { schoolId: auth.schoolId, cycle: 'Humanites', section: section.name, deletedAt: null },
        select: { id: true, name: true, level: true, section: true, option: true, _count: { select: { enrollments: true } } },
        orderBy: { name: 'asc' },
      });
      if (classes.length) return NextResponse.json({ error: `Cette section est utilisée par ${classes.length} classe(s). Réaffectez les classes et leurs élèves avant de la retirer.`, affectedClasses: classes.length, classes }, { status: 409 });
      await db.humanitiesSection.delete({ where: { id: section.id } });
      await auditFromRequest(request, { schoolId: auth.schoolId, userId: auth.userId, action: 'HUMANITIES_SECTION_DELETE', entity: 'HumanitiesSection', entityId: section.id, before: section });
    } else {
      const option = await db.humanitiesOption.findFirst({ where: { id: String(id), section: { schoolId: auth.schoolId } }, include: { section: { select: { name: true } } } });
      if (!option) return NextResponse.json({ error: 'Option introuvable.' }, { status: 404 });
      const classes = await db.schoolClass.findMany({
        where: { schoolId: auth.schoolId, cycle: 'Humanites', section: option.section.name, option: option.name, deletedAt: null },
        select: { id: true, name: true, level: true, section: true, option: true, _count: { select: { enrollments: true } } },
        orderBy: { name: 'asc' },
      });
      if (classes.length) return NextResponse.json({ error: `Cette option est utilisée par ${classes.length} classe(s). Réaffectez les classes et leurs élèves avant de la retirer.`, affectedClasses: classes.length, classes }, { status: 409 });
      await db.humanitiesOption.delete({ where: { id: option.id } });
      await auditFromRequest(request, { schoolId: auth.schoolId, userId: auth.userId, action: 'HUMANITIES_OPTION_DELETE', entity: 'HumanitiesOption', entityId: option.id, before: option });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erreur serveur.' }, { status: Number((error as { status?: number })?.status) || 500 });
  }
}
