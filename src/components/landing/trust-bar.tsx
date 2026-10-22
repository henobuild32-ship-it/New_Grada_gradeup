import React from 'react';
import { trust } from './content';
import { Container, Reveal, Section } from './primitives';

/** Bande de confiance : engagements vérifiables, jamais de chiffres inventés. */
export function TrustBar() {
  return (
    <Section tone="subtle" className="landing-section-tight">
      <Container>
        <ul className="grid gap-6 sm:grid-cols-3 sm:gap-8">
          {trust.items.map((item, index) => (
            <li key={item.title}>
              <Reveal delay={index * 60}>
                <p className="text-[15px] font-semibold text-foreground">{item.title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground max-w-[40ch]">
                  {item.description}
                </p>
              </Reveal>
            </li>
          ))}
        </ul>
      </Container>
    </Section>
  );
}
