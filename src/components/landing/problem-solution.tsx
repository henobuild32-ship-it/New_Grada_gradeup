import React from 'react';
import { problems } from './content';
import { Container, Eyebrow, Reveal, Section } from './primitives';

/** Avant / après : ce que l'école fait aujourd'hui, la réponse GradeUp en face. */
export function ProblemSolution() {
  return (
    <Section aria-labelledby="problemes-title">
      <Container>
        <div className="flex max-w-2xl flex-col gap-3">
          <Eyebrow>Avant / après</Eyebrow>
          <h2 id="problemes-title" className="text-h2 tracking-tight text-foreground text-balance">
            {problems.title}
          </h2>
          <p className="text-lead text-muted-foreground max-w-[65ch]">{problems.intro}</p>
        </div>

        <div className="mt-10 flex flex-col gap-4">
          {problems.items.map((item, index) => (
            <Reveal key={item.before} delay={index * 60}>
              <article className="grid overflow-hidden rounded-xl border border-line bg-surface md:grid-cols-2">
                {/* Avant */}
                <div className="border-b border-line bg-muted/40 p-5 md:border-b-0 md:border-r md:p-6">
                  <p className="text-[13px] font-medium uppercase tracking-wide text-muted-foreground">Avant</p>
                  <p className="mt-2 text-[17px] font-semibold leading-snug text-foreground">{item.before}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.beforeDetail}</p>
                </div>

                {/* Après */}
                <div className="bg-surface p-5 md:p-6">
                  <p className="text-[13px] font-medium uppercase tracking-wide text-signal">Avec GradeUp</p>
                  <p className="mt-2 text-[17px] font-semibold leading-snug text-foreground">{item.after}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.afterDetail}</p>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </Container>
    </Section>
  );
}
