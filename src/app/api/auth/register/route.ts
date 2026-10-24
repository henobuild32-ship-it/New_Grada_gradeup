import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/password';
import { setAuthCookies } from '@/lib/auth/session';
import { clientIp, rateLimitResponse } from '@/lib/api/rate-limit';
import { persistentRateLimit } from '@/lib/api/persistent-rate-limit';
import { normalizeInviteCode, normalizeStudentCode } from '@/lib/code-format';
import { generateReadableCode } from '@/lib/code-generation';
import { notifyUser } from '@/services/notifications/notificationEngine';

const registerSchema = z.object({
  gender: z.enum(['M', 'F'], { error: 'Le sexe est obligatoire (M ou F).' }),
  dateOfBirth: z.coerce.date({ error: 'La date de naissance est obligatoire.' }),
  classId: z.string().optional(),
  specialty: z.string().optional(),
  phone: z.string().optional(),
  qualification: z.string().optional(),
});

const joinSchoolSchema = z.object({
  mode: z.literal('join-school'),
  fullName: z.string().trim().min(3, 'Le nom complet doit contenir au moins 3 caractères.').max(120),
  email: z.union([z.string().trim().email('Adresse e-mail invalide.'), z.literal('')]).optional(),
  password: z.string().min(8).max(128),
  inviteCode: z.string().trim().min(1),
  role: z.enum(['STUDENT', 'TEACHER', 'PARENT', 'CAISSIER']),
  classIds: z.array(z.string().trim().min(1)).optional(),
  parentCode: z.string().optional(),
  gender: z.enum(['M', 'F'], { error: 'Le sexe (M ou F) est obligatoire.' }),
  dateOfBirth: z.string().optional(),
  specialty: z.string().optional(),
  phone: z.string().optional(),
  qualification: z.string().optional(),
}).superRefine((value, ctx) => {
  if (value.role === 'CAISSIER' && !value.email) {
    ctx.addIssue({ code: 'custom', path: ['email'], message: 'Une adresse e-mail est obligatoire pour la récupération du mot de passe.' });
  }
  if (value.role === 'STUDENT' && !value.classIds?.length) {
    ctx.addIssue({ code: 'custom', path: ['classIds'], message: 'La classe est obligatoire pour un élève.' });
  }
  if (value.role === 'TEACHER') {
    if (!value.dateOfBirth || Number.isNaN(new Date(value.dateOfBirth).getTime())) {
      ctx.addIssue({ code: 'custom', path: ['dateOfBirth'], message: 'La date de naissance est obligatoire et doit être valide.' });
    }
    if (!value.classIds?.length) {
      ctx.addIssue({ code: 'custom', path: ['classIds'], message: 'Sélectionnez au moins une classe enseignée.' });
    }
    if (!value.specialty?.trim()) ctx.addIssue({ code: 'custom', path: ['specialty'], message: 'La spécialité est obligatoire pour un professeur.' });
    if (!value.phone?.trim()) ctx.addIssue({ code: 'custom', path: ['phone'], message: 'Le téléphone est obligatoire pour un professeur.' });
  }
  if (value.role === 'STUDENT' && (!value.dateOfBirth || Number.isNaN(new Date(value.dateOfBirth).getTime()))) {
    ctx.addIssue({ code: 'custom', path: ['dateOfBirth'], message: 'La date de naissance est obligatoire et doit être valide.' });
  }
  if (value.role === 'PARENT' && !value.parentCode?.trim()) {
    ctx.addIssue({ code: 'custom', path: ['parentCode'], message: 'Le code de l’élève est obligatoire.' });
  }
});

async function generateUniqueInviteCode(): Promise<string> {
  let code = generateReadableCode('ECOLE');
  while (await db.school.findUnique({ where: { inviteCode: code } })) {
    code = generateReadableCode('ECOLE');
  }
  return code;
}

async function generateUniqueParentCode(): Promise<string> {
  let code = generateReadableCode('P');
  while (await db.user.findUnique({ where: { parentCode: code } })) {
    code = generateReadableCode('P');
  }
  return code;
}

