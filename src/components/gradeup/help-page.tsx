'use client';

import React from 'react';
import Image from 'next/image';
import { useAppStore } from '@/lib/store';
import type { UserRole } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Lightbulb,
  Keyboard,
  MessageSquare,
  CalendarDays,
  User,
  Moon,
  Sun,
  Search,
  Bell,
  GraduationCap,
  Users,
  CreditCard,
  BookOpen,
  BarChart3,
  School,
  Shield,
  Sparkles,
  ChevronRight,
} from 'lucide-react';

const roleLabels: Record<UserRole, string> = {
  ADMIN: 'Administrateur',
  TEACHER: 'Professeur',
  STUDENT: 'Élève',
  PARENT: 'Parent',
  CAISSIER: 'Caissier',
};

const roleColors: Record<UserRole, string> = {
  ADMIN: 'from-blue-600 to-blue-500',
  TEACHER: 'from-emerald-600 to-emerald-500',
  STUDENT: 'from-violet-600 to-violet-500',
  PARENT: 'from-amber-600 to-amber-500',
  CAISSIER: 'from-emerald-600 to-emerald-500',
};

const shortcuts = [
  { key: 'Ctrl + K', description: 'Ouvrir la palette de commandes' },
  { key: 'Ctrl + /', description: 'Aller à la page d\'aide' },
];

const generalTips = [
  {
    icon: Sun,
    title: 'Mode sombre',
    description: 'Utilisez le bouton ☀️/🌙 dans l\'en-tête pour basculer entre le mode clair et sombre.',
  },
  {
    icon: Search,
    title: 'Recherche rapide',
    description: 'Appuyez sur Ctrl+K pour rechercher et naviguer rapidement vers n\'importe quelle page.',
  },
  {
    icon: Bell,
    title: 'Notifications',
    description: 'L\'icône de cloche dans l\'en-tête affiche le nombre de messages non lus en temps réel.',
  },
  {
    icon: MessageSquare,
    title: 'Messagerie',
    description: 'Communiquez avec les autres membres de l\'école via la messagerie intégrée.',
  },
  {
    icon: CalendarDays,
    title: 'Calendrier scolaire',
    description: 'Consultez le calendrier pour voir les devoirs à rendre et les échéances de paiement.',
  },
  {
    icon: User,
    title: 'Mon profil',
    description: 'Modifiez vos informations personnelles et changez votre mot de passe depuis la page Profil.',
  },
];

const adminTips = [
  {
    icon: Shield,
    title: 'Code école',
    description: 'Votre code école unique permet aux membres de rejoindre votre école lors de l\'inscription.',
  },
  {
    icon: Users,
    title: 'Gestion des utilisateurs',
    description: 'Activez ou désactivez les comptes utilisateurs depuis la page Utilisateurs.',
  },
  {
    icon: School,
    title: 'Classes et cours',
    description: 'Créez des classes et attribuez des professeurs pour organiser votre école.',
  },
  {
    icon: CreditCard,
    title: 'Suivi des paiements',
    description: 'Gérez les paiements des élèves et suivez les paiements en attente.',
  },
];

const teacherTips = [
  {
    icon: BookOpen,
    title: 'Cours et leçons',
    description: 'Créez des cours, ajoutez des leçons avec du contenu pédagogique pour vos élèves.',
  },
  {
    icon: GraduationCap,
    title: 'Saisie des notes',
    description: 'Entrez les notes de vos élèves par trimestre avec des commentaires personnalisés.',
  },
  {
    icon: BarChart3,
    title: 'Suivi des absences',
    description: 'Enregistrez les présences et absences de vos élèves au quotidien.',
  },
];

const studentTips = [
  {
    icon: GraduationCap,
    title: 'Code élève',
    description: 'Transmettez le code affiché sur votre tableau de bord à votre parent. Seul l’administrateur peut le renouveler.',
  },
  {
    icon: BarChart3,
    title: 'Consultez vos notes',
    description: 'Suivez vos moyennes par trimestre et identifiez les matières à améliorer.',
  },
  {
    icon: CreditCard,
    title: 'Paiements',
    description: 'Vérifiez le statut de vos paiements scolaires depuis la section Paiements.',
  },
];

const parentTips = [
  {
    icon: BarChart3,
    title: 'Suivi scolaire',
    description: 'Consultez les notes et les performances de votre enfant en temps réel.',
  },
  {
    icon: CreditCard,
    title: 'Paiements',
    description: 'Suivez les paiements scolaires de votre enfant et leur statut.',
  },
];

