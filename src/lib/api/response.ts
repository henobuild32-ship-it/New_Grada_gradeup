import { NextResponse } from 'next/server';
import { ApiError } from './errors';

/**
 * Réponses API uniformes.
 * - Succès singleton : `{ <entity>: data }` (ex: `{ grade }`)
 * - Succès liste paginée : `{ <entity>s: data, pagination: { page, pageSize, total, totalPages } }`
 * - Erreur : `{ error, code }` (voir errors.ts)
 */

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function ok<T>(entity: string, data: T, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ [entity]: data, ...(extra ?? {}) });
}

export function created<T>(entity: string, data: T, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ [entity]: data, ...(extra ?? {}) }, { status: 201 });
}

export function list<T>(
  entity: string,
  data: T[],
  pagination?: Pagination,
  extra?: Record<string, unknown>
): NextResponse {
  return NextResponse.json({ [`${entity}s`]: data, ...(pagination ? { pagination } : {}), ...(extra ?? {}) });
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

export function okRaw(payload: Record<string, unknown>, init?: ResponseInit): NextResponse {
  return NextResponse.json(payload, init);
}

// ---------------------------------------------------------------------------
// Pagination, filtres, tri — parseur commun (query string).
// ---------------------------------------------------------------------------

export interface ListParams {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
  orderBy: Record<string, 'asc' | 'desc'>;
}

const MAX_PAGE_SIZE = 100;

/**
 * Extrait page/pageSize/orderBy (champ:asc|desc[,champ:desc]) d'une query URL.
 * `defaultOrder` appliqué si aucun tri fourni (généralement `{ createdAt: 'desc' }`).
 */
export function parseListParams(
  searchParams: URLSearchParams,
  defaultOrder: Record<string, 'asc' | 'desc'> = { createdAt: 'desc' }
): ListParams {
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(searchParams.get('pageSize') ?? '50', 10) || 50)
  );
  const orderBy = parseOrderBy(searchParams.get('orderBy'), defaultOrder);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize, orderBy };
}

function parseOrderBy(
  raw: string | null,
  defaultOrder: Record<string, 'asc' | 'desc'>
): Record<string, 'asc' | 'desc'> {
  if (!raw) return defaultOrder;
  const out: Record<string, 'asc' | 'desc'> = {};
  for (const part of raw.split(',').slice(0, 3)) {
    const [field, dir] = part.split(':');
    if (!field) continue;
    const key = field.trim();
    // Ne trier que sur des champs simples (anti injection de chemin relation).
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key)) continue;
    out[key] = dir?.trim().toLowerCase() === 'asc' ? 'asc' : 'desc';
  }
  return Object.keys(out).length ? out : defaultOrder;
}

export function paginate<T>(total: number, data: T[], params: ListParams): Pagination {
  return {
    page: params.page,
    pageSize: params.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
  };
}

/** Construit `pagination` même quand on renvoie une liste complète (sans skip). */
export function simplePagination<T>(data: T[], params: ListParams): Pagination {
  return paginate(data.length, data, { ...params, page: 1, pageSize: Math.max(data.length, 1) });
}

/** Paramètre requis avec message d'erreur FR uniforme. */
export function requireParam(searchParams: URLSearchParams, name: string): string {
  const value = searchParams.get(name);
  if (!value) throw new ApiError(`Paramètre requis : ${name}.`, 400, 'MISSING_PARAM');
  return value;
}