export async function POST(request: NextRequest) {
  try {
    const rl = await persistentRateLimit(`register:${clientIp(request)}`, 10, 60 * 60 * 1000);
    if (!rl.ok) {
      return NextResponse.json(rateLimitResponse(rl.retryAfterSeconds), {
        status: 429,
        headers: { 'Retry-After': String(rl.retryAfterSeconds) },
      });
    }
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
    }
    const { mode, schoolName, fullName: requestFullName, email: requestEmail, password: requestPassword } = body;

    // === MODE: create-school (Admin creates a school) ===
    if (mode === 'create-school') {
      if (!requestFullName || !schoolName || !requestEmail || !requestPassword) {
        return NextResponse.json(
          { error: 'Veuillez remplir tous les champs.' },
          { status: 400 }
        );
      }
      if (requestPassword.length < 8) {
        return NextResponse.json(
          { error: 'Le mot de passe doit contenir au moins 8 caractères.' },
          { status: 400 }
        );
      }

      const normalizedEmail = requestEmail.trim().toLowerCase();
      const existingSchool = await db.school.findUnique({ where: { email: normalizedEmail } });
      if (existingSchool) {
        return NextResponse.json(
          { error: 'Une école avec cet email existe déjà.' },
          { status: 409 }
        );
      }

      const code = await generateUniqueInviteCode();

      const school = await db.school.create({
        data: {
          name: schoolName,
          email: normalizedEmail,
          password: await hashPassword(requestPassword),
          inviteCode: code,
        },
      });

      const parentCodeVal = await generateUniqueParentCode();

      const user = await db.user.create({
        data: {
          schoolId: school.id,
          fullName: requestFullName,
          email: normalizedEmail,
          password: await hashPassword(requestPassword),
          role: 'ADMIN',
          parentCode: parentCodeVal,
        },
        include: {
          school: true,
          classEnrollments: { include: { class: true } },
        },
      });

      const response = NextResponse.json({
        user: formatUser(user, school),
        inviteCode: code,
      }, { status: 201 });
      setAuthCookies(response, user, school);
      return response;
    }

    // === MODE: join-school (Non-admin joins an existing school) ===
    if (mode === 'join-school') {
      const parsedJoin = joinSchoolSchema.safeParse(body);
      if (!parsedJoin.success) {
        return NextResponse.json(
          { error: parsedJoin.error.issues[0]?.message || 'Données d’inscription invalides.', details: parsedJoin.error.flatten().fieldErrors },
          { status: 400 }
        );
      }
      const { fullName, email, password, inviteCode, role, classIds, parentCode, gender, dateOfBirth, specialty, phone, qualification } = parsedJoin.data;
      const cleanFullName = (fullName || '').trim();
      const cleanEmail = (email || '').trim().toLowerCase();
      const cleanInviteCode = normalizeInviteCode(inviteCode);
      const cleanParentCode = role === 'PARENT' ? normalizeStudentCode(parentCode) : '';

      if ((!cleanFullName && !cleanEmail) || !password || !cleanInviteCode || !role) {
        return NextResponse.json(
          { error: 'Veuillez remplir tous les champs obligatoires et fournir un email ou un nom complet.' },
          { status: 400 }
        );
      }
      if (password.length < 8) {
        return NextResponse.json(
          { error: 'Le mot de passe doit contenir au moins 8 caractères.' },
          { status: 400 }
        );
      }

      const g = gender as string | undefined;
      if (!g || (g !== 'M' && g !== 'F')) {
        return NextResponse.json(
          { error: 'Le sexe (M ou F) est obligatoire.' },
          { status: 400 }
        );
      }

      let birthDateValue = '';
      if (role === 'STUDENT' || role === 'TEACHER') {
        if (!dateOfBirth) {
          return NextResponse.json(
            { error: 'La date de naissance est obligatoire pour ce rôle.' },
            { status: 400 }
          );
        }
        const dob = new Date(dateOfBirth);
        if (isNaN(dob.getTime())) {
          return NextResponse.json(
            { error: 'La date de naissance est invalide.' },
            { status: 400 }
          );
        }
        birthDateValue = dob.toISOString();
      }

      // STUDENT: classId obligatoire + matricule auto-généré
      let matriculeValue = '';
      if (role === 'STUDENT') {
        const classIdVal = (classIds && Array.isArray(classIds) ? classIds[0] : null) as string | undefined;
        if (!classIdVal) {
          return NextResponse.json(
            { error: 'La classe est obligatoire pour un élève.' },
            { status: 400 }
          );
        }
        matriculeValue = `MAT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
        while (await db.user.findFirst({ where: { matricule: matriculeValue } })) {
          matriculeValue = `MAT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
        }
      }

      // TEACHER: specialty + phone obligatoires
      let specialtyValue = '';
      let phoneValue = '';
      if (role === 'TEACHER') {
        specialtyValue = (specialty || '').trim();
        phoneValue = (phone || '').trim();
        if (!specialtyValue) {
          return NextResponse.json(
            { error: 'La spécialité est obligatoire pour un professeur.' },
            { status: 400 }
          );
        }
        if (!phoneValue) {
          return NextResponse.json(
            { error: 'Le numéro de téléphone est obligatoire pour un professeur.' },
            { status: 400 }
          );
        }
      }

      // Find school by invite code
      const school = await db.school.findUnique({ where: { inviteCode: cleanInviteCode } });
      if (!school) {
        return NextResponse.json(
          { error: 'Code école invalide. Vérifiez le code fourni par votre administrateur.' },
          { status: 404 }
        );
      }

      // Validate class membership before creating the account. Invalid or
      // cross-school class IDs must never result in a partially enrolled user.
      const requestedClassIds = [...new Set(classIds || [])];
      if (requestedClassIds.length) {
        const schoolClasses = await db.schoolClass.findMany({
          where: { id: { in: requestedClassIds }, schoolId: school.id, deletedAt: null },
          select: { id: true },
        });
        if (schoolClasses.length !== requestedClassIds.length) {
          return NextResponse.json({ error: 'Une ou plusieurs classes ne sont pas disponibles dans cette école.' }, { status: 400 });
        }
      }

      // Check if user already exists (case-insensitive name comparison)
      const existingUsers = await db.user.findMany({
        where: { schoolId: school.id, role },
      });
      const nameExists = cleanFullName
        ? existingUsers.some(
            (u) => u.fullName.trim().toLowerCase() === cleanFullName.toLowerCase()
          )
        : false;
      if (nameExists) {
        return NextResponse.json(
          { error: 'Un utilisateur avec ce nom et ce rôle existe déjà dans cette école.' },
          { status: 409 }
        );
      }

      if (cleanEmail) {
        const existingEmail = await db.user.findFirst({
          where: { schoolId: school.id, email: cleanEmail },
        });
        if (existingEmail) {
          return NextResponse.json(
            { error: 'Un utilisateur avec cet email existe déjà dans cette école.' },
            { status: 409 }
          );
        }
      }

      const parentCodeVal = await generateUniqueParentCode();

      // Build user data (use cleaned fullName)
      const userData: Record<string, unknown> = {
        schoolId: school.id,
        fullName: cleanFullName,
        password: await hashPassword(password),
        role,
        parentCode: parentCodeVal,
        email: cleanEmail || '',
        gender: g,
        // Cashier membership grants access to payment collection. The school
        // invite code alone is not sufficient approval for that capability.
        active: role === 'CAISSIER' ? false : true,
      };
      if (birthDateValue) userData.birthDate = birthDateValue;
      if (matriculeValue) userData.matricule = matriculeValue;
      if (specialtyValue) userData.specialty = specialtyValue;
      if (phoneValue) userData.phone = phoneValue;
      if (qualification) userData.qualification = (qualification as string) || '';

      // Role-specific logic
      let linkedStudent: { id: string; fullName: string } | null = null;
      if (role === 'PARENT') {
        if (!cleanParentCode) {
          return NextResponse.json(
            { error: 'Le code de l’élève est obligatoire pour créer un compte parent.' },
            { status: 400 }
          );
        }
        // Find the student by parent code
        const student = await db.user.findFirst({
          where: { parentCode: cleanParentCode, schoolId: school.id, role: 'STUDENT', active: true, deletedAt: null },
          select: { id: true, fullName: true, parentId: true },
        });
        if (!student) {
          return NextResponse.json(
            { error: 'Le code n’est pas valide dans cette école.' },
            { status: 404 }
          );
        }
        if (student.parentId) {
          return NextResponse.json({ error: 'Cet enfant est déjà rattaché à un compte parent.' }, { status: 409 });
        }
        linkedStudent = { id: student.id, fullName: student.fullName };
      }

      const user = await db.user.create({
        data: userData as never,
        include: {
          school: true,
          classEnrollments: { include: { class: true } },
        },
      });

      // If student, auto-enroll in selected class
      if (role === 'STUDENT' && requestedClassIds.length > 0) {
        for (const classId of requestedClassIds) {
          const schoolClass = await db.schoolClass.findFirst({
            where: { id: classId, schoolId: school.id },
          });
          if (schoolClass) {
            await db.enrolledClass.create({
              data: { userId: user.id, classId: schoolClass.id },
            });
          }
        }
      }

      // If teacher, enroll in selected classes (same as students)
      if (role === 'TEACHER' && requestedClassIds.length > 0) {
        for (const classId of requestedClassIds) {
          const schoolClass = await db.schoolClass.findFirst({
            where: { id: classId, schoolId: school.id },
          });
          if (schoolClass) {
            await db.enrolledClass.create({
              data: { userId: user.id, classId: schoolClass.id },
            });
          }
        }
      }

      // If parent, link student to this parent
      if (linkedStudent) {
        const linked = await db.user.updateMany({
          where: { id: linkedStudent.id, schoolId: school.id, parentCode: cleanParentCode, role: 'STUDENT', parentId: null },
          data: { parentId: user.id },
        });
        if (linked.count !== 1) {
          await db.user.delete({ where: { id: user.id } });
          return NextResponse.json({ error: 'Cet enfant est déjà rattaché à un compte parent.' }, { status: 409 });
        }
      }

      // Refresh user with enrollments
      const finalUser = await db.user.findUnique({
        where: { id: user.id },
        include: {
          school: true,
          classEnrollments: { include: { class: true } },
          children: true,
        },
      });

      const finalUserData = finalUser || user;
      if (role === 'CAISSIER') {
        notifyUser({
          schoolId: school.id,
          senderId: user.id,
          targetRole: 'ADMIN',
          title: 'Demande d’accès à la caisse',
          message: `${cleanFullName} demande à rejoindre l’équipe de caisse. Vérifiez son profil puis activez son compte.`,
          type: 'SYSTEM',
          priority: 'HIGH',
          metadata: { userId: user.id, role: 'CAISSIER' },
        }).catch((error) => console.error('[Register] Notification de demande caissier impossible:', error));
        return NextResponse.json({
          user: formatUser(finalUser || user, school),
          pendingApproval: true,
          message: 'Votre demande a été envoyée à la direction. L’accès à la caisse sera activé après validation.',
        }, { status: 201 });
      }
      const response = NextResponse.json({
        user: finalUser ? formatUser(finalUser, school) : formatUser(user, school),
      }, { status: 201 });
      setAuthCookies(response, finalUserData, school);
      return response;
    }

    return NextResponse.json(
      { error: 'Mode d\'inscription invalide.' },
      { status: 400 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur interne du serveur.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function formatUser(user: {
  id: string;
  schoolId: string;
  fullName: string;
  email: string;
  role: string;
  photoUrl: string;
  parentId?: string | null;
  parentCode?: string;
  active?: boolean;
  school: { id: string; name: string; email: string; currency: string; inviteCode?: string };
  classEnrollments?: { id: string; userId: string; classId: string; class: { id: string; schoolId: string; name: string; level: string; fees: number } }[];
  children?: { id: string; fullName: string; role: string }[];
}, school: { id: string; name: string; email: string; currency: string; inviteCode?: string }) {
  return {
    id: user.id,
    schoolId: user.schoolId,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    photoUrl: user.photoUrl,
    parentId: user.parentId,
    parentCode: user.parentCode,
    active: user.active,
    school: {
      id: school.id,
      name: school.name,
      email: school.email,
      currency: school.currency,
      inviteCode: school.inviteCode,
    },
    classEnrollments: user.classEnrollments?.map((e) => ({
      id: e.id,
      userId: e.userId,
      classId: e.classId,
      class: e.class,
    })) || [],
    children: user.children || [],
  };
}