export default function HelpPage() {
  const user = useAppStore((s) => s.user);

  if (!user) return null;

  const role = user.role as UserRole;

  const getRoleTips = () => {
    switch (role) {
      case 'ADMIN': return adminTips;
      case 'TEACHER': return teacherTips;
      case 'STUDENT': return studentTips;
      case 'PARENT': return parentTips;
      default: return [];
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      {/* Page Header */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-600 p-6 text-white">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wNSkiLz48L3N2Zz4=')] opacity-40" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 rounded-xl bg-white/15 backdrop-blur-sm">
              <Lightbulb className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Centre d&apos;aide</h1>
              <p className="text-blue-100 text-sm">Conseils et raccourcis pour utiliser GradeUp</p>
            </div>
          </div>
          <Badge className={`mt-2 bg-gradient-to-r ${roleColors[role]} text-white border-0`}>
            {roleLabels[role]}
          </Badge>
        </div>
      </div>

      {/* Keyboard Shortcuts */}
      <Card className="transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/30">
              <Keyboard className="h-4 w-4 text-blue-600" />
            </div>
            Raccourcis clavier
          </CardTitle>
          <CardDescription>Gagnez du temps avec ces raccourcis</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {shortcuts.map((shortcut) => (
              <div key={shortcut.key} className="flex items-center justify-between p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors">
                <span className="text-sm text-foreground">{shortcut.description}</span>
                <kbd className="flex items-center gap-1 px-2.5 py-1 text-xs font-mono text-muted-foreground bg-background rounded-lg border border-border shadow-sm">
                  {shortcut.key}
                </kbd>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Role-specific Tips */}
      <Card className="transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30">
              <Sparkles className="h-4 w-4 text-emerald-600" />
            </div>
            Conseils pour {roleLabels[role].toLowerCase()}s
          </CardTitle>
          <CardDescription>Funcionalités utiles pour votre rôle</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {getRoleTips().map((tip, index) => {
              const Icon = tip.icon;
              return (
                <div
                  key={index}
                  className="flex items-start gap-3 p-4 rounded-xl hover:bg-accent/30 transition-all duration-200 group cursor-default"
                >
                  <div className={`p-2 rounded-lg bg-gradient-to-br ${roleColors[role]} text-white shadow-sm shrink-0 group-hover:scale-105 transition-transform`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{tip.title}</p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{tip.description}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/50 shrink-0 mt-0.5" />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* General Tips */}
      <Card className="transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/30">
              <Lightbulb className="h-4 w-4 text-amber-600" />
            </div>
            Astuces générales
          </CardTitle>
          <CardDescription>Trucs et astuces pour tous les utilisateurs</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {generalTips.map((tip, index) => {
              const Icon = tip.icon;
              return (
                <div
                  key={index}
                  className="flex items-start gap-3 p-4 rounded-xl hover:bg-accent/30 transition-all duration-200 group cursor-default"
                >
                  <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-600 shrink-0 group-hover:scale-105 transition-transform">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{tip.title}</p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{tip.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* About Section */}
      <Card className="overflow-hidden transition-all duration-300 hover:shadow-lg">
        <div className="bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 p-6 text-white">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <Image src="/logo-mark.svg" alt="GradeUp" width={56} height={56} className="w-14 h-14 drop-shadow-lg" />
            <div className="text-center sm:text-left">
              <h3 className="text-lg font-bold">GradeUp</h3>
              <p className="text-slate-300 text-sm mt-0.5">Plateforme de gestion scolaire intelligente</p>
              <p className="text-slate-400 text-xs mt-1">Version 2.0 • © GradeUp – Créé par Axion Labs Technologies</p>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 mt-3">
                <a
                  href="https://wa.me/243845072349"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/20 text-emerald-300 hover:text-white hover:bg-emerald-500/30 transition-all text-xs font-medium border border-emerald-500/30"
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current text-emerald-400" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  <span>WhatsApp: +243 845 072 349</span>
                </a>
                <a
                  href="https://instagram.com/axion_labs_technologies"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-pink-500/20 text-pink-300 hover:text-white hover:bg-pink-500/30 transition-all text-xs font-medium border border-pink-500/30"
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current text-pink-400" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
                  </svg>
                  <span>Instagram: @axion_labs_technologies</span>
                </a>
                <a
                  href="https://axionlabstechnologies.netlify.app/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-500/20 text-blue-300 hover:text-white hover:bg-blue-500/30 transition-all text-xs font-medium border border-blue-500/30"
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current text-blue-400" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                  </svg>
                  <span>Site web: axionlabstechnologies.netlify.app</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
