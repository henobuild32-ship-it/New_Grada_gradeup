'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { FileText, Loader2, MessageSquareText, Send, X } from 'lucide-react';
import { MessageAttachmentPicker } from '@/components/gradeup/message-attachment-picker';
import { flushPendingMessageDrafts, listPendingMessageDrafts, savePendingMessageDrafts } from '@/lib/offline/message-drafts';
import { uploadMessageAttachment } from '@/lib/message-upload';

type ReaderMessage = { id: string; senderId: string; content: string; read: boolean; createdAt: string; messageType?: string; attachmentUrl?: string | null; attachmentName?: string | null; attachmentType?: string | null };

export default function ReaderMessages() {
  const { user } = useAppStore();
  const [messages, setMessages] = useState<ReaderMessage[]>([]);
  const [adminName, setAdminName] = useState('Direction de l’école');
  const [adminId, setAdminId] = useState('');
  const [content, setContent] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [queuedDraftCount, setQueuedDraftCount] = useState(0);
  const [uploadProgress, setUploadProgress] = useState<{ fileName: string; percent: number } | null>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/reader/messages', { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'La conversation est indisponible.');
      if (data.admin?.fullName) setAdminName(data.admin.fullName);
      if (data.admin?.id) setAdminId(data.admin.id);
      setMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'La conversation est indisponible.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const schoolId = user?.schoolId || '';
    const userId = user?.id || '';
    if (!schoolId || !userId || user?.role !== 'LECTEUR') return;
    let active = true;
    const refreshCount = () => {
      void listPendingMessageDrafts(schoolId, userId).then((drafts) => { if (active) setQueuedDraftCount(drafts.length); }).catch(() => undefined);
    };
    const sync = async () => {
      if (!navigator.onLine) return;
      try {
        const result = await flushPendingMessageDrafts(schoolId, userId);
        if (!active) return;
        setQueuedDraftCount(result.pending);
        if (result.sent > 0) toast.success(`${result.sent} brouillon(s) envoyé(s) à l’administrateur.`);
        if (result.failed > 0) toast.error(`${result.failed} brouillon(s) nécessitent une correction avant l’envoi.`);
      } catch { refreshCount(); }
    };
    const onResume = () => { void sync(); };
    const onDraftChange = () => refreshCount();
    refreshCount();
    void sync();
    window.addEventListener('online', onResume);
    window.addEventListener('focus', onResume);
    window.addEventListener('gradeup-message-drafts-updated', onDraftChange);
    return () => {
      active = false;
      window.removeEventListener('online', onResume);
      window.removeEventListener('focus', onResume);
      window.removeEventListener('gradeup-message-drafts-updated', onDraftChange);
    };
  }, [user?.id, user?.role, user?.schoolId]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if ((!content.trim() && files.length === 0) || sending) return;
    if (!navigator.onLine) {
      try {
        await savePendingMessageDrafts({ schoolId: user?.schoolId || '', senderId: user?.id || '', recipientId: adminId, channel: 'reader-admin', content: content.trim(), files });
        setFiles([]);
        setContent('');
        void listPendingMessageDrafts(user?.schoolId || '', user?.id || '').then((drafts) => setQueuedDraftCount(drafts.length));
        toast.info('Enregistré sur cet appareil. Le message sera envoyé au retour de la connexion.');
      } catch {
        toast.error('Impossible d’enregistrer ce brouillon sur cet appareil. Gardez cette page ouverte et réessayez.');
      }
      return;
    }

    let unsentFiles = [...files];
    let unsentContent = content.trim();
    setSending(true);
    try {
      if (files.length > 0) {
        if (!adminId) throw new Error('Aucun administrateur actif ne peut recevoir cette pièce jointe.');
        const filesToSend = [...files];
        for (const [index, file] of filesToSend.entries()) {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('recipientId', adminId);
          formData.append('content', index === 0 ? content.trim() : '');
          const controller = new AbortController();
          uploadAbortRef.current = controller;
          setUploadProgress({ fileName: file.name, percent: 0 });
          const response = await uploadMessageAttachment(formData, (percent) => setUploadProgress({ fileName: file.name, percent }), controller.signal);
          uploadAbortRef.current = null;
          setUploadProgress(null);
          if (!response.ok) throw new Error(`${file.name} : ${typeof response.data.error === 'string' ? response.data.error : 'envoi impossible.'}`);
          unsentFiles = unsentFiles.filter((item) => item !== file);
          if (index === 0 && unsentContent) { unsentContent = ''; setContent(''); }
          setMessages((current) => [...current, data.message]);
          setFiles((current) => current.filter((item) => item !== file));
        }
        setContent('');
        toast.success(filesToSend.length === 1 ? 'Message et pièce jointe envoyés.' : `${filesToSend.length} pièces jointes envoyées à l’administrateur.`);
        return;
      }

      const response = await fetch('/api/reader/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: content.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Le message n’a pas pu être envoyé.');
      setMessages((current) => [...current, data.message]);
      setContent('');
      toast.success('Message envoyé à l’administrateur.');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        toast.info('Envoi annulé. Les fichiers non envoyés restent prêts à être renvoyés.');
        return;
      }
      if ((!navigator.onLine || error instanceof TypeError) && (unsentFiles.length > 0 || unsentContent)) {
        try {
          await savePendingMessageDrafts({ schoolId: user?.schoolId || '', senderId: user?.id || '', recipientId: adminId, channel: 'reader-admin', content: unsentContent, files: unsentFiles });
          setFiles((current) => current.filter((file) => !unsentFiles.includes(file)));
          setContent('');
          void listPendingMessageDrafts(user?.schoolId || '', user?.id || '').then((drafts) => setQueuedDraftCount(drafts.length));
          toast.info('Connexion perdue. Le message restant est enregistré comme brouillon et partira au retour du réseau.');
          return;
        } catch {
          toast.error('Connexion perdue et brouillon non enregistré. Gardez cette page ouverte et réessayez.');
          return;
        }
      }
      toast.error(error instanceof Error ? error.message : 'Le message n’a pas pu être envoyé.');
    } finally {
      setSending(false);
      uploadAbortRef.current = null;
      setUploadProgress(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-3 sm:p-6">
      <Card className="overflow-hidden rounded-2xl">
        <CardHeader className="border-b bg-muted/20">
          <CardTitle className="flex items-center gap-2"><MessageSquareText className="size-5 text-primary" /> Écrire à l’administrateur</CardTitle>
          <CardDescription>Votre message est privé et envoyé à {adminName}. L’espace Lecteur reste en lecture seule.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-4 sm:p-6">
          {queuedDraftCount > 0 && <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="status">{queuedDraftCount} brouillon(s) en attente. Ils seront envoyés automatiquement quand la connexion sera disponible.</p>}
          {uploadProgress && <div className="rounded-xl border bg-muted/30 p-3" role="status" aria-live="polite"><div className="flex items-center justify-between gap-3 text-xs"><span className="min-w-0 flex-1 truncate">Envoi de {uploadProgress.fileName}</span><span>{uploadProgress.percent}%</span><Button type="button" variant="ghost" size="icon" aria-label="Annuler l’envoi" title="Annuler l’envoi" onClick={() => uploadAbortRef.current?.abort()} className="size-8 shrink-0"><X className="size-4" /></Button></div><progress className="mt-2 h-2 w-full accent-primary" max={100} value={uploadProgress.percent} /></div>}
          <div className="max-h-[55dvh] min-h-40 space-y-3 overflow-y-auto rounded-xl border bg-muted/10 p-3" aria-live="polite">
            {loading ? <div className="flex min-h-32 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />Chargement de la conversation…</div>
              : messages.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">Vous n’avez encore envoyé aucun message.</p>
                : messages.map((message) => {
                  const own = message.senderId === user?.id;
                  return <div key={message.id} className={`flex ${own ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm ${own ? 'bg-primary text-primary-foreground' : 'border bg-card'}`}>
                      <p className="whitespace-pre-wrap break-words">{message.content}</p>
                      {message.attachmentUrl && message.attachmentType?.startsWith('image/') && <a href={message.attachmentUrl} target="_blank" rel="noreferrer"><img src={message.attachmentUrl} alt={message.attachmentName || 'Pièce jointe'} className="mt-2 max-h-56 rounded-lg object-contain" /></a>}
                      {message.attachmentUrl && message.attachmentType?.startsWith('video/') && <video src={message.attachmentUrl} controls preload="metadata" className="mt-2 max-h-56 max-w-full rounded-lg" />}
                      {message.attachmentUrl && message.attachmentType?.startsWith('audio/') && <audio src={message.attachmentUrl} controls preload="metadata" className="mt-2 w-full max-w-full" />}
                      {message.attachmentUrl && !message.attachmentType?.startsWith('image/') && !message.attachmentType?.startsWith('video/') && !message.attachmentType?.startsWith('audio/') && <a href={message.attachmentUrl} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-2 rounded-lg border p-2 underline"><FileText className="size-4 shrink-0" />{message.attachmentName || 'Télécharger le fichier'}</a>}
                      <p className={`mt-1 text-[11px] ${own ? 'text-primary-foreground/75' : 'text-muted-foreground'}`}>{new Date(message.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</p>
                    </div>
                  </div>;
                })}
          </div>
          <form onSubmit={send} className="space-y-3">
            <label htmlFor="reader-message" className="sr-only">Votre message</label>
            <Textarea id="reader-message" value={content} onChange={(event) => setContent(event.target.value)} maxLength={5000} rows={4} placeholder="Écrivez votre message à la direction…" className="max-h-48 min-h-24 resize-y rounded-xl" />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">{content.length}/5000</span>
              <div className="flex gap-2">
                <MessageAttachmentPicker files={files} onFilesChange={setFiles} disabled={sending || !adminId} />
                <Button type="submit" disabled={(!content.trim() && files.length === 0) || sending} className="min-h-11 rounded-xl">
                {sending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Send className="mr-2 size-4" />} Envoyer
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
