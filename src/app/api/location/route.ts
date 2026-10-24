import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequestActive, AuthError } from '@/lib/auth/authenticate';

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequestActive(request);
    if (auth.role !== 'STUDENT') {
      return NextResponse.json({ error: 'Seuls les étudiants peuvent mettre à jour leur position' }, { status: 403 });
    }

    const { latitude, longitude, accuracy } = await request.json();

    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return NextResponse.json({ error: 'latitude et longitude requis' }, { status: 400 });
    }

    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return NextResponse.json({ error: 'Coordonnées invalides' }, { status: 400 });
    }

    const location = await db.liveLocation.upsert({
      where: { userId: auth.userId },
      update: { latitude, longitude, accuracy: accuracy || null, source: 'gps' },
      create: { userId: auth.userId, latitude, longitude, accuracy: accuracy || null, source: 'gps' },
    });

    return NextResponse.json({ success: true, location });
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Erreur interne';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequestActive(request);
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'userId requis' }, { status: 400 });
    }

    if (auth.role === 'PARENT') {
      const student = await db.user.findUnique({
        where: { id: userId },
        select: { parentId: true, schoolId: true, role: true, active: true, deletedAt: true },
      });
      if (!student || student.role !== 'STUDENT' || !student.active || student.deletedAt || student.parentId !== auth.userId || student.schoolId !== auth.schoolId) {
        return NextResponse.json({ error: 'Vous ne pouvez consulter que la position de vos enfants' }, { status: 403 });
      }
    } else if (auth.role === 'ADMIN') {
      const target = await db.user.findFirst({
        where: { id: userId, schoolId: auth.schoolId, deletedAt: null },
        select: { id: true },
      });
      if (!target) return NextResponse.json({ error: 'Utilisateur introuvable dans votre établissement.' }, { status: 404 });
    } else if (auth.role === 'TEACHER') {
      const target = await db.user.findFirst({
        where: { id: userId, schoolId: auth.schoolId, role: 'STUDENT', active: true, deletedAt: null },
        select: { id: true },
      });
      if (!target) return NextResponse.json({ error: 'Élève introuvable dans votre établissement.' }, { status: 404 });
      const enrollment = await db.enrolledClass.findFirst({ where: { userId, class: { schoolId: auth.schoolId } }, select: { classId: true } });
      if (!enrollment) return NextResponse.json({ error: 'Élève non inscrit dans cet établissement.' }, { status: 403 });
      const [teachesClass, isTitulaire] = await Promise.all([
        db.course.findFirst({ where: { schoolId: auth.schoolId, teacherId: auth.userId, classId: enrollment.classId, deletedAt: null }, select: { id: true } }),
        db.schoolClass.findFirst({ where: { id: enrollment.classId, schoolId: auth.schoolId, titulaireId: auth.userId, deletedAt: null }, select: { id: true } }),
      ]);
      if (!teachesClass && !isTitulaire) return NextResponse.json({ error: 'Cet élève ne relève pas de vos classes.' }, { status: 403 });
    } else {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }

    const location = await db.liveLocation.findUnique({
      where: { userId },
    });

    return NextResponse.json({ location });
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Erreur interne';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
