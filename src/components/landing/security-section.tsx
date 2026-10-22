import React from 'react';
import { security } from './content';
import { Container, Icon, Reveal, Section, SectionHeading } from './primitives';

export function SecuritySection() {
  return (
    <Section id={security.id} aria-labelledby="securite-title">
      <Container>
        <SectionHeading
          eyebrow={security.eyebrow}
          title={security.title}
          intro={security.intro}
          id="securite-title"
        />

        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {security.items.map((item, index) => (
            <li key={item.title}>
              <Reveal delay={index * 60} className="h-full">
                <div className="flex h-full flex-col gap-3 rounded-xl border border-line bg-surface p-5">
                  <span className="grid size-9 place-items-center rounded-lg border border-line text-brand">
                    <Icon name={item.icon} />
                  </span>
                  <h3 className="text-[15px] font-semibold text-foreground">{item.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{item.description}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ul>
      </Container>
    </Section>
  );
}
