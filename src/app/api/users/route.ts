import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { authenticateRequest, authenticateRequestActive, AuthError } from '@/lib/auth/authenticate';
import { notifyUser } from '@/services/notifications/notificationEngine';
import { hashPassword } from '@/lib/password';
import { auditFromRequest } from '@/lib/api/audit';
import { generateReadableCode } from '@/lib/code-generation';

const adminUserCreateSchema = z.object({
  schoolId: z.string().trim().min(1),
  fullName: z.string().trim().min(3, 'Nom trop court (3 caractères minimum).'),
  email: z.string().trim().email('Adresse e-mail invalide.'),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères.'),
  role: z.enum(['ADMIN', 'TEACHER', 'STUDENT', 'PARENT', 'CAISSIER']),
  gender: z.enum(['M', 'F'], { error: 'Le sexe (M ou F) est obligatoire.' }),
  dateOfBirth: z.coerce.date().optional(),
  birthDate: z.coerce.date().optional(),
  classId: z.string().trim().min(1).optional(),
  specialty: z.string().trim().optional(),
  phone: z.string().trim().optional(),
}).passthrough().superRefine((value, ctx) => {
  if ((value.role === 'STUDENT' || value.role === 'TEACHER') && !value.dateOfBirth && !value.birthDate) {
    ctx.addIssue({ code: 'custom', path: ['dateOfBirth'], message: 'La date de naissance est obligatoire pour un élève ou un professeur.' });
  }
  if (value.role === 'STUDENT' && !value.classId) {
    ctx.addIssue({ code: 'custom', path: ['classId'], message: 'La classe est obligatoire pour un élève.' });
  }
  if (value.role === 'TEACHER' && !value.specialty) {
    ctx.addIssue({ code: 'custom', path: ['specialty'], message: 'La spécialité est obligatoire pour un professeur.' });
  }
  if (value.role === 'TEACHER' && !value.phone) {
    ctx.addIssue({ code: 'custom', path: ['phone'], message: 'Le téléphone est obligatoire pour un professeur.' });
  }
});

