import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequestActive, AuthError } from '@/lib/auth/authenticate';

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
      select: { id: true, name: true, schoolId: true },
    });

    if (!destinationClass || destinationClass.schoolId !== auth.schoolId) {
      return NextResponse.json({ error: 'Classe de destination introuvable.' }, { status: 404 });
    }

    // Vérifier les élèves
    const validStudents = await db.user.findMany({
      where: {
        id: { in: studentIds },
        schoolId: auth.schoolId,
        role: 'STUDENT',
      },
      select: { id: true, fullName: true },
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
