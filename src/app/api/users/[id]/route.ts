import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth/authenticate';
import { notifyUser } from '@/services/notifications/notificationEngine';
import { hashPassword, verifyPassword } from '@/lib/password';
import { assertSchool } from '@/lib/api/rbac';
import { handleApiError } from '@/lib/api/errors';
import { auditFromRequest } from '@/lib/api/audit';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = authenticateRequest(request);
    const { id } = await params;

    // Un élève ne voit que son propre profil
    if (auth.role === 'STUDENT' && id !== auth.userId) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }

    // Parent can only view their own profile or their children
    if (auth.role === 'PARENT' && id !== auth.userId) {
      const child = await db.user.findUnique({
        where: { id },
        select: { parentId: true },
      });
      if (!child || child.parentId !== auth.userId) {
        return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
      }
    }

    const user = await db.user.findUnique({
      where: { id },
      include: {
        school: true,
        classEnrollments: {
          include: { class: true },
        },
        children: true,
        parent: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });
    }

    if (user.schoolId !== auth.schoolId) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }

    return NextResponse.json({ user });
  } catch (err: unknown) {
    return handleApiError(err);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = authenticateRequest(request);
    const { id } = await params;

    const isSelf = id === auth.userId;
    const isAdmin = auth.role === 'ADMIN';

    // Seul l'utilisateur lui-même ou un admin peut modifier le profil
    if (!isSelf && !isAdmin) {
      return NextResponse.json({ error: 'Vous ne pouvez modifier que votre propre profil' }, { status: 403 });
    }

    const body = await request.json();
    const { fullName, email, password, newPassword, oldPassword, role, photoUrl, parentId, isTitulaire, titulaireClassIds, gender, birthDate, specialty, qualification, phone, matricule, postName, address, parentPhone } = body;

    const existing = await db.user.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Multi-tenant : même école uniquement
    assertSchool(auth, existing.schoolId);

    // Gender must be M or F
    if (gender !== undefined && gender !== 'M' && gender !== 'F') {
      return NextResponse.json({ error: 'Le sexe doit être M ou F.' }, { status: 400 });
    }

    // Password change: validate old password
    if (newPassword !== undefined) {
      if (!oldPassword) {
        return NextResponse.json(
          { error: 'L\'ancien mot de passe est requis.' },
          { status: 400 }
        );
      }
      if (!(await verifyPassword(oldPassword, existing.password))) {
        return NextResponse.json(
          { error: 'L\'ancien mot de passe est incorrect.' },
          { status: 401 }
        );
      }
      if (newPassword.length < 4) {
        return NextResponse.json(
          { error: 'Le nouveau mot de passe doit contenir au moins 4 caractères.' },
          { status: 400 }
        );
      }
    }

    // Self-update : uniquement les champs de profil.
    // Privilégiés (role, parentId, isTitulaire, matricule, email, mot de passe direct…)
    // réservés à l'ADMIN — silencieusement ignorés côté self pour ne pas casser le front
    // (profile-page envoie notamment `email`).
    const roleChanged = isAdmin && role !== undefined && role !== existing.role;

    const user = await db.user.update({
      where: { id },
      data: {
        ...(fullName !== undefined && { fullName }),
        ...(photoUrl !== undefined && { photoUrl }),
        ...(gender !== undefined && { gender }),
        ...(birthDate !== undefined && { birthDate }),
        ...(specialty !== undefined && { specialty }),
        ...(qualification !== undefined && { qualification }),
        ...(phone !== undefined && { phone }),
        ...(postName !== undefined && { postName }),
        ...(address !== undefined && { address }),
        ...(parentPhone !== undefined && { parentPhone }),
        ...(newPassword !== undefined && { password: await hashPassword(newPassword) }),
        ...(isAdmin && email !== undefined && { email }),
        ...(isAdmin && password !== undefined && newPassword === undefined && { password: await hashPassword(password) }),
        ...(isAdmin && role !== undefined && { role }),
        ...(isAdmin && parentId !== undefined && { parentId: parentId || null }),
        ...(isAdmin && isTitulaire !== undefined && { isTitulaire }),
        ...(isAdmin && matricule !== undefined && { matricule }),
      },
      include: {
        school: true,
        classEnrollments: {
          include: { class: true },
        },
        titulaireClasses: true,
      },
    });

    // Synchroniser le titulariat : un professeur peut être titulaire de plusieurs classes
    // (relie SchoolClass.titulaireId à cet utilisateur) — réservé à l'ADMIN
    if (isAdmin && titulaireClassIds !== undefined) {
      const targetClasses = Array.isArray(titulaireClassIds) ? titulaireClassIds.filter(Boolean) : [];
      if (targetClasses.length > 0) {
        // Vérifier que toutes les classes appartiennent à la même école
        const classes = await db.schoolClass.findMany({
          where: { id: { in: targetClasses }, schoolId: user.schoolId },
          select: { id: true },
        });
        const validIds = classes.map((c) => c.id);
        await db.schoolClass.updateMany({
          where: { titulaireId: user.id },
          data: { titulaireId: null },
        });
        await db.schoolClass.updateMany({
          where: { id: { in: validIds } },
          data: { titulaireId: user.id },
        });
      } else {
        await db.schoolClass.updateMany({
          where: { titulaireId: user.id },
          data: { titulaireId: null },
        });
      }
    }

    // Audit d'un changement de rôle (action sensible)
    if (roleChanged) {
      await auditFromRequest(request, {
        schoolId: auth.schoolId,
        userId: auth.userId,
        action: 'USER_ROLE_CHANGE',
        entity: 'User',
        entityId: id,
        before: { role: existing.role },
        after: { role },
      });
    }

    // Notify the user in real-time that their profile was updated
    try { await notifyUser({
      schoolId: user.schoolId,
      userId: user.id,
      title: 'Profil Modifié 👤',
      message: 'Votre profil GradeUp a été mis à jour avec succès.',
      type: 'PROFILE',
      priority: 'LOW',
      metadata: { userId: user.id },
    }); } catch (e) { console.error('[Users] Notification failed (non-blocking):', e); }

    return NextResponse.json({ user });
  } catch (err: unknown) {
    return handleApiError(err);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = authenticateRequest(request);
    if (auth.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Seul un administrateur peut supprimer des utilisateurs' }, { status: 403 });
    }

    const { id } = await params;

    const existing = await db.user.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });
    }

    // Multi-tenant : un admin ne supprime que des comptes de sa propre école
    assertSchool(auth, existing.schoolId);

    await db.enrolledClass.deleteMany({ where: { userId: id } });
    await db.user.delete({ where: { id } });

    return NextResponse.json({ message: 'Utilisateur supprimé avec succès' });
  } catch (err: unknown) {
    return handleApiError(err);
  }
}
