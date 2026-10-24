'use client';

import React from 'react';
import Image from 'next/image';
import { useTheme } from 'next-themes';
import { footer, nav, site } from './content';
import { Icon, type IconName } from './primitives';

function ThemeSwitch() {
  const { theme, setTheme } = useTheme();

  // Pendant l'hydratation `theme` est indéfini : on propose par défaut le passage
  // au mode sombre, sans monter artificiellement un état « mounted ».
  const isDark = theme === 'dark';
  const next = isDark ? 'light' : 'dark';
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className="inline-flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      aria-label={`Passer en mode ${next === 'dark' ? 'sombre' : 'clair'}`}
    >
      <span aria-hidden="true" className="text-sm">
        {isDark ? '☀' : '☾'}
      </span>
      {isDark ? 'Clair' : 'Sombre'}
    </button>
  );
}

function Column({ column }: { column: (typeof footer.columns)[number] }) {
  return (
    <div>
      {/* Mobile : accordéon natif (accessible, sans JS) */}
      <details className="group border-b border-line py-3 lg:hidden">
        <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between text-sm font-semibold text-foreground">
          {column.title}
          <span className="text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true">
            ▾
          </span>
        </summary>
        <ul className="mt-2 space-y-1 pb-1">
          {column.links.map((link) => (
            <li key={link.label}>
              <a
                href={link.href}
                {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                className="inline-flex min-h-10 items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </details>

      {/* Desktop : colonne */}
      <div className="hidden lg:block">
        <h3 className="text-[13px] font-semibold uppercase tracking-wide text-foreground">{column.title}</h3>
        <ul className="mt-3 space-y-2">
          {column.links.map((link) => (
            <li key={link.label}>
              <a
                href={link.href}
                {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-background">
      <div className="landing-container py-12 lg:py-16">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)]">
          {/* Identité */}
          <div className="max-w-sm">
            <div className="flex items-center gap-2.5">
              <span className="shrink-0 overflow-hidden rounded-xl bg-[#111820] ring-1 ring-black/10 dark:ring-white/10">
                <Image src="/logo-gradeup.png" alt="Logo officiel GradeUp" width={56} height={56} className="size-14 object-contain" />
              </span>
              <span className="text-[17px] font-semibold tracking-tight text-foreground">{site.fullName}</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{footer.description}</p>

            <div className="mt-5 flex flex-col gap-2.5">
              {footer.contacts.map((contact) => (
                <a
                  key={contact.label}
                  href={contact.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Icon name={contact.icon} className="size-4 shrink-0" />
                  <span className="sr-only">{contact.label} : </span>
                  <span className="truncate">{contact.value}</span>
                </a>
              ))}
            </div>
          </div>

          {/* Colonnes de liens */}
          <div>
            <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
              {footer.columns.map((column) => (
                <Column key={column.title} column={column} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Barre légale */}
      <div className="border-t border-line">
        <div className="landing-container flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-muted-foreground">
            <span>{footer.rights}</span>
            <span className="hidden sm:inline" aria-hidden="true">
              ·
            </span>
            <a href="/confidentialite" className="transition-colors hover:text-foreground">
              Confidentialité
            </a>
            <a href="/faq" className="transition-colors hover:text-foreground">
              FAQ
            </a>
            <span className="rounded-md border border-line px-2 py-0.5 text-[12px] font-medium">
              {site.version}
            </span>
            <span className="hidden sm:inline">Axion Labs Technologies</span>
          </div>

          <div className="flex items-center gap-2">
            <ThemeSwitch />
            <a
              href={nav.links[0].href}
              className="inline-flex h-9 items-center rounded-lg border border-line px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Haut de page
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
