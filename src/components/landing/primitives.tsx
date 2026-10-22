'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Bell,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardCheck,
  DatabaseBackup,
  EyeOff,
  FileDown,
  Globe,
  GraduationCap,
  IdCard,
  Instagram,
  KeyRound,
  LineChart,
  Lock,
  MessageCircle,
  ShieldCheck,
  Sheet,
  Smartphone,
  Users,
  Wallet,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';

/** Toutes les icônes de la page, en trait 1.5 px, monochromes. */
export const ICONS = {
  ArrowRight,
  Bell,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardCheck,
  DatabaseBackup,
  EyeOff,
  FileDown,
  Globe,
  GraduationCap,
  IdCard,
  Instagram,
  KeyRound,
  LineChart,
  Lock,
  MessageCircle,
  ShieldCheck,
  Sheet,
  Smartphone,
  Users,
  Wallet,
  WifiOff,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  className = 'size-5',
  strokeWidth = 1.5,
}: {
  name: IconName;
  className?: string;
  strokeWidth?: number;
}) {
  const Cmp = ICONS[name];
  return <Cmp className={className} strokeWidth={strokeWidth} aria-hidden="true" />;
}

/* -------------------------------------------------------------------------- */
/*                                MISE EN PAGE                                 */
/* -------------------------------------------------------------------------- */

export function Container({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`landing-container ${className}`}>{children}</div>;
}

export function Section({
  id,
  children,
  tone = 'default',
  className = '',
  labelledBy,
}: {
  id?: string;
  children: React.ReactNode;
  /** `subtle` = fond neutre très léger, `brand` = fond de marque uni */
  tone?: 'default' | 'subtle' | 'line-top';
  className?: string;
  labelledBy?: string;
}) {
  const toneClass =
    tone === 'subtle'
      ? 'bg-surface border-y border-line'
      : tone === 'line-top'
        ? 'border-t border-line'
        : '';
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={`landing-section ${toneClass} ${className}`}
    >
      {children}
    </section>
  );
}

export function Eyebrow({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <p className={`landing-eyebrow ${className}`}>{children}</p>;
}

export function SectionHeading({
  eyebrow,
  title,
  intro,
  align = 'center',
  id,
}: {
  eyebrow?: string;
  title: string;
  intro?: string;
  align?: 'center' | 'left';
  id?: string;
}) {
  const aligned = align === 'center' ? 'text-center mx-auto items-center' : 'text-left items-start';
  return (
    <div className={`flex max-w-2xl flex-col gap-3 ${aligned}`}>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2 id={id} className="text-h2 tracking-tight text-foreground text-balance">
        {title}
      </h2>
      {intro && <p className="text-lead text-muted-foreground max-w-[65ch]">{intro}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 ANIMATIONS                                  */
/* -------------------------------------------------------------------------- */

/**
 * Apparition douce (opacité + translation 8 px, 400 ms).
 * Désactivée si `prefers-reduced-motion` est actif — aucun library externe.
 */
export function Reveal({
  children,
  delay = 0,
  className = '',
  as: Tag = 'div',
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  as?: keyof React.JSX.IntrinsicElements;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Mouvement réduit : neutralisé en CSS (motion-reduce:*), pas besoin d'état.
    // Navigateur sans IntersectionObserver : on rend le bloc visible en direct.
    if (!('IntersectionObserver' in window)) {
      node.style.opacity = '1';
      node.style.transform = 'none';
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const Component = Tag as React.ElementType;

  return (
    <Component
      ref={ref as never}
      style={{ transitionDelay: visible ? `${delay}ms` : '0ms' }}
      className={`transition-[opacity,transform] duration-[400ms] ease-out motion-reduce:transition-none motion-reduce:translate-y-0 motion-reduce:opacity-100 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      } ${className}`}
    >
      {children}
    </Component>
  );
}

/* -------------------------------------------------------------------------- */
/*                            COMPOSANTS RÉCURRENTS                            */
/* -------------------------------------------------------------------------- */

/** Bouton primaire de la page : un seul par écran. */
export function BrandButton({
  children,
  onClick,
  href,
  type = 'button',
  className = '',
  size = 'lg',
  ...rest
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  type?: 'button' | 'submit';
  className?: string;
  size?: 'md' | 'lg';
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type'>) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-lg bg-brand text-brand-foreground font-semibold shadow-[0_1px_2px_rgba(16,24,40,0.08),0_8px_24px_-12px_rgba(29,78,216,0.6)] transition-colors hover:bg-brand-hover active:bg-brand-active disabled:pointer-events-none disabled:opacity-60';
  const sizes = size === 'lg' ? 'h-12 px-6 text-[15px]' : 'h-10 px-4 text-sm';

  if (href) {
    return (
      <a href={href} className={`${base} ${sizes} ${className}`}>
        {children}
      </a>
    );
  }
  return (
    <button type={type} onClick={onClick} className={`${base} ${sizes} ${className}`} {...rest}>
      {children}
    </button>
  );
}

/** Bouton secondaire discret : bordure fine, fond transparent. */
export function GhostButton({
  children,
  onClick,
  href,
  className = '',
  size = 'lg',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  className?: string;
  size?: 'md' | 'lg';
}) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface font-semibold text-foreground transition-colors hover:bg-muted active:bg-muted';
  const sizes = size === 'lg' ? 'h-12 px-6 text-[15px]' : 'h-10 px-4 text-sm';

  if (href) {
    return (
      <a href={href} className={`${base} ${sizes} ${className}`}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={`${base} ${sizes} ${className}`}>
      {children}
    </button>
  );
}

/** Liste de points à puces cochées (bénéfices courts). */
export function CheckList({ items, className = '' }: { items: string[]; className?: string }) {
  return (
    <ul className={`flex flex-col gap-2 ${className}`}>
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground">
          <Check className="mt-0.5 size-4 shrink-0 text-signal" strokeWidth={2} aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
