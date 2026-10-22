'use client';

import React, { useState } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { faq } from './content';
import { Container, Section, SectionHeading } from './primitives';

/** FAQ : 8 questions, une seule réponse ouverte à la fois. */
export function FaqSection() {
  const [open, setOpen] = useState<string | undefined>(faq.items[0].q);

  return (
    <Section id={faq.id} aria-labelledby="faq-title">
      <Container>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-14">
          <SectionHeading
            eyebrow={faq.eyebrow}
            title={faq.title}
            align="left"
            id="faq-title"
          />

          <Accordion
            type="single"
            collapsible
            value={open}
            onValueChange={setOpen}
            className="w-full"
          >
            {faq.items.map((item, index) => (
              <AccordionItem key={item.q} value={item.q} className="border-line">
                <AccordionTrigger className="py-4 text-left text-[15px] font-semibold leading-snug text-foreground hover:text-brand hover:no-underline">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                  {item.a}
                </AccordionContent>
                <span className="sr-only">Question {index + 1}</span>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </Container>
    </Section>
  );
}
