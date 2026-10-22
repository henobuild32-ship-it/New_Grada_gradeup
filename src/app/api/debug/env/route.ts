import { NextResponse } from 'next/server';
import { ApiError, handleApiError } from '@/lib/api/errors';

/**
 * Route de diagnostic SUPPRIMÉE fonctionnellement.
 * Elle exposait les valeurs, longueurs, préfixes et suffixes de variables
 * d'environnement critiques (DEEPSEEK_API_KEY, DATABASE_URL, ...) :
 * elle répond désormais 404 à tout le monde, en toute saison.
 */

export const runtime = 'nodejs';

export async function GET() {
  try {
    throw new ApiError('Not Found', 404);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST() {
  try {
    throw new ApiError('Not Found', 404);
  } catch (error) {
    return handleApiError(error);
  }
}
