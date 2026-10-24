import { NextRequest } from 'next/server';
import { jsPDF } from 'jspdf';
import { db } from '@/lib/db';
import { requireActiveAuth } from '@/lib/api/rbac';
import { ApiError, handleApiError } from '@/lib/api/errors';

type GradeRow = { course?: string; score?: number; max?: number; comment?: string; coefficient?: number };

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireActiveAuth(req, ['ADMIN', 'TEACHER', 'STUDENT', 'PARENT']);
    const { id } = await params;
    const bulletin = await db.bulletin.findFirst({
      where: { id, schoolId: auth.schoolId, deletedAt: null },
      include: {
        student: { select: { id: true, fullName: true, email: true, gender: true, matricule: true, parentId: true } },
        class: { select: { id: true, name: true, level: true, titulaireId: true, titulaire: { select: { fullName: true } } } },
        school: { select: { name: true, logoUrl: true, currency: true } },
        validatedByAdmin: { select: { fullName: true } },
      },
    });
    if (!bulletin) throw new ApiError('Bulletin introuvable dans cet établissement.', 404, 'NOT_FOUND');
    if (auth.role === 'STUDENT' && bulletin.studentId !== auth.userId) throw new ApiError('Accès refusé.', 403, 'OWNERSHIP_FORBIDDEN');
    if (auth.role === 'PARENT' && bulletin.student.parentId !== auth.userId) throw new ApiError('Ce bulletin ne concerne pas votre enfant.', 403, 'OWNERSHIP_FORBIDDEN');
    if (auth.role === 'TEACHER' && bulletin.class.titulaireId !== auth.userId) throw new ApiError('Accès réservé au titulaire de cette classe.', 403, 'OWNERSHIP_FORBIDDEN');
    if (['STUDENT', 'PARENT'].includes(auth.role) && bulletin.status !== 'PUBLISHED') throw new ApiError('Le bulletin sera téléchargeable après sa publication.', 409, 'BULLETIN_NOT_PUBLISHED');

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const rows = Array.isArray(bulletin.gradesSnapshot) ? bulletin.gradesSnapshot as GradeRow[] : [];
    const attendance = typeof bulletin.attendanceSummary === 'object' && bulletin.attendanceSummary !== null && !Array.isArray(bulletin.attendanceSummary)
      ? bulletin.attendanceSummary as Record<string, number>
      : {};
    let y = 18;
    const line = (text: string, x = 18, size = 10, bold = false) => {
      pdf.setFont('helvetica', bold ? 'bold' : 'normal');
      pdf.setFontSize(size);
      const wrapped = pdf.splitTextToSize(text, pageWidth - 36);
      pdf.text(wrapped, x, y);
      y += Math.max(6, wrapped.length * 5);
    };

    pdf.setFillColor(26, 75, 148);
    pdf.rect(0, 0, pageWidth, 42, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(16);
    pdf.text(bulletin.school.name || 'Établissement scolaire', 18, 19);
    pdf.setFontSize(12);
    pdf.text('BULLETIN SCOLAIRE OFFICIEL', 18, 31);
    pdf.setTextColor(30, 41, 59);
    y = 54;
    line(`Période ${bulletin.term} · Année scolaire ${bulletin.academicYear}`, 18, 11, true);
    line(`Élève : ${bulletin.student.fullName}`, 18, 10, true);
    line(`Matricule : ${bulletin.student.matricule || '—'} · Sexe : ${bulletin.student.gender || '—'}`);
    line(`Classe : ${bulletin.class.name}${bulletin.class.level ? ` (${bulletin.class.level})` : ''}`);
    y += 3;

    pdf.setFillColor(241, 245, 249);
    pdf.rect(18, y - 4, pageWidth - 36, 8, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.text('MATIÈRE', 20, y + 1);
    pdf.text('NOTE', 112, y + 1);
    pdf.text('MAX.', 132, y + 1);
    pdf.text('COEF.', 151, y + 1);
    pdf.text('COMMENTAIRE', 168, y + 1);
    y += 10;
    pdf.setFont('helvetica', 'normal');
    for (const row of rows) {
      if (y > 260) { pdf.addPage(); y = 18; }
      pdf.setFontSize(8);
      pdf.text(pdf.splitTextToSize(String(row.course || 'Matière'), 78).slice(0, 1), 20, y);
      pdf.text(String(row.score ?? '—'), 112, y);
      pdf.text(String(row.max ?? '—'), 132, y);
      pdf.text(String(row.coefficient ?? '—'), 151, y);
      pdf.text(pdf.splitTextToSize(String(row.comment || '—'), 26).slice(0, 1), 168, y);
      pdf.setDrawColor(220, 226, 234);
      pdf.line(18, y + 2, pageWidth - 18, y + 2);
      y += 8;
    }

    y += 7;
    if (y > 250) { pdf.addPage(); y = 20; }
    line(`Moyenne générale : ${bulletin.average.toFixed(2)} / 20`, 18, 12, true);
    line(`Rang : ${bulletin.rank ?? '—'} · Mention : ${bulletin.mention || '—'}`);
    line(`Présences : ${attendance.present ?? 0} · Absences : ${attendance.absent ?? 0} · Retards : ${attendance.late ?? 0}`);
    if (bulletin.appreciation) line(`Appréciation : ${bulletin.appreciation}`);
    y += 22;
    pdf.setDrawColor(100, 116, 139);
    pdf.line(22, y, 82, y);
    pdf.line(pageWidth - 82, y, pageWidth - 22, y);
    pdf.setFontSize(9);
    pdf.text('Titulaire de classe', 34, y + 6);
    pdf.text('Administration', pageWidth - 66, y + 6);
    pdf.setFontSize(8);
    pdf.setTextColor(100, 116, 139);
    pdf.text(`Publié le ${bulletin.publishedAt?.toLocaleDateString('fr-FR') || '—'} · ${bulletin.school.name}`, 18, 286);

    const arrayBuffer = pdf.output('arraybuffer');
    const fileName = `bulletin-${bulletin.student.matricule || bulletin.studentId}-T${bulletin.term}-${bulletin.academicYear}.pdf`;
    return new Response(new Uint8Array(arrayBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
