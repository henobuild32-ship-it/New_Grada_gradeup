'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import GradieChat from './gradie/GradieChat';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertTriangle, Loader2, RefreshCw, TrendingDown, Wallet, ClipboardCheck } from 'lucide-react';

interface Insights {
  generatedAt: string;
  period: { code: string; name: string } | null;
  totals: { activeStudents: number; studentsToFollow: number; academicSignals: number; attendanceSignals: number; overdueStudents: number };
  signals: Array<{ studentId: string; name: string; className: string; reasons: string[]; average: number | null; absences30d: number }>;
}

export default function AdminAi() {
  const user = useAppStore((s) => s.user);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState('');

  const loadInsights = useCallback(async () => {
    setInsightsLoading(true);
    setInsightsError('');
    try {
      const response = await fetch('/api/admin/ai/insights');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Analyse indisponible.');
      setInsights(data as Insights);
    } catch (error) {
      setInsightsError(error instanceof Error ? error.message : 'Analyse indisponible.');
    } finally { setInsightsLoading(false); }
  }, []);

  useEffect(() => { if (insightsOpen) void loadInsights(); }, [insightsOpen, loadInsights]);

  if (!user) return null;

  return (
    <div className="flex flex-col h-full gap-3">
      <div className="flex flex-col gap-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 px-5 py-3 text-white shadow-lg shadow-blue-500/20 shrink-0 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-lg font-bold flex items-center gap-2"><span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white/20 backdrop-blur-sm">🤖</span>IA Gradie — Assistant Administrateur</h1>
        <Dialog open={insightsOpen} onOpenChange={setInsightsOpen}>
          <DialogTrigger asChild><Button variant="secondary" className="min-h-11 self-start sm:self-auto"><ClipboardCheck className="mr-2 size-4" />Signaux de suivi</Button></DialogTrigger>
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
            <DialogHeader><DialogTitle>Signaux décisionnels de l’établissement</DialogTitle><DialogDescription>{insights?.period ? `${insights.period.name} · ` : ''}Calculés à partir des notes, présences et tranches échues. À vérifier avec l’équipe pédagogique.</DialogDescription></DialogHeader>
            {insightsLoading ? <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Calcul des signaux…</div>
              : insightsError ? <div role="alert" className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900"><AlertTriangle className="size-4" />{insightsError}</div>
              : insights ? <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[
                  { label: 'Élèves actifs', value: insights.totals.activeStudents, icon: ClipboardCheck },
                  { label: 'À suivre', value: insights.totals.studentsToFollow, icon: AlertTriangle },
                  { label: 'Présences', value: insights.totals.attendanceSignals, icon: TrendingDown },
                  { label: 'Tranches échues', value: insights.totals.overdueStudents, icon: Wallet },
                ].map((item) => <Card key={item.label}><CardContent className="flex items-center gap-2 p-3"><item.icon className="size-4 text-blue-600" /><div><p className="text-xs text-muted-foreground">{item.label}</p><p className="font-semibold">{item.value}</p></div></CardContent></Card>)}</div>
                {insights.signals.length === 0 ? <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Aucun signal de suivi avec les données actuelles.</p> : <div className="space-y-2">{insights.signals.map((signal) => <article key={signal.studentId} className="rounded-lg border p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-medium">{signal.name}</p><p className="text-xs text-muted-foreground">{signal.className}</p></div><div className="flex gap-2 text-xs"><span>{signal.average === null ? 'Moyenne indisponible' : `${signal.average.toFixed(1)} %`}</span><span>{signal.absences30d} absence(s)/retard(s)</span></div></div><ul className="mt-2 list-inside list-disc text-sm text-amber-800">{signal.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></article>)}</div>}
                <p className="text-xs text-muted-foreground">Mis à jour le {new Date(insights.generatedAt).toLocaleString('fr-FR')}.</p>
              </div> : null}
            <div className="flex justify-end"><Button variant="outline" className="min-h-11" onClick={() => void loadInsights()} disabled={insightsLoading}><RefreshCw className={`mr-2 size-4 ${insightsLoading ? 'animate-spin' : ''}`} />Actualiser</Button></div>
          </DialogContent>
        </Dialog>
      </div>
      <div className="flex-1 min-h-0">
        <GradieChat
          schoolId={user.schoolId}
          userId={user.id}
          userRole="ADMIN"
          userName={user.fullName}
        />
      </div>
    </div>
  );
}
