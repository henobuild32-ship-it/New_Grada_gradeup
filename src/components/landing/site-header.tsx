'use client';

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Image from 'next/image';
import { useTheme } from 'next-themes';
import { announcement, nav, site } from './content';
import { BrandButton, Icon } from './primitives';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/* -------------------------------------------------------------------------- */
/*                          BARRE D'ANNONCE (fermable)                         */
/* -------------------------------------------------------------------------- */

const ANNOUNCEMENT_KEY = 'gradeup-announcement-dismissed';

/** localStorage est un système externe : on le lit via useSyncExternalStore. */
const subscribeAnnouncement = (onChange: () => void) => {
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
};

const readAnnouncementDismissed = () => {
  try {
    return localStorage.getItem(ANNOUNCEMENT_KEY) === '1';
  } catch {
    return false;
  }
};

function AnnouncementBar() {
  const dismissedInStorage = useSyncExternalStore(
    subscribeAnnouncement,
    readAnnouncementDismissed,
    () => false,
  );
  const [closed, setClosed] = useState(false);

  if (closed || dismissedInStorage) return null;

  return (
    <div className="bg-brand text-brand-foreground">
      <div className="landing-container flex min-h-10 items-center justify-center gap-2 py-1.5 text-center text-[13px] leading-snug">
        <span>{announcement.text}</span>
        <a
          href={announcement.href}
          className="shrink-0 font-semibold underline underline-offset-2 hover:opacity-90"
        >
          {announcement.cta}
        </a>
        <button
          type="button"
          onClick={() => {
            try {
              localStorage.setItem(ANNOUNCEMENT_KEY, '1');
            } catch {
              /* stockage indisponible : la barre reste affichée jusqu'au rechargement */
            }
            setClosed(true);
          }}
          className="ml-1 grid size-7 shrink-0 place-items-center rounded-md transition-colors hover:bg-white/15"
          aria-label="Fermer l’annonce"
        >
          <span aria-hidden="true" className="text-base leading-none">
            ×
          </span>
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                             BASCULE THÈME (menu)                            */
/* -------------------------------------------------------------------------- */

function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const options = [
    { value: 'light', label: 'Clair' },
    { value: 'dark', label: 'Sombre' },
    { value: 'system', label: 'Système' },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Thème de l’interface"
      className="inline-flex rounded-lg border border-line bg-surface p-1"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={theme === option.value}
          onClick={() => setTheme(option.value)}
          className={`h-9 rounded-md px-3 text-[13px] font-medium transition-colors ${
            theme === option.value
              ? 'bg-brand text-brand-foreground'
              : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   EN-TÊTE                                   */
/* -------------------------------------------------------------------------- */

export function SiteHeader({
  onLogin,
  onDemo,
}: {
  onLogin: () => void;
  onDemo: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const burgerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const lastFocused = useRef<Element | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Menu plein écran : piège à focus + fermeture par Échap + verrouillage du scroll
  useEffect(() => {
    if (!open) return;

    lastFocused.current = document.activeElement;
    const panel = panelRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusables = () =>
      Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
        (element) => element.offsetParent !== null,
      );

    focusables()[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;

      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      (lastFocused.current as HTMLElement | null)?.focus?.();
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      <AnnouncementBar />

      <header
        className={`sticky top-0 z-40 border-b bg-background/85 backdrop-blur-md transition-colors ${
          scrolled ? 'border-line' : 'border-transparent'
        }`}
      >
        <div className="landing-container flex h-16 items-center justify-between gap-4">
          {/* Logo */}
          <a
            href="#top"
            className="flex items-center gap-2.5 rounded-md"
            aria-label={`${site.name}, retour en haut de page`}
          >
            <span className="shrink-0 overflow-hidden rounded-xl bg-[#111820] ring-1 ring-black/10 dark:ring-white/10">
              <Image src="/logo-gradeup.png" alt="Logo officiel GradeUp" width={48} height={48} className="size-11 object-contain" priority />
            </span>
            <span className="text-[17px] font-semibold tracking-tight text-foreground">{site.name}</span>
          </a>

          {/* Navigation desktop */}
          <nav aria-label="Navigation principale" className="hidden lg:block">
            <ul className="flex items-center gap-1">
              {nav.links.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {/* Actions desktop */}
          <div className="hidden items-center gap-1.5 lg:flex">
            <button
              type="button"
              onClick={onLogin}
              className="h-10 rounded-lg px-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
            >
              {nav.login}
            </button>
            <BrandButton size="md" onClick={onDemo} className="ml-1">
              {nav.demo}
            </BrandButton>
          </div>

          {/* Actions mobile */}
          <div className="flex items-center gap-1 lg:hidden">
            <button
              type="button"
              onClick={onLogin}
              className="h-11 rounded-lg px-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
            >
              {nav.login}
            </button>
            <button
              ref={burgerRef}
              type="button"
              onClick={() => setOpen(true)}
              aria-expanded={open}
              aria-controls="menu-mobile"
              aria-label="Ouvrir le menu"
              className="grid size-11 place-items-center rounded-lg border border-line text-foreground transition-colors hover:bg-muted"
            >
              <span className="flex flex-col gap-[5px]" aria-hidden="true">
                <span className="block h-0.5 w-4 bg-current" />
                <span className="block h-0.5 w-4 bg-current" />
                <span className="block h-0.5 w-4 bg-current" />
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Menu mobile plein écran */}
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background lg:hidden" id="menu-mobile">
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu de navigation"
            className="flex h-full flex-col"
          >
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-5">
              <div className="flex items-center gap-2.5">
                <span className="shrink-0 overflow-hidden rounded-xl bg-[#111820] ring-1 ring-black/10 dark:ring-white/10">
                  <Image src="/logo-gradeup.png" alt="Logo officiel GradeUp" width={48} height={48} className="size-11 object-contain" />
                </span>
                <span className="text-[17px] font-semibold tracking-tight text-foreground">{site.name}</span>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Fermer le menu"
                className="grid size-11 place-items-center rounded-lg border border-line text-foreground transition-colors hover:bg-muted"
              >
                <span aria-hidden="true" className="text-xl leading-none">
                  ×
                </span>
              </button>
            </div>

            <nav aria-label="Navigation mobile" className="flex-1 overflow-y-auto px-5 py-4">
              <ul className="flex flex-col">
                {nav.links.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      onClick={close}
                      className="flex min-h-12 items-center justify-between border-b border-line text-[15px] font-medium text-foreground"
                    >
                      {link.label}
                      <Icon name="ArrowRight" className="size-4 text-muted-foreground" />
                    </a>
                  </li>
                ))}
              </ul>

              <p className="mt-6 mb-2 text-[13px] font-medium text-muted-foreground">Apparence</p>
              <ThemeToggle />
            </nav>

            <div className="shrink-0 border-t border-line px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
              <BrandButton className="w-full" onClick={() => { close(); onDemo(); }}>
                {nav.demo}
              </BrandButton>
              <button
                type="button"
                onClick={() => {
                  close();
                  onLogin();
                }}
                className="mt-2 h-11 w-full rounded-lg text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
              >
                {nav.login}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
