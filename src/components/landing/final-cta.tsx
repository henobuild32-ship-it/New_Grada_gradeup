'use client';

import React from 'react';
import { finalCta } from './content';
import { Container, Icon, Reveal } from './primitives';

/** Appel à l'action final : fond de marque uni, un seul bouton principal. */
export function FinalCta({
  onCreate,
  onLogin,
}: {
  onCreate: () => void;
  onLogin: () => void;
}) {
  return (
    <section aria-labelledby="cta-final-title" className="bg-brand text-brand-foreground">
      <Container className="landing-section text-center">
        <Reveal>
          <h2 id="cta-final-title" className="mx-auto max-w-[18ch] text-h2 tracking-tight text-pretty">
            {finalCta.title}
          </h2>
          <p className="mx-auto mt-4 max-w-[52ch] text-lead text-white/85">{finalCta.subtitle}</p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={onCreate}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-white px-6 text-[15px] font-semibold text-brand transition-colors hover:bg-white/90 active:bg-white/85 sm:w-auto"
            >
              {finalCta.primary}
              <Icon name="ArrowRight" className="size-4" />
            </button>

            <button
              type="button"
              onClick={onLogin}
              className="inline-flex h-12 w-full items-center justify-center rounded-lg px-6 text-[15px] font-semibold text-white underline decoration-white/50 underline-offset-4 transition-colors hover:decoration-white sm:w-auto"
            >
              {finalCta.secondary}
            </button>
          </div>

          <p className="mt-4 text-sm text-white/80">{finalCta.note}</p>
        </Reveal>
      </Container>
    </section>
  );
}
