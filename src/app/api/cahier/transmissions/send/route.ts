import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, assertSchool } from '@/lib/api/rbac';
import { handleApiError } from '@/lib/api/errors';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['ADMIN', 'TEACHER']);
    const body = await request.json();
    const { evaluationIds } = body;
    // Un enseignant n'envoi jamais au nom d'un autre : teacherId forcé à soi-même
    const teacherId = auth.role === 'TEACHER' ? auth.userId : body.teacherId;

    if (!evaluationIds || !Array.isArray(evaluationIds) || evaluationIds.length === 0 || !teacherId) {
      return NextResponse.json({ error: 'evaluationIds (array) et teacherId requis' }, { status: 400 });
    }

    const results: string[] = [];
    const errors: { evaluationId: string; error: string }[] = [];

    for (const evaluationId of evaluationIds) {
      try {
        // Récupérer l'évaluation et vérifier les droits
        const evaluation = await db.cahierEvaluation.findUnique({
          where: { id: evaluationId, deletedAt: null },
          include: {
            class: {
              include: {
                titulaire: { select: { id: true, fullName: true } },
              },
            },
            course: { select: { id: true, name: true, classId: true } },
          },
        });

        if (!evaluation) {
          errors.push({ evaluationId, error: 'Évaluation introuvable' });
          continue;
        }

        // Multi-tenant : l'évaluation doit appartenir à l'école de la session
        assertSchool(auth, evaluation.schoolId);

        // Vérifier que le professeur est bien l'auteur de l'évaluation
        if (evaluation.teacherId !== auth.userId) {
          errors.push({ evaluationId, error: 'Non autorisé : vous n\'êtes pas l\'auteur de cette évaluation' });
          continue;
        }

        // Vérifier qu'il y a un titulaire
        if (!evaluation.class.titulaireId) {
          errors.push({ evaluationId, error: 'Cette classe n\'a pas de professeur titulaire assigné' });
          continue;
        }

        const titulaireId = evaluation.class.titulaireId;

        // Vérifier si une transmission existe déjà
        let transmission = await db.cotationTransmission.findUnique({
          where: { evaluationId_titulaireId: { evaluationId, titulaireId } },
        });

        const now = new Date();

        if (transmission) {
          // Renvoyer - mettre à jour
          await db.cotationTransmission.update({
            where: { id: transmission.id },
            data: {
              status: transmission.status === 'PENDING' ? 'SENT' : 'RESENT',
              sentAt: new Date(),
              lastResentAt: new Date(),
              resentCount: { increment: 1 },
            },
          });
        } else {
          // Nouveau envoi
          await db.cotationTransmission.create({
            data: {
              schoolId: evaluation.schoolId,
              evaluationId,
              classId: evaluation.classId,
              courseId: evaluation.courseId,
              teacherId,
              titulaireId: evaluation.class.titulaireId!,
              status: 'SENT',
              sentAt: new Date(),
            },
          });
        }

        // Notifier le titulaire
        const courseName = evaluation.course?.name ?? 'Cours';
        await db.notification.create({
          data: {
            schoolId: evaluation.schoolId,
            userId: evaluation.class.titulaireId!,
            senderId: teacherId,
            title: 'Nouvelles cotations reçues',
            message: "Le professeur a envoyé les cotations pour \"" + evaluation.title + "\" (" + courseName + ")",
            type: 'COTATION',
            targetRole: 'TEACHER',
            targetClassId: evaluation.classId,
            metadata: JSON.stringify({ evaluationId: evaluationId, evaluationTitle: evaluation.title }),
          },
        });
      } catch (err) {
        console.error(`Erreur envoi évaluation ${evaluationId}:`, err);
        errors.push({ evaluationId, error: err instanceof Error ? err.message : 'Erreur inconnue' });
      }
    }

    return NextResponse.json({
      success: errors.length === 0,
      sent: evaluationIds.length - errors.length,
      errors,
      message: `${evaluationIds.length - errors.length} évaluation(s) envoyée(s) au titulaire`,
    });
  } catch (error: unknown) {
    return handleApiError(error);
  }
}