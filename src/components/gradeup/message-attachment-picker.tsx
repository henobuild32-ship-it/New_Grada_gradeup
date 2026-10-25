'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AudioLines, Camera, FileText, Images, Mic, Paperclip, Square, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_FILES = 5;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mp3: 'audio/mpeg', m4a: 'audio/mp4',
  wav: 'audio/wav', ogg: 'audio/ogg',
};

function normalizeFile(file: File): File {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  const type = file.type || MIME_BY_EXTENSION[extension] || '';
  return type === file.type ? file : new File([file], file.name, { type, lastModified: file.lastModified });
}

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} Ko` : `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

export function MessageAttachmentPicker({
  files,
  onFilesChange,
  disabled = false,
}: {
  files: File[];
  onFilesChange: (files: File[]) => void;
  disabled?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [permissionHelp, setPermissionHelp] = useState(false);
  const [settingsInstructions, setSettingsInstructions] = useState('');
  const previews = useMemo(() => {
    const next: Record<string, string> = {};
    for (const file of files) {
      if (file.type.startsWith('image/')) next[`${file.name}:${file.lastModified}:${file.size}`] = URL.createObjectURL(file);
    }
    return next;
  }, [files]);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const documentInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const mediaStream = useRef<MediaStream | null>(null);
  const recordChunks = useRef<Blob[]>([]);
  const recordingStartedAt = useRef<number | null>(null);

  useEffect(() => () => Object.values(previews).forEach((url) => URL.revokeObjectURL(url)), [previews]);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => {
      const elapsed = Math.min(300, Math.floor((Date.now() - (recordingStartedAt.current ?? Date.now())) / 1000));
      setRecordingSeconds(elapsed);
      if (elapsed >= 300 && recorder.current?.state === 'recording') recorder.current.stop();
    }, 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => () => {
    if (recorder.current?.state === 'recording') recorder.current.stop();
    mediaStream.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const addFiles = (incoming: File[]) => {
    const normalized = incoming.map(normalizeFile);
    const valid: File[] = [];
    for (const file of normalized) {
      if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
        toast.error(`${file.name} dépasse la limite de 25 Mo ou est vide.`);
        continue;
      }
      valid.push(file);
    }
    const next = [...files, ...valid];
    if (next.length > MAX_FILES) {
      toast.error(`Vous pouvez joindre au maximum ${MAX_FILES} fichiers par message.`);
      return;
    }
    const totalBytes = next.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > MAX_TOTAL_BYTES) {
      toast.error('Les pièces jointes ne peuvent pas dépasser 50 Mo au total.');
      return;
    }
    if (valid.length) onFilesChange(next);
    setMenuOpen(false);
  };

  const onChooseFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(event.target.files || []));
    event.target.value = '';
  };

  const stopRecording = () => {
    if (recorder.current?.state === 'recording') recorder.current.stop();
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast.error('L’enregistrement audio n’est pas pris en charge ici. Choisissez un fichier audio à la place.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStream.current = stream;
      const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4'];
      const mimeType = candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
      const activeRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recordChunks.current = [];
      activeRecorder.ondataavailable = (event) => { if (event.data.size) recordChunks.current.push(event.data); };
      activeRecorder.onerror = () => toast.error('L’enregistrement vocal a été interrompu. Réessayez.');
      activeRecorder.onstop = () => {
        const rawType = activeRecorder.mimeType.toLowerCase();
        const type = rawType.startsWith('audio/webm') ? 'audio/webm' : rawType.startsWith('audio/ogg') ? 'audio/ogg' : rawType.startsWith('audio/mp4') ? 'audio/mp4' : 'audio/webm';
        const blob = new Blob(recordChunks.current, { type });
        mediaStream.current?.getTracks().forEach((track) => track.stop());
        mediaStream.current = null;
        recorder.current = null;
        recordingStartedAt.current = null;
        setRecording(false);
        setRecordingSeconds(0);
        if (!blob.size) return;
        const extension = type === 'audio/ogg' ? 'ogg' : type === 'audio/mp4' ? 'm4a' : 'webm';
        addFiles([new File([blob], `message-vocal-${Date.now()}.${extension}`, { type })]);
      };
      recorder.current = activeRecorder;
      activeRecorder.start(250);
      recordingStartedAt.current = Date.now();
      setRecordingSeconds(0);
      setPermissionHelp(false);
      setRecording(true);
    } catch (error) {
      const denied = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError');
      toast.error(denied
        ? 'Autorisez le microphone dans les réglages du navigateur, puis réessayez.'
        : 'Impossible d’accéder au microphone. Vérifiez les réglages de votre appareil.');
      setPermissionHelp(denied);
    }
  };

  const openPermissionSettings = () => {
    const agent = navigator.userAgent;
    const origin = encodeURIComponent(window.location.origin);
    if (/iPhone|iPad|iPod/i.test(agent)) {
      setSettingsInstructions('Sur iPhone ou iPad, ouvrez Réglages, choisissez votre navigateur, puis activez Microphone. Revenez ensuite dans GradeUp.');
      return;
    }
    const settingsUrl = /Edg\//i.test(agent)
      ? `edge://settings/content/siteDetails?site=${origin}`
      : /Chrome\//i.test(agent)
        ? `chrome://settings/content/siteDetails?site=${origin}`
        : /Firefox\//i.test(agent)
          ? 'about:preferences#privacy'
          : '';
    if (settingsUrl) {
      window.open(settingsUrl, '_blank', 'noopener,noreferrer');
      setSettingsInstructions('Dans les réglages ouverts, autorisez le microphone pour ce site, puis revenez dans GradeUp.');
    } else {
      setSettingsInstructions('Ouvrez les réglages de confidentialité de votre navigateur, autorisez le microphone pour ce site, puis revenez dans GradeUp.');
    }
  };

  const removeFile = (index: number) => onFilesChange(files.filter((_, current) => current !== index));
  const openPicker = (ref: React.RefObject<HTMLInputElement | null>) => {
    setMenuOpen(false);
    ref.current?.click();
  };

  return (
    <div className="min-w-0">
      <input ref={cameraInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" capture="environment" className="hidden" onChange={onChooseFiles} />
      <input ref={galleryInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" multiple className="hidden" onChange={onChooseFiles} />
      <input ref={documentInput} type="file" accept=".pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx" multiple className="hidden" onChange={onChooseFiles} />
      <input ref={audioInput} type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.webm" multiple className="hidden" onChange={onChooseFiles} />

      {files.length > 0 && <ul className="mb-2 flex max-h-36 flex-wrap gap-2 overflow-y-auto" aria-label="Pièces jointes en attente">
        {files.map((file, index) => {
          const key = `${file.name}:${file.lastModified}:${file.size}`;
          return <li key={`${key}:${index}`} className="flex max-w-full items-center gap-2 rounded-xl border bg-muted/30 p-2">
            {previews[key] ? <img src={previews[key]} alt={`Aperçu de ${file.name}`} className="size-10 rounded-lg object-cover" />
              : file.type.startsWith('audio/') ? <AudioLines className="size-5 shrink-0 text-primary" />
                : file.type.startsWith('video/') ? <Camera className="size-5 shrink-0 text-primary" />
                  : file.type.startsWith('image/') ? <Images className="size-5 shrink-0" /> : <FileText className="size-5 shrink-0" />}
            <span className="min-w-0 flex-1 truncate text-xs">{file.name} · {formatSize(file.size)}</span>
            <Button type="button" variant="ghost" size="icon" aria-label={`Retirer ${file.name}`} disabled={disabled || recording} onClick={() => removeFile(index)} className="size-8 shrink-0"><X className="size-4" /></Button>
          </li>;
        })}
      </ul>}

      {recording && <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="status">
        <span><span className="mr-2 inline-block size-2 animate-pulse rounded-full bg-red-600" />Enregistrement vocal · {Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, '0')} / 5:00</span>
        <Button type="button" variant="destructive" size="sm" onClick={stopRecording}><Square className="mr-2 size-3" />Terminer</Button>
      </div>}

      {permissionHelp && <div className="mb-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950" role="alert">
        <p className="font-semibold">Accès au microphone refusé</p>
        <p className="mt-1">Autorisez le microphone pour ce site dans les réglages de votre navigateur.</p>
        {settingsInstructions && <p className="mt-2 rounded-lg bg-amber-100 p-2">{settingsInstructions}</p>}
        <div className="mt-2 flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" className="min-h-9" onClick={openPermissionSettings}>Ouvrir les paramètres</Button>
          <Button type="button" variant="outline" size="sm" className="min-h-9" onClick={() => { setPermissionHelp(false); setSettingsInstructions(''); void startRecording(); }}>Réessayer</Button>
        </div>
      </div>}

      <div className="relative shrink-0">
        <Button type="button" size="icon" variant="outline" aria-label="Joindre un document ou un média" title="Joindre un document ou un média" disabled={disabled || recording} onClick={() => setMenuOpen((value) => !value)} className="h-10 w-10 shrink-0">
          <Paperclip className="size-4" />
        </Button>
        {menuOpen && <div className="absolute bottom-12 left-0 z-50 w-[min(19rem,calc(100vw-2rem))] rounded-2xl border bg-popover p-3 shadow-xl" role="group" aria-label="Choisir une pièce jointe">
          <div className="mb-2 flex items-center justify-between"><p className="text-sm font-semibold">Joindre un document ou un média</p><Button type="button" size="icon" variant="ghost" aria-label="Fermer le menu" onClick={() => setMenuOpen(false)} className="size-8"><X className="size-4" /></Button></div>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" className="h-auto min-h-12 justify-start gap-2 whitespace-normal px-2 text-left text-xs" onClick={() => openPicker(cameraInput)}><Camera className="size-4 shrink-0" />Photo ou vidéo</Button>
            <Button type="button" variant="outline" className="h-auto min-h-12 justify-start gap-2 whitespace-normal px-2 text-left text-xs" onClick={() => openPicker(galleryInput)}><Images className="size-4 shrink-0" />Galerie · plusieurs</Button>
            <Button type="button" variant="outline" className="h-auto min-h-12 justify-start gap-2 whitespace-normal px-2 text-left text-xs" onClick={() => openPicker(documentInput)}><FileText className="size-4 shrink-0" />Documents</Button>
            <Button type="button" variant="outline" className="h-auto min-h-12 justify-start gap-2 whitespace-normal px-2 text-left text-xs" onClick={() => openPicker(audioInput)}><AudioLines className="size-4 shrink-0" />Choisir un audio</Button>
            <Button type="button" variant="outline" className="col-span-2 h-auto min-h-12 justify-start gap-2 whitespace-normal px-2 text-left text-xs" onClick={() => { setMenuOpen(false); void startRecording(); }}><Mic className="size-4 shrink-0" />Enregistrer un message vocal</Button>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">5 fichiers maximum · 25 Mo par fichier · 50 Mo au total</p>
        </div>}
      </div>
    </div>
  );
}
