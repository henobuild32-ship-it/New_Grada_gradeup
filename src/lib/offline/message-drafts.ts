import { getLocalDB } from './db';

export type MessageDraftChannel = 'admin-chat' | 'reader-admin';
export interface PendingMessageDraft {
  id: string;
  schoolId: string;
  senderId: string;
  recipientId: string;
  channel: MessageDraftChannel;
  content: string;
  fileKey?: string;
  fileName?: string;
  fileType?: string;
  createdAt: number;
  status: 'pending' | 'error';
  lastError?: string;
}

const prefix = (schoolId: string, userId: string) => `pendingMessage:${schoolId}:${userId}:`;
const fileKey = (id: string) => `pending-message-file:${id}`;
const activeFlushes = new Map<string, Promise<{ sent: number; pending: number; failed: number }>>();

function notifyDraftsChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('gradeup-message-drafts-updated'));
}

export async function listPendingMessageDrafts(schoolId: string, userId: string): Promise<PendingMessageDraft[]> {
  const db = getLocalDB();
  const start = prefix(schoolId, userId);
  const entries = await db.syncMeta.toArray();
  return entries
    .filter((entry) => entry.key.startsWith(start))
    .map((entry) => entry.value as PendingMessageDraft)
    .filter((entry) => entry && typeof entry.id === 'string' && typeof entry.recipientId === 'string')
    .sort((left, right) => left.createdAt - right.createdAt);
}

export async function savePendingMessageDrafts(input: {
  schoolId: string;
  senderId: string;
  recipientId: string;
  channel: MessageDraftChannel;
  content: string;
  files: File[];
}): Promise<number> {
  const db = getLocalDB();
  const items = input.files.length ? input.files : [null];
  for (const [index, file] of items.entries()) {
    const id = crypto.randomUUID();
    const key = `${prefix(input.schoolId, input.senderId)}${id}`;
    const blobKey = file ? fileKey(id) : undefined;
    if (file && blobKey) {
      await db.offlineFiles.put({
        url: blobKey,
        fileName: file.name,
        blob: file,
        size: file.size,
        downloadedAt: Date.now(),
        schoolId: input.schoolId,
      });
    }
    const draft: PendingMessageDraft = {
      id,
      schoolId: input.schoolId,
      senderId: input.senderId,
      recipientId: input.recipientId,
      channel: input.channel,
      content: index === 0 ? input.content : '',
      ...(blobKey ? { fileKey: blobKey } : {}),
      ...(file ? { fileName: file.name, fileType: file.type } : {}),
      createdAt: Date.now(),
      status: 'pending',
    };
    try {
      await db.syncMeta.put({ key, value: draft });
    } catch (error) {
      if (blobKey) await db.offlineFiles.delete(blobKey);
      throw error;
    }
  }
  notifyDraftsChanged();
  return items.length;
}

export async function removePendingMessageDraft(draft: PendingMessageDraft): Promise<void> {
  const db = getLocalDB();
  await db.syncMeta.delete(`${prefix(draft.schoolId, draft.senderId)}${draft.id}`);
  if (draft.fileKey) await db.offlineFiles.delete(draft.fileKey);
  notifyDraftsChanged();
}

async function markDraft(draft: PendingMessageDraft, changes: Partial<PendingMessageDraft>) {
  const db = getLocalDB();
  const updated = { ...draft, ...changes };
  await db.syncMeta.put({ key: `${prefix(draft.schoolId, draft.senderId)}${draft.id}`, value: updated });
}

async function flushMessageDrafts(schoolId: string, userId: string) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { sent: 0, pending: 0, failed: 0 };
  let sent = 0;
  let failed = 0;
  const drafts = await listPendingMessageDrafts(schoolId, userId);
  for (const draft of drafts) {
    try {
      let response: Response;
      if (draft.fileKey) {
        const stored = await getLocalDB().offlineFiles.get(draft.fileKey);
        if (!stored) throw Object.assign(new Error('Le fichier du brouillon est introuvable sur cet appareil.'), { permanent: true });
        const form = new FormData();
        form.append('file', stored.blob, draft.fileName || 'piece-jointe');
        form.append('recipientId', draft.recipientId);
        form.append('content', draft.content);
        response = await fetch('/api/upload/message', { method: 'POST', body: form, credentials: 'include' });
      } else if (draft.channel === 'reader-admin') {
        response = await fetch('/api/reader/messages', {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: draft.content }),
        });
      } else {
        response = await fetch('/api/messages', {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ senderId: userId, recipientId: draft.recipientId, content: draft.content, schoolId }),
        });
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = typeof data.error === 'string' ? data.error : `Erreur serveur (${response.status}).`;
        const permanent = response.status >= 400 && response.status < 500 && response.status !== 401 && response.status !== 403 && response.status !== 429;
        await markDraft(draft, { status: permanent ? 'error' : 'pending', lastError: message });
        if (permanent) failed++;
        if (response.status === 401 || response.status === 403 || response.status >= 500 || response.status === 429) break;
        continue;
      }
      await removePendingMessageDraft(draft);
      sent++;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'La synchronisation du message a échoué.';
      await markDraft(draft, { status: 'pending', lastError: message });
      break;
    }
  }
  const remaining = await listPendingMessageDrafts(schoolId, userId);
  return { sent, pending: remaining.length, failed };
}

export function flushPendingMessageDrafts(schoolId: string, userId: string) {
  const key = `${schoolId}:${userId}`;
  const current = activeFlushes.get(key);
  if (current) return current;
  const pending = flushMessageDrafts(schoolId, userId).finally(() => activeFlushes.delete(key));
  activeFlushes.set(key, pending);
  return pending;
}
