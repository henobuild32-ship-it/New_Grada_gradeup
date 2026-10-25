'use client';

import { BookOpen, ShieldCheck, ScrollText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAppStore } from '@/lib/store';
import { NAV_ITEMS_BY_ROLE } from '@/lib/navigation.config';

export default function ReaderDashboard() {
  const { user, setCurrentPage } = useAppStore();
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-sky-800 via-blue-700 to-indigo-800 p-6 text-white shadow-lg sm:p-9">
        <div className="pointer-events-none absolute -right-10 -top-12 size-56 rounded-full border-[28px] border-white/10" />
        <div className="relative flex items-start gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/15"><BookOpen className="size-6" /></span>
          <div>
            <p className="text-sm font-semibold text-sky-100">Espace de consultation · {user?.school?.name || 'GradeUp'}</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Bonjour {user?.fullName?.split(' ')[0] || 'Lecteur'}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-blue-100">Vous disposez d’un accès en lecture seule au journal d’activité de votre établissement.</p>
          </div>
        </div>
      </header>

      <section aria-labelledby="reader-modules-title" className="space-y-3">
        <div>
          <h2 id="reader-modules-title" className="text-lg font-semibold tracking-tight">Modules consultables</h2>
          <p className="text-sm text-muted-foreground">Ouvrez une vue en lecture seule. Les modifications restent réservées aux rôles autorisés.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {NAV_ITEMS_BY_ROLE.LECTEUR.filter((item) => !['reader-dashboard', 'reader-audit', 'reader-messages'].includes(item.page)).map((item) => {
            const Icon = item.icon;
            return <button key={item.page} type="button" onClick={() => setCurrentPage(item.page)} className="group rounded-2xl text-left outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2">
              <Card className="h-full rounded-2xl transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md">
                <CardContent className="flex items-center gap-3 p-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300"><Icon className="size-5" /></span>
                  <span className="min-w-0"><span className="block font-semibold">{item.label}</span><span className="mt-0.5 block text-xs text-muted-foreground">Consulter les données</span></span>
                </CardContent>
              </Card>
            </button>;
          })}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-[1.3fr_0.7fr]">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><ScrollText className="size-5 text-sky-600" /> Journal d’audit</CardTitle>
            <CardDescription>Consultez les opérations enregistrées par GradeUp dans votre école. Les codes et secrets ne sont jamais affichés.</CardDescription>
          </CardHeader>
          <CardContent><Button onClick={() => setCurrentPage('reader-audit')} className="min-h-11 rounded-xl">Ouvrir le journal</Button></CardContent>
        </Card>
        <Card className="rounded-2xl border-sky-100 bg-sky-50/60 dark:border-sky-900 dark:bg-sky-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="size-5 text-sky-700" /> Accès protégé</CardTitle>
            <CardDescription>Votre rôle ne permet ni création, ni modification, ni suppression dans les modules de l’école.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
