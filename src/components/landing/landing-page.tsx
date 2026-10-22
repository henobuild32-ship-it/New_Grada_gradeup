'use client';

import React from 'react';
import { SiteHeader } from './site-header';
import { SiteFooter } from './site-footer';
import { Hero } from './hero';
import { TrustBar } from './trust-bar';
import { ProblemSolution } from './problem-solution';
import { FeaturesBento } from './features-bento';
import { GradieSection } from './gradie-section';
import { ProfilesTabs } from './profiles-tabs';
import { StepsSection } from './steps-section';
import { PwaSection } from './pwa-section';
import { SecuritySection } from './security-section';
import { TestimonialsSection } from './testimonials-section';
import { ContactSection } from './contact-section';
import { FaqSection } from './faq-section';
import { FinalCta } from './final-cta';

export type LandingAction = 'login' | 'register-school' | 'register-user';

/**
 * Page d'accueil GradeUp.
 * Tous les points d'entrée (boutons, liens) remontent à l'appelant via `onAction`,
 * qui choisit la vue d'authentification à afficher.
 */
export function LandingPage({
  onAction,
}: {
  onAction: (action: LandingAction) => void;
}) {
  const scrollToContact = () => {
    const target = document.getElementById('tarifs');
    if (!target) return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'start' });
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  };

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <a href="#contenu" className="skip-link">
        Aller au contenu
      </a>

      <SiteHeader onLogin={() => onAction('login')} onDemo={scrollToContact} />

      <main id="contenu" className="flex-1">
        <Hero
          onCreate={() => onAction('register-school')}
          onJoin={() => onAction('register-user')}
        />
        <TrustBar />
        <ProblemSolution />
        <FeaturesBento />
        <GradieSection />
        <ProfilesTabs onRegister={() => onAction('register-user')} />
        <StepsSection />
        <PwaSection />
        <SecuritySection />
        <TestimonialsSection />
        <ContactSection />
        <FaqSection />
        <FinalCta onCreate={() => onAction('register-school')} onLogin={() => onAction('login')} />
      </main>

      <SiteFooter />
    </div>
  );
}
