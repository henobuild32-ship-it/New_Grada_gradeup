'use client';

import React from 'react';
import { hero } from './content';
import { BrandButton, GhostButton, Icon, Reveal } from './primitives';
import { LaptopFrame, PhoneFrame, DashboardScreen, ParentPhoneScreen } from './device-frames';

export function Hero({
  onCreate,
  onJoin,
}: {
  onCreate: () => void;
  onJoin: () => void;
}) {
  return (
    <section id="top" aria-labelledby="hero-title" className="relative overflow-hidden">
      <div className="landing-container grid items-center gap-10 pb-16 pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-12 lg:pb-24 lg:pt-16">
        {/* Texte */}
        <div className="max-w-xl">
          <Reveal>
            <p className="landing-eyebrow">{hero.eyebrow}</p>
          </Reveal>

          <Reveal delay={60}>
            <h1 id="hero-title" className="mt-4 text-display tracking-tight text-foreground text-pretty">
              {hero.titleA} {hero.titleB} <span className="landing-underline">{hero.titleHighlight}</span>
            </h1>
          </Reveal>

          <Reveal delay={120}>
            <p className="mt-5 max-w-[65ch] text-lead text-muted-foreground">{hero.subtitle}</p>
          </Reveal>

          <Reveal delay={180}>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <BrandButton onClick={onCreate} className="w-full sm:w-auto">
                {hero.primaryCta}
              </BrandButton>
              <GhostButton href={hero.secondaryCtaHref} className="w-full sm:w-auto">
                {hero.secondaryCta}
              </GhostButton>
            </div>

            <p className="mt-4 text-sm text-muted-foreground">
              {hero.joinLine.prefix}{' '}
              <button
                type="button"
                onClick={onJoin}
                className="font-semibold text-brand underline decoration-brand/40 underline-offset-2 transition-colors hover:decoration-brand"
              >
                {hero.joinLine.link}
              </button>
            </p>
          </Reveal>

          {/* Réassurance */}
          <Reveal delay={240}>
            <ul className="mt-8 flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:flex-wrap sm:gap-x-6">
              {hero.reassurance.map((item, index) => (
                <li
                  key={item.label}
                  className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground"
                >
                  <Icon
                    name={index === 0 ? 'ShieldCheck' : index === 1 ? 'Smartphone' : 'WifiOff'}
                    className="size-4 text-brand"
                  />
                  {item.label}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        {/* Visuel produit */}
        <Reveal delay={120} className="relative">
          {/* Desktop : laptop + téléphone qui chevauche */}
          <div className="relative hidden lg:block">
            <LaptopFrame label="Tableau de bord de la direction dans GradeUp">
              <DashboardScreen />
            </LaptopFrame>
            <div className="absolute -bottom-10 -right-6 w-[196px]">
              <PhoneFrame label="Bulletin de l’enfant consulté par un parent sur téléphone">
                <ParentPhoneScreen />
              </PhoneFrame>
            </div>
          </div>

          {/* Mobile / tablette : une seule maquette téléphone, réservation de place */}
          <div className="mx-auto flex w-full max-w-[300px] justify-center lg:hidden">
            <PhoneFrame label="Bulletin de l’enfant consulté par un parent sur téléphone">
              <ParentPhoneScreen />
            </PhoneFrame>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
