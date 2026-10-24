import { NextRequest } from 'next/server';
import { handleApiError } from '@/lib/api/errors';
import { transitionBulletin } from '@/lib/business/bulletin-route';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { return Response.json({ bulletin: await transitionBulletin(req, (await params).id, 'publish') }); }
  catch (error) { return handleApiError(error); }
}
