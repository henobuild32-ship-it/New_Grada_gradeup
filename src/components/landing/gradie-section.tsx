import React from 'react';
import { gradie } from './content';
import { Container, Icon, Reveal, Section, SectionHeading } from './primitives';

/** Fenêtre de discussion : exemples de questions réelles posées à Gradie. */
export function GradieSection() {
  return (
    <Section id={gradie.id} tone="subtle" aria-labelledby="gradie-title">
      <Container>
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-14">
          <div className="max-w-xl">
            <SectionHeading
              eyebrow={gradie.eyebrow}
              title={gradie.title}
              intro={gradie.intro}
              align="left"
              id="gradie-title"
            />

            <Reveal delay={80}>
              <div className="mt-6 rounded-xl border border-line bg-surface p-4">
                <p className="text-[13px] font-semibold text-foreground">Exemples de questions</p>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {gradie.prompts.map((prompt) => (
                    <li key={prompt} className="text-sm text-muted-foreground">
                      « {prompt} »
                    </li>
                  ))}
                </ul>
              </div>
              <p className="mt-3 text-[13px] text-muted-foreground">{gradie.disclaimer}</p>
            </Reveal>
          </div>

          {/* Conversation */}
          <Reveal delay={120}>
            <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.06),0_24px_60px_-40px_rgba(16,24,40,0.4)]">
              <div className="flex items-center gap-3 border-b border-line px-4 py-3">
                <span className="grid size-8 place-items-center rounded-full bg-brand text-[13px] font-semibold text-brand-foreground">
                  G
                </span>
                <div>
                  <p className="text-sm font-semibold leading-tight text-foreground">Gradie</p>
                  <p className="text-[12px] text-muted-foreground">Assistant GradeUp</p>
                </div>
              </div>

              <div className="flex flex-col gap-3 p-4">
                {gradie.messages.map((message, index) => (
                  <div
                    key={index}
                    className={
                      message.role === 'user'
                        ? 'self-end max-w-[85%] rounded-xl rounded-br-sm bg-brand px-3.5 py-2.5 text-[13.5px] leading-relaxed text-brand-foreground'
                        : 'self-start max-w-[90%] rounded-xl rounded-bl-sm border border-line bg-muted/50 px-3.5 py-2.5 text-[13.5px] leading-relaxed text-foreground'
                    }
                  >
                    {message.text}
                  </div>
                ))}
              </div>

              <div className="border-t border-line px-4 py-3">
                <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2.5">
                  <Icon name="MessageCircle" className="size-4 text-muted-foreground" />
                  <span className="text-[13px] text-muted-foreground">Écrivez votre question…</span>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </Container>
    </Section>
  );
}