/** Re-enrôle un élève dans une classe existante; les noms ne créent jamais une classe implicite. */
async function syncStudentClassEnrollment(userId: string, schoolId: string, classId?: string, className?: string) {
  const schoolClass = classId
    ? await db.schoolClass.findFirst({ where: { id: classId, schoolId, deletedAt: null }, select: { id: true } })
    : className
      ? await db.schoolClass.findFirst({ where: { schoolId, name: className, deletedAt: null }, select: { id: true } })
      : null;
  if (!schoolClass) return null;
  await db.enrolledClass.deleteMany({ where: { userId } });
  await db.enrolledClass.create({ data: { userId, classId: schoolClass.id } });
  return schoolClass.id;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequestActive(request);
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId');
    const role = searchParams.get('role');
    const classId = searchParams.get('classId');
    const parentId = searchParams.get('parentId');
    const search = searchParams.get('search');
    const teacherId = searchParams.get('teacherId');

    if (!schoolId || schoolId !== auth.schoolId) {
      return NextResponse.json({ error: 'schoolId invalide' }, { status: 400 });
    }

    const status = searchParams.get('status');
    const includeDeleted = searchParams.get('includeDeleted') === 'true';

    const where: Record<string, unknown> = { schoolId };

    if (auth.role === 'ADMIN' && includeDeleted) {
      // Only an administrator may include soft-deleted users.
    } else {
      where.deletedAt = null;
    }

    if (status === 'active') {
      where.active = true;
    } else if (status === 'inactive') {
      where.active = false;
    }

    if (auth.role === 'TEACHER') {
      if (role !== 'STUDENT' || (teacherId && teacherId !== auth.userId) || parentId) {
        return NextResponse.json({ error: 'Accès réservé aux élèves de vos classes.' }, { status: 403 });
      }
      const teacherClasses = await db.course.findMany({
        where: { schoolId, teacherId: auth.userId, deletedAt: null },
        select: { classId: true },
        distinct: ['classId'],
      });
      const tClassIds = teacherClasses.map((c) => c.classId);
      if (classId && !tClassIds.includes(classId)) {
        return NextResponse.json({ error: 'Accès non autorisé à cette classe.' }, { status: 403 });
      }
      where.role = 'STUDENT';
      where.classEnrollments = { some: { classId: classId ? classId : { in: tClassIds } } };
      if (tClassIds.length === 0) where.id = 'none';
    } else if (auth.role === 'PARENT') {
      if ((role && role !== 'STUDENT') || (parentId && parentId !== auth.userId) || teacherId) {
        return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
      }
      where.role = 'STUDENT';
      where.parentId = auth.userId;
    } else if (auth.role === 'CAISSIER') {
      if (role !== 'STUDENT' || parentId || teacherId) {
        return NextResponse.json({ error: 'La caisse ne peut consulter que les élèves.' }, { status: 403 });
      }
      where.role = 'STUDENT';
      if (classId) where.classEnrollments = { some: { classId } };
    } else if (auth.role === 'STUDENT') {
      if ((role && role !== 'STUDENT') || classId || parentId || teacherId) {
        return NextResponse.json({ error: 'Accès limité à votre profil.' }, { status: 403 });
      }
      where.id = auth.userId;
      where.role = 'STUDENT';
    } else if (auth.role === 'ADMIN') {
      if (role) where.role = role;
      if (classId) where.classEnrollments = { some: { classId } };
      if (parentId) where.parentId = parentId;
    } else {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }

    if (auth.role !== 'ADMIN') where.active = true;

    // Full-text search. Parent codes are deliberately searchable only by admins.
    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { matricule: { contains: search, mode: 'insensitive' } },
        ...(auth.role === 'ADMIN' ? [{ parentCode: { contains: search, mode: 'insensitive' } }] : []),
      ];
    }

    if (auth.role === 'ADMIN') {
      const users = await db.user.findMany({
        where,
        omit: { password: true },
        include: {
          school: true,
          classEnrollments: { include: { class: true } },
          children: {
            select: {
              id: true,
              fullName: true,
              role: true,
              parentCode: true,
              photoUrl: true,
              matricule: true,
              active: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
      return NextResponse.json({ users });
    }

    const users = await db.user.findMany({
      where,
      select: {
        id: true,
        schoolId: true,
        fullName: true,
        email: auth.role === 'PARENT' ? false : true,
        role: true,
        photoUrl: true,
        matricule: true,
        active: true,
        ...(auth.role === 'PARENT' ? {} : { phone: true, gender: true, birthDate: true, isTitulaire: true }),
        school: { select: { id: true, name: true, logoUrl: true, academicYear: true } },
        classEnrollments: {
          select: { classId: true, class: { select: { id: true, name: true, level: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ users });
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Erreur serveur';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequestActive(request);
    if (auth.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Accès non autorisé. Action réservée aux administrateurs.' }, { status: 403 });
    }
    const body = await request.json();
    const userValidation = adminUserCreateSchema.safeParse({
      ...body,
      dateOfBirth: body?.dateOfBirth ?? body?.birthDate,
    });
    if (!userValidation.success) {
      return NextResponse.json({ error: 'Informations utilisateur invalides.', details: userValidation.error.flatten().fieldErrors }, { status: 400 });
    }
    const {
      schoolId,
      fullName,
      email,
      password,
      role,
      photoUrl,
      parentId,
      classId,
      className,
      isTitulaire,
      titulaireClassIds,
      postName,
      gender,
      birthDate,
      matricule,
      specialty,
      qualification,
      phone,
      parentPhone,
      parentPhone2,
      academicYear,
      section,
      bloodType,
      nationality,
      address,
      parentEmail,
      ine,
      tuteur,
      contactTuteur,
      allergies,
      assurance,
      cardIssuedDate,
      cardExpiryDate,
      useFreeCard,
      paymentAuthorized,
    } = body;

    // Admin uniquement, et admin de la même école
    if (auth.schoolId !== schoolId) {
      return NextResponse.json({ error: 'Accès non autorisé. Action réservée aux administrateurs.' }, { status: 403 });
    }

    // Gestion monétisation carte (uniquement si flux de création de carte élève/professeur)
    const isCardFlow = body.isCardCreation === true || useFreeCard !== undefined || paymentAuthorized !== undefined;
    if (isCardFlow) {
      const freeCardField = role === 'STUDENT' ? 'freeStudentCardUsed' : role === 'TEACHER' ? 'freeTeacherCardUsed' : null;
      if (paymentAuthorized === true) {
        // GeniusPay has redirected the admin back after payment.
      } else if (useFreeCard !== true || !freeCardField) {
        return NextResponse.json({ error: 'Création gratuite disponible uniquement pour un élève ou un professeur.' }, { status: 400 });
      } else {
        const claimed = await db.user.updateMany({
          where: { id: auth.userId, schoolId, role: 'ADMIN', [freeCardField]: false },
          data: { [freeCardField]: true },
        });
        if (claimed.count !== 1) {
          return NextResponse.json({ error: `La carte gratuite ${role === 'STUDENT' ? 'élève' : 'professeur'} a déjà été utilisée.` }, { status: 409 });
        }
      }
    }

    const existing = await db.user.findFirst({
      where: { schoolId, OR: [{ email }, { fullName, role }] },
    });

    if (existing) {
      return NextResponse.json(
        { error: `Un compte avec cette adresse e-mail ou ce nom/rôle existe déjà dans cet établissement.` },
        { status: 409 }
      );
    }

    // Validation Zod V3 : gender obligatoire M/F
    const genderSchema = z.enum(['M', 'F'], { error: 'Le sexe (M ou F) est obligatoire.' });
    const genderVal = genderSchema.safeParse(gender);
    if (!genderVal.success) {
      return NextResponse.json(
        { error: genderVal.error.issues[0]?.message || 'Le sexe (M ou F) est obligatoire.' },
        { status: 400 }
      );
    }
    const g = genderVal.data;

    // dateOfBirth obligatoire pour STUDENT/TEACHER
    let birthDateVal = body.dateOfBirth || birthDate || '';
    if (role === 'STUDENT' || role === 'TEACHER') {
      if (!birthDateVal) {
        return NextResponse.json(
          { error: 'La date de naissance est obligatoire pour ce rôle.' },
          { status: 400 }
        );
      }
      const dob = new Date(birthDateVal);
      if (isNaN(dob.getTime())) {
        return NextResponse.json(
          { error: 'La date de naissance est invalide.' },
          { status: 400 }
        );
      }
      birthDateVal = dob.toISOString();
    }

    // STUDENT : matricule auto-généré MAT-YYYY-XXXX si absent
    let matriculeVal = matricule || '';
    if (role === 'STUDENT' && !matriculeVal) {
      matriculeVal = `MAT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
      while (await db.user.findFirst({ where: { matricule: matriculeVal } })) {
        matriculeVal = `MAT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
      }
    }

    if (role === 'STUDENT') {
      const targetClass = await db.schoolClass.findFirst({ where: { id: classId, schoolId, deletedAt: null }, select: { id: true } });
      if (!targetClass) return NextResponse.json({ error: 'Classe introuvable dans cet établissement.' }, { status: 400 });
    }

    if (parentId) {
      const parent = await db.user.findFirst({ where: { id: parentId, schoolId, role: 'PARENT', deletedAt: null }, select: { id: true } });
      if (!parent) return NextResponse.json({ error: 'Le parent sélectionné n’appartient pas à cet établissement.' }, { status: 400 });
    }

    // TEACHER : specialty + phone obligatoires
    let specialtyVal = '';
    let phoneVal = phone || '';
    if (role === 'TEACHER') {
      specialtyVal = (specialty || '').trim();
      phoneVal = (phone || '').trim();
      if (!specialtyVal) {
        return NextResponse.json(
          { error: 'La spécialité est obligatoire pour un professeur.' },
          { status: 400 }
        );
      }
      if (!phoneVal) {
        return NextResponse.json(
          { error: 'Le numéro de téléphone est obligatoire pour un professeur.' },
          { status: 400 }
        );
      }
    }

    let parentCodeVal = generateReadableCode('P');
    while (await db.user.findUnique({ where: { parentCode: parentCodeVal } })) {
      parentCodeVal = generateReadableCode('P');
    }

    const issued = new Date().toISOString().slice(0, 10);
    const expiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const user = await db.user.create({
      data: {
        schoolId,
        fullName,
        email: email || '',
        password: await hashPassword(password),
        role,
        photoUrl: photoUrl || '',
        postName: postName || '',
        gender: g,
        birthDate: birthDateVal,
        matricule: matriculeVal,
        specialty: specialtyVal,
        phone: phoneVal,
        parentPhone: parentPhone || '',
        parentPhone2: parentPhone2 || '',
        academicYear: academicYear || '',
        section: section || '',
        bloodType: bloodType || '',
        nationality: nationality || '',
        address: address || '',
        parentEmail: parentEmail || '',
        ine: ine || '',
        tuteur: tuteur || '',
        contactTuteur: contactTuteur || '',
        allergies: allergies || '',
        assurance: assurance || '',
        cardId: `${(fullName.trim().charAt(0) || 'X').toUpperCase()}${Date.now().toString().slice(-8)}`,
        cardIssuedDate: issued,
        cardExpiryDate: expiry,
        parentId: parentId || null,
        parentCode: parentCodeVal,
        isTitulaire: !!isTitulaire,
      },
      include: {
        school: true,
        classEnrollments: {
          include: { class: true },
        },
      },
    });

    if (classId && role === 'STUDENT') {
      await db.enrolledClass.create({ data: { userId: user.id, classId } });
    }

    // Synchroniser le titulariat (SchoolClass.titulaireId)
    if (Array.isArray(titulaireClassIds) && titulaireClassIds.filter(Boolean).length > 0) {
      const classes = await db.schoolClass.findMany({
        where: { id: { in: titulaireClassIds.filter(Boolean) }, schoolId },
        select: { id: true },
      });
      const validIds = classes.map((c) => c.id);
      if (validIds.length > 0) {
        await db.schoolClass.updateMany({
          where: { id: { in: validIds } },
          data: { titulaireId: user.id },
        });
      }
    }

    const userWithEnrollments = await db.user.findUnique({
      where: { id: user.id },
      include: {
        school: true,
        classEnrollments: {
          include: { class: true },
        },
      },
    });

    await auditFromRequest(request, {
      schoolId,
      userId: auth.userId,
      action: 'USER_CREATE',
      entity: 'User',
      entityId: user.id,
      after: { role, email: user.email, gender: user.gender, classId: classId || null },
    });

    return NextResponse.json({ user: userWithEnrollments }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Erreur serveur';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PATCH: Toggle user active status or update user info
export async function PATCH(request: NextRequest) {
  try {
    const auth = await authenticateRequestActive(request);
    const body = await request.json();
    const {
      userId,
      active,
      fullName,
      email,
      postName,
      gender,
      birthDate,
      matricule,
      specialty,
      qualification,
      phone,
      parentPhone,
      parentPhone2,
      academicYear,
      section,
      photoUrl,
      bloodType,
      nationality,
      address,
      parentEmail,
      cardIssuedDate,
      cardExpiryDate,
      ine,
      tuteur,
      contactTuteur,
      allergies,
      assurance,
      isTitulaire,
      titulaireClassIds,
      classId,
      className,
    } = body;

    if (!userId) {
      return NextResponse.json({ error: 'userId requis.' }, { status: 400 });
    }

    // Admin uniquement, et la cible doit être dans la même école
    if (auth.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Accès non autorisé. Action réservée aux administrateurs.' }, { status: 403 });
    }

    const targetUser = await db.user.findUnique({ where: { id: userId }, select: { id: true, schoolId: true, active: true } });
    if (!targetUser || targetUser.schoolId !== auth.schoolId) {
      return NextResponse.json({ error: 'Utilisateur introuvable dans votre établissement.' }, { status: 403 });
    }

    const updateData: Record<string, unknown> = {};
    if (active !== undefined) {
      if (typeof active !== 'boolean') return NextResponse.json({ error: 'Le statut du compte doit être un booléen.' }, { status: 400 });
      updateData.active = active;
      if (active !== targetUser.active) updateData.authVersion = { increment: 1 };
    }
    if (fullName !== undefined) updateData.fullName = fullName;
    if (email !== undefined) updateData.email = email;
    if (postName !== undefined) updateData.postName = postName;
    if (gender !== undefined) {
      if (gender !== 'M' && gender !== 'F') {
        return NextResponse.json({ error: 'Le sexe doit être M ou F.' }, { status: 400 });
      }
      updateData.gender = gender;
    }
    if (birthDate !== undefined) updateData.birthDate = birthDate;
    if (matricule !== undefined) updateData.matricule = matricule;
    if (specialty !== undefined) updateData.specialty = specialty;
    if (qualification !== undefined) updateData.qualification = qualification;
    if (phone !== undefined) updateData.phone = phone;
    if (parentPhone !== undefined) updateData.parentPhone = parentPhone;
    if (parentPhone2 !== undefined) updateData.parentPhone2 = parentPhone2;
    if (academicYear !== undefined) updateData.academicYear = academicYear;
    if (section !== undefined) updateData.section = section;
    if (photoUrl !== undefined) updateData.photoUrl = photoUrl;
    if (bloodType !== undefined) updateData.bloodType = bloodType;
    if (nationality !== undefined) updateData.nationality = nationality;
    if (address !== undefined) updateData.address = address;
    if (parentEmail !== undefined) updateData.parentEmail = parentEmail;
    if (cardIssuedDate !== undefined) updateData.cardIssuedDate = cardIssuedDate;
    if (cardExpiryDate !== undefined) updateData.cardExpiryDate = cardExpiryDate;
    if (ine !== undefined) updateData.ine = ine;
    if (tuteur !== undefined) updateData.tuteur = tuteur;
    if (contactTuteur !== undefined) updateData.contactTuteur = contactTuteur;
    if (allergies !== undefined) updateData.allergies = allergies;
    if (assurance !== undefined) updateData.assurance = assurance;
    if (isTitulaire !== undefined) updateData.isTitulaire = isTitulaire;

    const user = await db.user.update({
      where: { id: userId },
      data: updateData,
      include: {
        school: true,
        classEnrollments: { include: { class: true } },
        children: true,
      },
    });

    // Synchroniser le titulariat (SchoolClass.titulaireId)
    if (titulaireClassIds !== undefined) {
      const targetClasses = Array.isArray(titulaireClassIds) ? titulaireClassIds.filter(Boolean) : [];
      await db.schoolClass.updateMany({
        where: { titulaireId: userId },
        data: { titulaireId: null },
      });
      if (targetClasses.length > 0) {
        const classes = await db.schoolClass.findMany({
          where: { id: { in: targetClasses }, schoolId: user.schoolId },
          select: { id: true },
        });
        const validIds = classes.map((c) => c.id);
        if (validIds.length > 0) {
          await db.schoolClass.updateMany({
            where: { id: { in: validIds } },
            data: { titulaireId: userId },
          });
        }
      }
    }

    if (user.role === 'STUDENT' && (classId !== undefined || className !== undefined)) {
      await syncStudentClassEnrollment(user.id, user.schoolId, classId, className);
    }

    // Reflect access changes immediately; a status transition also revokes old
    // access/refresh tokens so they cannot become usable again later.
    try { await notifyUser({
      schoolId: user.schoolId,
      userId: user.id,
      title: active !== undefined && active !== targetUser.active
        ? (active ? 'Compte activé' : 'Compte désactivé')
        : 'Profil modifié 👤',
      message: active !== undefined && active !== targetUser.active
        ? (active ? 'Votre compte GradeUp a été activé par la direction.' : 'Votre compte GradeUp a été désactivé par la direction.')
        : 'Vos informations de profil ont été mises à jour par l’administration.',
      type: active !== undefined && active !== targetUser.active ? 'SYSTEM' : 'PROFILE',
      priority: active !== undefined && active !== targetUser.active ? 'HIGH' : 'LOW',
      metadata: { userId: user.id, active: user.active },
    }); } catch (e) { console.error('[Users PATCH] Notification failed (non-blocking):', e); }

    return NextResponse.json({ user });
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Erreur interne.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE: Remove a user
export async function DELETE(request: NextRequest) {
  try {
    const auth = await authenticateRequestActive(request);
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'userId requis.' }, { status: 400 });
    }

    // Admin uniquement, et la cible doit être dans la même école
    if (auth.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Accès non autorisé. Action réservée aux administrateurs.' }, { status: 403 });
    }

    const targetUser = await db.user.findUnique({ where: { id: userId }, select: { id: true, schoolId: true } });
    if (!targetUser || targetUser.schoolId !== auth.schoolId) {
      return NextResponse.json({ error: 'Utilisateur introuvable dans votre établissement.' }, { status: 403 });
    }

    // Check if user has children (parent)
    const children = await db.user.findMany({ where: { parentId: userId } });
    if (children.length > 0) {
      return NextResponse.json(
        { error: 'Impossible de supprimer un utilisateur lié à d\'autres comptes.' },
        { status: 400 }
      );
    }

    await db.user.delete({ where: { id: userId } });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Erreur interne.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
