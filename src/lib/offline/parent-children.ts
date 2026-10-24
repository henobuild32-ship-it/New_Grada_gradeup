'use client';

import { useCallback } from 'react';
import type { LocalRecord } from './types';
import type { UserRecord } from './db';
import { useEntityListState } from './hooks';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractChildren(data: unknown, parentId: string, fallbackSchoolId: string): Record<string, unknown>[] {
  if (!isRecord(data) || !Array.isArray(data.children)) return [];
  return data.children.filter(isRecord).map((child) => {
    const school = isRecord(child.school) ? child.school : {};
    return {
      id: child.id,
      schoolId: String(school.id ?? fallbackSchoolId),
      parentId,
      fullName: String(child.fullName ?? ''),
      // Store only the profile fields the parent UI needs. In particular, do
      // not persist password hashes, parent codes, or the full user relation.
      email: '',
      role: 'STUDENT',
      active: true,
      photoUrl: child.photoUrl,
      matricule: child.matricule,
      classEnrollments: child.classEnrollments,
      school: {
        id: String(school.id ?? fallbackSchoolId),
        ...(typeof school.name === 'string' && { name: school.name }),
        ...(typeof school.logoUrl === 'string' && { logoUrl: school.logoUrl }),
        ...(typeof school.academicYear === 'string' && { academicYear: school.academicYear }),
      },
    };
  });
}

/** Cache local-first des enfants renvoyés par l'endpoint parent dédié et assaini. */
export function useParentChildren(parentId: string | undefined, schoolId: string | undefined) {
  const extract = useCallback(
    (data: unknown) => extractChildren(data, parentId ?? '', schoolId ?? ''),
    [parentId, schoolId]
  );
  const filter = useCallback(
    (record: LocalRecord) => {
      const child = record as UserRecord;
      return child.parentId === parentId && child.role === 'STUDENT';
    },
    [parentId]
  );

  return useEntityListState<UserRecord>('users', schoolId, {
    remoteUrl: parentId ? '/api/parent/children' : undefined,
    extract,
    filter,
  });
}
