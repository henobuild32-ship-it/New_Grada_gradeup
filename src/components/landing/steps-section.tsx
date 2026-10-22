import React from 'react';
import { steps } from './content';
import { Container, Reveal, Section, SectionHeading } from './primitives';

/** 3 étapes : verticale sur mobile, horizontale sur desktop. */
export function StepsSection() {
  return (
    <Section id={steps.id} aria-labelledby="etapes-title">
      <Container>
        <SectionHeading
          eyebrow={steps.eyebrow}
          title={steps.title}
          intro={steps.intro}
          id="etapes-title"
        />

        <p className="mt-5 text-center">
          <span className="inline-flex items-center rounded-full border border-brand/30 bg-brand/5 px-3 py-1 text-[13px] font-semibold text-brand">
            {steps.duration}
          </span>
        </p>

        <ol className="relative mt-10 grid gap-8 md:grid-cols-3 md:gap-6">
          {/* Ligne de temps */}
          <span
            aria-hidden="true"
            className="absolute left-[19px] top-3 h-[calc(100%-1.5rem)] w-px bg-line md:left-0 md:top-[19px] md:h-px md:w-full"
          />

          {steps.items.map((item, index) => (
            <li key={item.step} className="relative pl-12 md:pl-0 md:pt-12">
              <Reveal delay={index * 70}>
                <span
                  aria-hidden="true"
                  className="absolute left-0 top-0 grid size-10 place-items-center rounded-full border border-line bg-surface text-[13px] font-semibold text-brand md:top-0"
                >
                  {item.step}
                </span>
                <h3 className="text-h3 tracking-tight text-foreground">{item.title}</h3>
                <p className="mt-2 max-w-[42ch] text-sm leading-relaxed text-muted-foreground">
                  {item.description}
                </p>
              </Reveal>
            </li>
          ))}
        </ol>
      </Container>
    </Section>
  );
}
