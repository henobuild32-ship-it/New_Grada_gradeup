'use client';

import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { useAppStore } from '@/lib/store';
import type { BulletinRecord, UserRecord } from '@/lib/offline/db';
import type { LocalRecord } from '@/lib/offline/types';
import { useEntityListState } from '@/lib/offline/hooks';
import { getLocalDB } from '@/lib/offline/db';
import { AlertTriangle, Download, FileText, Loader2, RefreshCw, Share2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type CanonicalBulletin = Omit<BulletinRecord, 'gradesSnapshot'> & {
  createdAt?: string;
  publishedAt?: string | null;
  appreciation?: string;
  student?: { id: string; fullName: string; gender?: string | null; matricule?: string | null };
  class?: { id: string; name: string; level?: string | null };
  gradesSnapshot?: Array<{ course?: string; score?: number; max?: number; coefficient?: number; comment?: string }>;
};
type Child = Omit<UserRecord, 'classEnrollments'>;

function extractRecords(key: 'bulletins' | 'users') {
  return (data: unknown): Record<string, unknown>[] => {
    if (!data || typeof data !== 'object') return [];
    const rows = (data as Record<string, unknown>)[key];
    return Array.isArray(rows) ? rows as Record<string, unknown>[] : [];
  };
}

function useSavedChild(parentId: string) {
  const key = parentId ? `gradeup:selected-child:${parentId}` : '';
  const subscribe = useCallback((onChange: () => void) => {
    if (!key) return () => {};
    window.addEventListener('storage', onChange);
    window.addEventListener('gradeup-child-selection', onChange);
    return () => {
      window.removeEventListener('storage', onChange);
      window.removeEventListener('gradeup-child-selection', onChange);
    };
  }, [key]);
  const getSnapshot = useCallback(() => {
    if (!key || typeof window === 'undefined') return '';
    try { return localStorage.getItem(key) || ''; } catch { return ''; }
  }, [key]);
  const saved = useSyncExternalStore(subscribe, getSnapshot, () => '');
  const save = (id: string) => {
    try {
      localStorage.setItem(key, id);
      window.dispatchEvent(new Event('gradeup-child-selection'));
    } catch { /* current selection still works for this session */ }
  };
  return [saved, save] as const;
}

export default function CanonicalBulletins({ role }: { role: 'STUDENT' | 'PARENT' }) {
  const user = useAppStore((state) => state.user);
  const schoolId = user?.schoolId || '';
  const parentId = role === 'PARENT' ? user?.id || '' : '';
  const [savedChildId, saveChildId] = useSavedChild(parentId);
  const childFilter = useCallback((record: LocalRecord) => {
    const child = record as Child;
    return child.role === 'STUDENT' && child.parentId === parentId && child.active !== false && !child.deletedAt;
  }, [parentId]);
  const childrenUrl = parentId && schoolId ? `/api/users?${new URLSearchParams({ schoolId, role: 'STUDENT', parentId })}` : undefined;
  const { data: children } = useEntityListState<Child>('users', schoolId, {
    remoteUrl: childrenUrl,
    extract: extractRecords('users'),
    filter: childFilter,
  });
  const childId = role === 'STUDENT' ? user?.id || '' : (
    children.some((child) => child.id === savedChildId) ? savedChildId : children[0]?.id || ''
  );
  const [term, setTerm] = useState('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState('');
  const bulletinFilter = useCallback((record: LocalRecord) => {
    const bulletin = record as CanonicalBulletin;
    return bulletin.studentId === childId && bulletin.status === 'PUBLISHED';
  }, [childId]);
  const bulletinUrl = schoolId && childId
    ? `/api/bulletins?${new URLSearchParams({ schoolId, studentId: childId, status: 'PUBLISHED' })}`
    : undefined;
  const { data, loading, refreshing, error, refresh } = useEntityListState<CanonicalBulletin>('bulletins', schoolId, {
    remoteUrl: bulletinUrl,
    extract: extractRecords('bulletins'),
    filter: bulletinFilter,
  });
  const bulletins = useMemo(() => data.filter((item) => item.status === 'PUBLISHED' && (term === 'all' || item.term === Number(term))), [data, term]);

  const getPdf = async (bulletin: CanonicalBulletin) => {
    const url = `/api/bulletins/${bulletin.id}/pdf`;
    const db = getLocalDB();
    const cached = await db.offlineFiles.get(url);
    if (!navigator.onLine) {
      if (!cached) throw new Error('Ce PDF n’a pas encore été téléchargé sur cet appareil.');
      return { blob: cached.blob, fileName: cached.fileName || `bulletin-${bulletin.id}.pdf` };
    }
    const response = await fetch(url, { credentials: 'same-origin' });
    if (!response.ok) {
      const message = await response.text().catch(() => 'Téléchargement du bulletin impossible.');
      throw new Error(message.slice(0, 180) || 'Téléchargement du bulletin impossible.');
    }
    const blob = await response.blob();
    const fileName = `bulletin-${bulletin.student?.matricule || bulletin.studentId}-T${bulletin.term}-${bulletin.academicYear}.pdf`;
    await db.offlineFiles.put({ url, fileName, blob, size: blob.size, downloadedAt: Date.now(), schoolId });
    return { blob, fileName };
  };

  const downloadPdf = async (bulletin: CanonicalBulletin, share = false) => {
    setBusyId(bulletin.id);
    setPdfError('');
    try {
      const { blob, fileName } = await getPdf(bulletin);
      if (share && typeof navigator.share === 'function') {
        const file = new File([blob], fileName, { type: 'application/pdf' });
        if (!navigator.canShare || navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: `Bulletin — ${bulletin.student?.fullName || ''}` });
          toast.success('Bulletin prêt à être partagé.');
          return;
        }
      }
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = fileName;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
      toast.success(navigator.onLine ? 'PDF téléchargé et conservé hors ligne.' : 'PDF téléchargé depuis le cache hors ligne.');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Téléchargement impossible.';
      setPdfError(message);
      toast.error(message);
    } finally { setBusyId(null); }
  };

  if (!user) return null;
  return <div className="space-y-5 pb-24">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><h1 className="text-2xl font-bold">{role === 'PARENT' ? 'Bulletins de mes enfants' : 'Mes bulletins'}</h1><p className="text-sm text-muted-foreground">Documents publiés par l’administration. Un PDF téléchargé reste accessible hors ligne.</p></div>
      <Button variant="outline" className="min-h-11" onClick={() => void refresh()} disabled={refreshing}><RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />Actualiser</Button>
    </div>
    {role === 'PARENT' && children.length > 0 && <div className="flex items-center gap-2">
      <Users className="size-4 text-muted-foreground" />
      <Select value={childId} onValueChange={saveChildId}><SelectTrigger className="min-h-11 max-w-sm"><SelectValue placeholder="Choisir un enfant" /></SelectTrigger><SelectContent>{children.map((child) => <SelectItem key={child.id} value={child.id}>{child.fullName}</SelectItem>)}</SelectContent></Select>
    </div>}
    {error && <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{data.length ? 'Données locales affichées. ' : ''}{error}</div>}
    {pdfError && <div role="alert" className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900"><AlertTriangle className="size-4 shrink-0" />{pdfError}</div>}
    <div className="flex flex-wrap gap-2">{['all', '1', '2', '3', '4'].map((value) => <Button key={value} variant={term === value ? 'default' : 'outline'} className="min-h-11" onClick={() => setTerm(value)}>{value === 'all' ? 'Toutes les périodes' : `Période ${value}`}</Button>)}</div>
    {loading ? <div className="grid gap-3 sm:grid-cols-2">{[1,2,3,4].map((id) => <div key={id} className="h-40 animate-pulse rounded-xl bg-muted" />)}</div>
      : role === 'PARENT' && !children.length ? <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">Aucun enfant relié à ce compte parent.</CardContent></Card>
      : !bulletins.length ? <Card><CardContent className="flex flex-col items-center gap-2 p-10 text-center"><FileText className="size-9 text-muted-foreground" /><p className="font-medium">Aucun bulletin publié</p><p className="text-sm text-muted-foreground">Les brouillons et les bulletins en attente ne sont jamais visibles ici.</p></CardContent></Card>
      : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{bulletins.map((bulletin) => <Card key={bulletin.id}>
        <CardHeader className="pb-2"><div className="flex items-start justify-between gap-2"><div><CardTitle className="text-base">Période {bulletin.term}</CardTitle><CardDescription>{bulletin.academicYear}</CardDescription></div><Badge variant="outline">Publié</Badge></div></CardHeader>
        <CardContent className="space-y-3"><p className="text-sm text-muted-foreground">{bulletin.class?.name || 'Classe'}{role === 'PARENT' ? ` · ${bulletin.student?.fullName || children.find((child) => child.id === childId)?.fullName || 'Élève'}` : ''}</p>
          <div className="grid grid-cols-3 gap-2 text-center"><div className="rounded-lg bg-muted/50 p-2"><p className="text-xs text-muted-foreground">Moyenne</p><p className="font-semibold">{Number(bulletin.average || 0).toFixed(2)}/20</p></div><div className="rounded-lg bg-muted/50 p-2"><p className="text-xs text-muted-foreground">Rang</p><p className="font-semibold">{bulletin.rank ?? '—'}</p></div><div className="rounded-lg bg-muted/50 p-2"><p className="text-xs text-muted-foreground">Mention</p><p className="truncate text-sm font-semibold">{bulletin.mention || '—'}</p></div></div>
          {bulletin.appreciation && <p className="line-clamp-2 text-sm">{bulletin.appreciation}</p>}
          <div className="grid grid-cols-2 gap-2"><Button className="min-h-11" onClick={() => void downloadPdf(bulletin)} disabled={busyId === bulletin.id}>{busyId === bulletin.id ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Download className="mr-2 size-4" />}PDF · hors ligne</Button><Button variant="outline" className="min-h-11" onClick={() => void downloadPdf(bulletin, true)} disabled={busyId === bulletin.id}><Share2 className="mr-2 size-4" />Partager</Button></div>
        </CardContent>
      </Card>)}</div>}
  </div>;
}
