import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { notifyUser } from '@/services/notifications/notificationEngine';

async function generateUniqueCardId(fullName: string) {
  const firstLetter = fullName.trim().charAt(0).toUpperCase() || 'X';
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const baseId = `${firstLetter}${year}${month}`;

  let cardId = baseId;
  let counter = 1;
  while (true) {
    const existing = await db.user.findUnique({ where: { cardId } });
    if (!existing) {
      break;
    }
    cardId = `${baseId}${counter}`;
    counter++;
  }
  return cardId;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const schoolId = searchParams.get('schoolId');
  const action = searchParams.get('action');
  const classId = searchParams.get('classId');
  const userId = searchParams.get('userId');

  console.log('GeniusPay success callback triggered with params:', { schoolId, action, classId, userId });

  if (schoolId && action) {
    try {
      if (action === 'generate-all' || (action === 'generate-class' && classId)) {
        const whereClause: Record<string, any> = {
          schoolId,
          role: 'STUDENT',
          cardId: null, // generate only for those who don't have it
        };
        
        if (action === 'generate-class' && classId !== 'all') {
          if (classId === 'unassigned') {
            whereClause.classEnrollments = { none: {} };
          } else {
            whereClause.classEnrollments = { some: { classId } };
          }
        }

        const students = await db.user.findMany({ where: whereClause });
        
        for (const student of students) {
          const newCardId = await generateUniqueCardId(student.fullName);
          await db.user.update({
            where: { id: student.id },
            data: { cardId: newCardId }
          });

          // 1. Notify Student in real-time
          try { await notifyUser({
            schoolId,
            userId: student.id,
            title: 'Carte Élève Générée 🆔',
            message: `Félicitations ! Votre carte d'identité scolaire GradeUp a été générée. Code : ${newCardId}`,
            type: 'CARD',
            priority: 'NORMAL',
            metadata: { cardId: newCardId, studentName: student.fullName },
          }); } catch (e) { console.error('[GeniusPay] Student notification failed (non-blocking):', e); }

          // 2. Notify Parent if linked
          if (student.parentId) {
            try { await notifyUser({
              schoolId,
              userId: student.parentId,
              title: 'Carte Scolaire Enfant Disponible 🆔',
              message: `La carte d'identité scolaire GradeUp de votre enfant ${student.fullName} a été générée.`,
              type: 'CARD',
              priority: 'NORMAL',
              metadata: { cardId: newCardId, studentId: student.id, studentName: student.fullName },
            }); } catch (e) { console.error('[GeniusPay] Parent notification failed (non-blocking):', e); }
          }
        }
      } else if (action === 'generate-single' && userId && userId !== 'new-card') {
        const student = await db.user.findUnique({ where: { id: userId } });
        if (student) {
          const newCardId = await generateUniqueCardId(student.fullName);
          await db.user.update({
            where: { id: userId },
            data: { cardId: newCardId }
          });

          // 1. Notify Student in real-time
          try { await notifyUser({
            schoolId,
            userId: student.id,
            title: 'Carte Élève Générée 🆔',
            message: `Félicitations ! Votre carte d'identité scolaire GradeUp a été générée. Code : ${newCardId}`,
            type: 'CARD',
            priority: 'NORMAL',
            metadata: { cardId: newCardId, studentName: student.fullName },
          }); } catch (e) { console.error('[GeniusPay] Student notification failed (non-blocking):', e); }

          // 2. Notify Parent if linked
          if (student.parentId) {
            try { await notifyUser({
              schoolId,
              userId: student.parentId,
              title: 'Carte Scolaire Enfant Disponible 🆔',
              message: `La carte d'identité scolaire GradeUp de votre enfant ${student.fullName} a été générée.`,
              type: 'CARD',
              priority: 'NORMAL',
              metadata: { cardId: newCardId, studentId: student.id, studentName: student.fullName },
            }); } catch (e) { console.error('[GeniusPay] Parent notification failed (non-blocking):', e); }
          }
        }
      }
    } catch (e) {
      console.error('Error generating cards in GeniusPay success callback:', e);
    }
  }

  // Redirect client back to admin-cards with query param for toast notification
  return new Response(`
    <html>
      <head>
        <title>Redirection...</title>
        <script>
          window.location.href = '/?page=admin-cards&payment=success';
        </script>
      </head>
      <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc;">
        <div style="text-align: center; padding: 2rem; background: white; border-radius: 1rem; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
          <div style="font-size: 3rem; margin-bottom: 1rem;">✅</div>
          <h2 style="color: #1e293b; margin: 0 0 0.5rem 0;">Paiement Réussi !</h2>
          <p style="color: #64748b; margin: 0 0 1.5rem 0;">Vos cartes d'identité ont été générées.</p>
          <p style="color: #94a3b8; font-size: 0.875rem;">Redirection vers GradeUp...</p>
        </div>
      </body>
    </html>
  `, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}
