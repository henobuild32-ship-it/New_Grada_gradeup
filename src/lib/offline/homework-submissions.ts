import { getLocalDB } from './db';

export interface PendingHomeworkSubmission {
  id: string;
  userId: string;
  schoolId: string;
  homeworkId: string;
  content: string;
  fileName: string;
  fileKey?: string;
  fileUrl?: string;
  createdAt: number;
  status: 'pending' | 'error';
  retryable: boolean;
  lastError?: string;
}

const prefix = (schoolId: string, userId: string) => `pendingHomeworkSubmission:${schoolId}:${userId}:`;
const fileKey = (id: string) => `pending-homework-submission-file:${id}`;
const asPending = (value: unknown): PendingHomeworkSubmission | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<PendingHomeworkSubmission>;
  return typeof candidate.id === 'string' && typeof candidate.homeworkId === 'string'
    ? candidate as PendingHomeworkSubmission
    : null;
};

export async function listPendingHomeworkSubmissions(schoolId: string, userId: string) {
  const db = getLocalDB();
  const start = prefix(schoolId, userId);
  const meta = await db.syncMeta.toArray();
  return meta.filter((entry) => entry.key.startsWith(start))
    .map((entry) => asPending(entry.value))
    .filter((entry): entry is PendingHomeworkSubmission => Boolean(entry))
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function queueHomeworkSubmission(input: {
  schoolId: string;
  userId: string;
  homeworkId: string;
  content: string;
  file?: File | null;
}) {
  const db = getLocalDB();
  const id = `${input.schoolId}:${input.userId}:${input.homeworkId}`;
  const key = `${prefix(input.schoolId, input.userId)}${input.homeworkId}`;
  const previous = asPending((await db.syncMeta.get(key))?.value);
  const blobKey = fileKey(id);
  if (previous?.fileKey && !input.file) {
    // Preserve the already queued file when a draft is resaved without selecting it again.
  } else if (input.file) {
    await db.offlineFiles.put({
      url: blobKey,
      fileName: input.file.name,
      blob: input.file,
      size: input.file.size,
      downloadedAt: Date.now(),
      schoolId: input.schoolId,
    });
  } else if (previous?.fileKey) {
    await db.offlineFiles.delete(previous.fileKey);
  }

  const item: PendingHomeworkSubmission = {
    id,
    userId: input.userId,
    schoolId: input.schoolId,
    homeworkId: input.homeworkId,
    content: input.content,
    fileName: input.file?.name ?? previous?.fileName ?? '',
    fileKey: input.file ? blobKey : previous?.fileKey,
    // A newly selected file must be uploaded again; never attach the old URL to it.
    fileUrl: input.file ? undefined : previous?.fileUrl,
    createdAt: previous?.createdAt ?? Date.now(),
    status: 'pending',
    retryable: true,
  };
  await db.syncMeta.put({ key, value: item });
  return item;
}

export async function removeQueuedHomeworkSubmission(item: PendingHomeworkSubmission) {
  const db = getLocalDB();
  await db.syncMeta.delete(`${prefix(item.schoolId, item.userId)}${item.homeworkId}`);
  if (item.fileKey) await db.offlineFiles.delete(item.fileKey);
}

async function updateQueued(item: PendingHomeworkSubmission, changes: Partial<PendingHomeworkSubmission>) {
  const db = getLocalDB();
  const updated = { ...item, ...changes };
  await db.syncMeta.put({ key: `${prefix(item.schoolId, item.userId)}${item.homeworkId}`, value: updated });
  return updated;
}

function responseError(response: Response, payload: unknown) {
  const data = payload && typeof payload === 'object' ? payload as { error?: unknown } : {};
  return typeof data.error === 'string' ? data.error : `Erreur serveur (${response.status})`;
}

export async function flushHomeworkSubmissions(schoolId: string, userId: string, retryErrors = false) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { synced: 0, pending: 0 };
  let synced = 0;
  const items = await listPendingHomeworkSubmissions(schoolId, userId);
  for (let item of items) {
    if (item.status === 'error' && (!retryErrors || !item.retryable)) continue;
    try {
      if (item.fileKey && !item.fileUrl) {
        const stored = await getLocalDB().offlineFiles.get(item.fileKey);
        if (!stored) throw Object.assign(new Error('Le fichier en attente est introuvable sur cet appareil.'), { permanent: true });
        const form = new FormData();
        form.append('file', stored.blob, item.fileName || 'devoir');
        const upload = await fetch('/api/resources/upload', { method: 'POST', body: form, credentials: 'include' });
        const uploadData = await upload.json().catch(() => ({}));
        if (!upload.ok) throw Object.assign(new Error(responseError(upload, uploadData)), { permanent: upload.status < 500 && upload.status !== 429 });
        if (!uploadData || typeof uploadData.url !== 'string') throw new Error('Réponse de téléversement invalide.');
        item = await updateQueued(item, { fileUrl: uploadData.url });
      }

      const response = await fetch('/api/submissions', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          homeworkId: item.homeworkId,
          studentId: item.userId,
          schoolId: item.schoolId,
          fileUrl: item.fileUrl ?? '',
          fileName: item.fileName,
          content: item.content,
        }),
      });
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error(responseError(response, responseData)), { permanent: response.status < 500 && response.status !== 429 });
      await removeQueuedHomeworkSubmission(item);
      synced++;
    } catch (error) {
      const permanent = Boolean(error && typeof error === 'object' && 'permanent' in error && error.permanent);
      const message = error instanceof Error ? error.message : 'Erreur de synchronisation.';
      await updateQueued(item, { status: permanent ? 'error' : 'pending', retryable: !permanent, lastError: message });
    }
  }
  const remaining = await listPendingHomeworkSubmissions(schoolId, userId);
  return { synced, pending: remaining.length };
}
