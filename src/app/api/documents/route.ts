import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequestActive, AuthError } from '@/lib/auth/authenticate';
import { notifyUser } from '@/services/notifications/notificationEngine';

export const runtime = 'nodejs';

// GET /api/documents?schoolId=&teacherId= – liste des documents pédagogiques
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequestActive(request);
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId');
    const teacherId = searchParams.get('teacherId');

    if (!schoolId) return NextResponse.json({ error: 'schoolId requis' }, { status: 400 });
    if (schoolId !== auth.schoolId) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }

    const where: any = { schoolId, deletedAt: null };
    if (auth.role === 'ADMIN') {
      if (teacherId) where.teacherId = teacherId;
    } else if (auth.role === 'TEACHER') {
      if (teacherId && teacherId !== auth.userId) return NextResponse.json({ error: 'Accès limité à vos documents.' }, { status: 403 });
      where.teacherId = auth.userId;
    } else if (auth.role === 'STUDENT' || auth.role === 'PARENT') {
      if (teacherId) return NextResponse.json({ error: 'Filtre professeur non autorisé.' }, { status: 403 });
      const studentIds = auth.role === 'STUDENT'
        ? [auth.userId]
        : (await db.user.findMany({
            where: { parentId: auth.userId, schoolId, role: 'STUDENT', active: true, deletedAt: null },
            select: { id: true },
          })).map((student) => student.id);
      const enrollments = await db.enrolledClass.findMany({
        where: { userId: { in: studentIds }, class: { schoolId, deletedAt: null } },
        select: { classId: true },
      });
      const classIds = [...new Set(enrollments.map((item) => item.classId))];
      where.published = true;
      where.targetClassId = { in: ['', ...classIds] };
    } else {
      return NextResponse.json({ error: 'Accès non autorisé.' }, { status: 403 });
    }

    const documents = await db.teacherDocument.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json({ documents });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[Documents] GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST /api/documents – crée un document pédagogique (TEACHER)
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequestActive(request);
    const body = await request.json();
    const {
      schoolId,
      title,
      description,
      category,
      subject,
      level,
      period,
      targetClassId,
      content,
      fileUrl,
      fileName,
    } = body;

    if (!schoolId || !title?.trim()) {
      return NextResponse.json({ error: 'schoolId et titre requis.' }, { status: 400 });
    }
    if (auth.role !== 'TEACHER' && auth.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Accès non autorisé. Réservé aux enseignants.' }, { status: 403 });
    }
    if (schoolId !== auth.schoolId) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }

    const classId = typeof targetClassId === 'string' ? targetClassId.trim() : '';
    if (classId) {
      const schoolClass = await db.schoolClass.findFirst({ where: { id: classId, schoolId, deletedAt: null }, select: { id: true } });
      if (!schoolClass) return NextResponse.json({ error: 'Classe introuvable dans votre établissement.' }, { status: 400 });
      if (auth.role === 'TEACHER') {
        const assignedCourse = await db.course.findFirst({ where: { schoolId, classId, teacherId: auth.userId, deletedAt: null }, select: { id: true } });
        if (!assignedCourse) return NextResponse.json({ error: 'Vous ne pouvez partager qu’avec une classe que vous enseignez.' }, { status: 403 });
      }
    }

    const now = new Date().toISOString();
    const document = await db.teacherDocument.create({
      data: {
        schoolId,
        teacherId: auth.userId,
        title: title.trim(),
        description: description?.trim() || '',
        category: category?.trim() || 'Général',
        subject: subject?.trim() || '',
        level: level?.trim() || '',
        period: period?.trim() || '',
        targetClassId: classId,
        content: content?.trim() || '',
        fileUrl: fileUrl || '',
        fileName: fileName || '',
        published: false,
        versions: [
          {
            id: crypto.randomUUID(),
            updatedAt: now,
            summary: 'Version initiale',
            content: content?.trim() || '',
            fileUrl: fileUrl || '',
            fileName: fileName || '',
          },
        ],
      },
    });

    return NextResponse.json({ document }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[Documents] POST error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// PUT /api/documents?id= – met à jour un document (auteur uniquement)
export async function PUT(request: NextRequest) {
  try {
    const auth = await authenticateRequestActive(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const body = await request.json();

    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });

    const existing = await db.teacherDocument.findFirst({ where: { id, deletedAt: null } });
    if (!existing) return NextResponse.json({ error: 'Document introuvable' }, { status: 404 });
    if (existing.teacherId !== auth.userId && auth.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }

    const nextClassId = body.targetClassId === undefined
      ? existing.targetClassId
      : (typeof body.targetClassId === 'string' ? body.targetClassId.trim() : null);
    if (nextClassId === null) return NextResponse.json({ error: 'Classe destinataire invalide.' }, { status: 400 });
    if (nextClassId) {
      const schoolClass = await db.schoolClass.findFirst({ where: { id: nextClassId, schoolId: existing.schoolId, deletedAt: null }, select: { id: true } });
      if (!schoolClass) return NextResponse.json({ error: 'Classe introuvable dans votre établissement.' }, { status: 400 });
      if (auth.role === 'TEACHER') {
        const assignedCourse = await db.course.findFirst({ where: { schoolId: existing.schoolId, classId: nextClassId, teacherId: auth.userId, deletedAt: null }, select: { id: true } });
        if (!assignedCourse) return NextResponse.json({ error: 'Vous ne pouvez partager qu’avec une classe que vous enseignez.' }, { status: 403 });
      }
    }

    const now = new Date().toISOString();
    const versions = Array.isArray(existing.versions) ? existing.versions : [];
    const nextVersions = [
      ...versions,
      {
        id: crypto.randomUUID(),
        updatedAt: now,
        summary: 'Mise à jour de contenu',
        content: body.content?.trim() || existing.content,
        fileUrl: body.fileUrl ?? existing.fileUrl,
        fileName: body.fileName ?? existing.fileName,
      },
    ];

    const document = await db.teacherDocument.update({
      where: { id },
      data: {
        title: body.title?.trim() || existing.title,
        description: body.description?.trim() ?? existing.description,
        category: body.category?.trim() || existing.category,
        subject: body.subject?.trim() ?? existing.subject,
        level: body.level?.trim() ?? existing.level,
        period: body.period?.trim() ?? existing.period,
        targetClassId: nextClassId,
        content: body.content?.trim() ?? existing.content,
        fileUrl: body.fileUrl ?? existing.fileUrl,
        fileName: body.fileName ?? existing.fileName,
        published: typeof body.published === 'boolean' ? body.published : existing.published,
        versions: nextVersions,
      },
    });

    const published = typeof body.published === 'boolean' ? body.published : existing.published;
    const shouldNotify = published && (!existing.published || nextClassId !== existing.targetClassId);
    if (shouldNotify) {
      notifyUser({
        schoolId: existing.schoolId,
        senderId: auth.userId,
        targetRole: 'STUDENT',
        targetClassId: nextClassId,
        title: `📄 Nouveau document : ${document.title}`,
        message: `${document.title} est disponible${nextClassId ? ' pour votre classe' : ' dans l’établissement'}.`,
        type: 'DOCUMENT',
        priority: 'NORMAL',
        metadata: { documentId: document.id, targetClassId: nextClassId },
      }).catch((error) => console.error('[Documents] Notification trigger error:', error));
    }

    return NextResponse.json({ document });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[Documents] PUT error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// DELETE /api/documents?id= – supprime un document (auteur ou admin)
export async function DELETE(request: NextRequest) {
  try {
    const auth = await authenticateRequestActive(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });

    const existing = await db.teacherDocument.findFirst({ where: { id, deletedAt: null } });
    if (!existing) return NextResponse.json({ error: 'Document introuvable' }, { status: 404 });
    if (existing.teacherId !== auth.userId && auth.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }

    await db.teacherDocument.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[Documents] DELETE error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
