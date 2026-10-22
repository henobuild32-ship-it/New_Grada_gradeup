import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, assertSchool } from '@/lib/api/rbac';
import { handleApiError, ApiError } from '@/lib/api/errors';
import type { AuthUser } from '@/lib/auth/authenticate';

export const runtime = 'nodejs';

async function isVisibleToUser(
  r: { visibility: string; targetRole: string; targetClassId: string; createdById: string },
  auth: AuthUser
): Promise<boolean> {
  if (auth.role === 'ADMIN') return true;
  if (r.visibility === 'PUBLIC') return true;
  if (r.visibility === 'SCHOOL') return true;
  if (r.visibility === 'PRIVATE') return r.createdById === auth.userId;
  if (r.visibility === 'ROLE') return r.targetRole === 'ALL' || r.targetRole === auth.role;
  if (r.visibility === 'CLASS') {
    if (!r.targetClassId) return true;
    const enr = await db.enrolledClass.findFirst({
      where: { userId: auth.userId, classId: r.targetClassId },
    });
    if (enr) return true;
    const klass = await db.schoolClass.findUnique({
      where: { id: r.targetClassId },
      select: { titulaireId: true },
    });
    return !!klass && klass.titulaireId === auth.userId;
  }
  return false;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(req);
    const { id } = await params;
    const resource = await db.ressource.findUnique({ where: { id } });
    if (!resource) return NextResponse.json({ error: 'Ressource introuvable.' }, { status: 404 });
    assertSchool(auth, resource.schoolId);
    const visible = await isVisibleToUser(resource, auth);
    if (!visible) {
      throw new ApiError('Accès refusé : ressource non accessible.', 403, 'VISIBILITY_FORBIDDEN');
    }
    return NextResponse.json({ resource });
  } catch (error) {
    console.error('Error fetching resource:', error);
    return handleApiError(error);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(req);
    const { id } = await params;
    const body = await req.json();
    const { title, description, category, matiere, niveau, author, url, fileUrl, type, visibility, targetRole, targetClassId, isPublished } = body;

    const existing = await db.ressource.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Ressource introuvable.' }, { status: 404 });
    assertSchool(auth, existing.schoolId);
    if (existing.createdById !== auth.userId && auth.role !== 'ADMIN') {
      throw new ApiError('Accès refusé : réservé au créateur ou à l’administration.', 403, 'OWNERSHIP_FORBIDDEN');
    }

    const data: Record<string, unknown> = {};
    if (typeof title === 'string') data.title = title;
    if (typeof description === 'string') data.description = description;
    if (typeof category === 'string') data.category = category;
    if (typeof matiere === 'string') data.matiere = matiere;
    if (typeof niveau === 'string') data.niveau = niveau;
    if (typeof author === 'string') data.author = author;
    if (typeof url === 'string') data.url = url;
    if (typeof fileUrl === 'string') data.fileUrl = fileUrl;
    if (typeof type === 'string') data.type = type;
    if (typeof visibility === 'string') data.visibility = visibility;
    if (typeof targetRole === 'string') data.targetRole = targetRole;
    if (typeof targetClassId === 'string') data.targetClassId = targetClassId;
    if (typeof isPublished === 'boolean') data.isPublished = isPublished;

    const resource = await db.ressource.update({ where: { id }, data });
    return NextResponse.json({ resource });
  } catch (error) {
    console.error('Error updating resource:', error);
    return handleApiError(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(req);
    const { id } = await params;

    const existing = await db.ressource.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Ressource introuvable.' }, { status: 404 });
    assertSchool(auth, existing.schoolId);
    if (existing.createdById !== auth.userId && auth.role !== 'ADMIN') {
      throw new ApiError('Accès refusé : réservé au créateur ou à l’administration.', 403, 'OWNERSHIP_FORBIDDEN');
    }

    await db.ressource.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting resource:', error);
    return handleApiError(error);
  }
}
