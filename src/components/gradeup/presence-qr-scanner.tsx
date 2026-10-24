'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Camera, CheckCircle2, Loader2, QrCode, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface QueuedScan { code: string; createdAt: number }
interface ScanResult { success: boolean; duplicate?: boolean; user?: { id: string; fullName: string; role: string }; error?: string }
interface Detector { detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>> }
type DetectorWindow = Window & { BarcodeDetector?: new (options: { formats: string[] }) => Detector };

function queueKey(schoolId: string) { return `gradeup:presence-scan-queue:${schoolId}`; }
function readQueue(schoolId: string): QueuedScan[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(queueKey(schoolId)) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.code === 'string') : [];
  } catch { return []; }
}

export default function PresenceQrScanner({ schoolId, onRecorded }: { schoolId: string; onRecorded: () => void }) {
  const [code, setCode] = useState('');
  const [queue, setQueue] = useState<QueuedScan[]>([]);
  const [online, setOnline] = useState(true);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [working, setWorking] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanBusyRef = useRef(false);

  const persistQueue = useCallback((next: QueuedScan[]) => {
    setQueue(next);
    try { localStorage.setItem(queueKey(schoolId), JSON.stringify(next)); } catch { toast.error('Impossible de conserver la file hors ligne sur cet appareil.'); }
  }, [schoolId]);

  const submitCode = useCallback(async (raw: string, fromQueue = false) => {
    const normalized = raw.trim();
    if (!normalized || working) return;
    if (!navigator.onLine) {
      if (!fromQueue) {
        const next = [...readQueue(schoolId), { code: normalized, createdAt: Date.now() }];
        persistQueue(next);
        setCode('');
        toast.info('QR ajouté à la file de pointage hors ligne.');
      }
      return;
    }
    setWorking(true);
    try {
      const response = await fetch('/api/presence/scan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: normalized }),
      });
      const result = await response.json() as ScanResult;
      if (response.status === 409 && result.duplicate) {
        toast.info(`${result.user?.fullName || 'Cette personne'} a déjà été pointée aujourd’hui.`);
        if (!fromQueue) setCode('');
        return;
      }
      if (!response.ok) {
        const message = result.error || 'Pointage QR refusé.';
        if (fromQueue && response.status >= 400 && response.status < 500) {
          toast.error(`Scan ignoré : ${message}`);
          return;
        }
        throw new Error(message);
      }
      toast.success(`${result.user?.fullName || 'Présence'} pointée.`);
      if (!fromQueue) setCode('');
      onRecorded();
    } catch (error) {
      if (!fromQueue && !navigator.onLine) {
        persistQueue([...readQueue(schoolId), { code: normalized, createdAt: Date.now() }]);
        setCode('');
        toast.info('QR ajouté à la file hors ligne.');
      } else if (!fromQueue) toast.error(error instanceof Error ? error.message : 'Pointage QR impossible.');
      else throw error;
    } finally { setWorking(false); }
  }, [onRecorded, persistQueue, schoolId, working]);

  useEffect(() => {
    setQueue(readQueue(schoolId));
    const syncOnline = () => setOnline(navigator.onLine);
    syncOnline();
    window.addEventListener('online', syncOnline);
    window.addEventListener('offline', syncOnline);
    return () => { window.removeEventListener('online', syncOnline); window.removeEventListener('offline', syncOnline); };
  }, [schoolId]);

  useEffect(() => {
    if (!online || queue.length === 0 || working) return;
    let cancelled = false;
    const flush = async () => {
      const remaining = [...queue];
      for (const item of queue) {
        if (cancelled) return;
        try {
          await submitCode(item.code, true);
          remaining.shift();
          persistQueue([...remaining]);
        } catch { break; }
      }
    };
    void flush();
    return () => { cancelled = true; };
  }, [online, persistQueue, queue, submitCode, working]);

  useEffect(() => {
    if (!cameraOpen) return;
    let cancelled = false;
    let frame = 0;
    const start = async () => {
      const DetectorCtor = (window as DetectorWindow).BarcodeDetector;
      if (!DetectorCtor) { setCameraError('Le scan caméra QR n’est pas pris en charge par ce navigateur. Utilisez un lecteur QR externe ou saisissez le code.'); return; }
      if (!navigator.mediaDevices?.getUserMedia) { setCameraError('La caméra n’est pas accessible dans ce navigateur.'); return; }
      try {
        const detector = new DetectorCtor({ formats: ['qr_code'] });
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
        const scan = async () => {
          const video = videoRef.current;
          if (!cancelled && video && video.readyState >= 2 && !scanBusyRef.current) {
            scanBusyRef.current = true;
            try {
              const found = await detector.detect(video);
              if (found[0]?.rawValue) {
                setCameraOpen(false);
                await submitCode(found[0].rawValue);
                return;
              }
            } catch { /* frame non lisible; la boucle réessaiera */ }
            finally { scanBusyRef.current = false; }
          }
          if (!cancelled) frame = window.setTimeout(() => void scan(), 250);
        };
        void scan();
      } catch (error) {
        setCameraError(error instanceof Error ? error.message : 'Autorisation caméra refusée.');
      }
    };
    void start();
    return () => {
      cancelled = true;
      window.clearTimeout(frame);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [cameraOpen, submitCode]);

  return <Card>
    <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><QrCode className="size-5" />Pointage par QR</CardTitle><CardDescription>Scannez la carte d’un élève ou professeur. Les doublons du jour sont rejetés côté serveur.</CardDescription></CardHeader>
    <CardContent className="space-y-3">
      {!online && <div role="status" className="flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><WifiOff className="size-4" />Hors ligne : les scans seront envoyés à la reconnexion.</div>}
      <div className="flex flex-col gap-2 sm:flex-row"><Input value={code} onChange={(event) => setCode(event.target.value)} placeholder="Coller ou saisir un matricule / code QR" className="min-h-11" onKeyDown={(event) => { if (event.key === 'Enter') void submitCode(code); }} /><Button className="min-h-11" onClick={() => void submitCode(code)} disabled={working || !code.trim()}>{working ? <Loader2 className="mr-2 size-4 animate-spin" /> : <CheckCircle2 className="mr-2 size-4" />}Pointer</Button><Button variant="outline" className="min-h-11" onClick={() => { setCameraError(''); setCameraOpen((open) => !open); }}>{cameraOpen ? 'Fermer caméra' : <><Camera className="mr-2 size-4" />Scanner</>}</Button></div>
      {cameraOpen && <div className="space-y-2"><video ref={videoRef} playsInline muted className="mx-auto max-h-72 w-full rounded-xl bg-black object-cover" />{cameraError && <p role="alert" className="flex items-start gap-2 text-sm text-amber-800"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{cameraError}</p>}</div>}
      {queue.length > 0 && <div className="rounded-lg border p-3 text-sm"><div className="flex items-center justify-between gap-2"><span>{queue.length} scan(s) en attente de synchronisation</span><Button variant="outline" className="min-h-10" disabled={!online || working} onClick={() => void (async () => { for (const item of [...readQueue(schoolId)]) { try { await submitCode(item.code, true); const current = readQueue(schoolId); persistQueue(current.filter((entry) => entry.createdAt !== item.createdAt)); } catch { break; } } })()}>Synchroniser</Button></div></div>}
    </CardContent>
  </Card>;
}
