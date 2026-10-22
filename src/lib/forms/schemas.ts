import { z } from 'zod';

/**
 * Schémas zod partagés pour les formulaires (react-hook-form + zodResolver).
 * Chaque schéma fournit des messages d'erreur clairs en français.
 */

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Ce champ est obligatoire.')
  .email('Adresse e-mail invalide.');

export const passwordSchema = z
  .string()
  .min(8, 'Le mot de passe doit contenir au moins 8 caractères.');

export const nameSchema = z
  .string()
  .trim()
  .min(2, 'Le nom doit contenir au moins 2 caractères.');

/** Téléphone RDC : +243… ou 0XXXXXXXXX (8 à 15 chiffres). */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^(\+243|0)[0-9]{8,12}$/, 'Numéro de téléphone invalide (ex. +243812345678).');

export const amountSchema = z
  .coerce.number()
  .positive('Le montant doit être positif.');

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide (format yyyy-mm-dd).');

/** Formulaire de connexion. */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Ce champ est obligatoire.'),
});

/** Création d'utilisateur (formulaire admin type). */
export const createUserSchema = z.object({
  fullName: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  role: z.enum(['ADMIN', 'TEACHER', 'STUDENT', 'PARENT']),
  phone: phoneSchema.optional().or(z.literal('')),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;

/** Valeurs du formulaire admin « utilisateur » (création + édition). */
export const adminUserFormSchema = z
  .object({
    fullName: nameSchema,
    email: emailSchema,
    /** Requis à la création, optionnel à l'édition (vide = ne pas modifier). */
    password: z.string(),
    role: z.enum(['ADMIN', 'TEACHER', 'STUDENT', 'PARENT']),
    gender: z.enum(['M', 'F'], { error: 'Le sexe (M ou F) est obligatoire.' }),
    birthDate: z.string().optional(),
    specialty: z.string().optional(),
    phone: z.string().optional(),
    className: z.string().optional(),
    parentId: z.string().optional(),
    isTitulaire: z.boolean(),
    titulaireClassIds: z.array(z.string()),
  })
  .superRefine((val, ctx) => {
    if ((val.role === 'STUDENT' || val.role === 'TEACHER') && !val.birthDate?.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['birthDate'],
        message: 'La date de naissance est obligatoire pour ce rôle.',
      });
    }
    if (val.role === 'TEACHER') {
      if (!val.specialty?.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['specialty'],
          message: 'La spécialité est obligatoire pour un professeur.',
        });
      }
      if (!val.phone?.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['phone'],
          message: 'Le numéro de téléphone est obligatoire pour un professeur.',
        });
      }
    }
  });

/** Construit le schéma selon le mode : création (mot de passe requis) ou édition. */
export function buildAdminUserSchema(isEdit: boolean) {
  if (isEdit) return adminUserFormSchema;
  return adminUserFormSchema.refine((val) => val.password.trim().length >= 8, {
    path: ['password'],
    message: 'Le mot de passe doit contenir au moins 8 caractères.',
  });
}

export type AdminUserFormValues = z.infer<typeof adminUserFormSchema>;
