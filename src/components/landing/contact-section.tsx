'use client';

import React, { useState } from 'react';
import { pricing, site } from './content';
import { Container, Icon, Reveal, Section, SectionHeading } from './primitives';

type FormState = { name: string; school: string; phone: string; students: string };

/** Bloc « Parlons de votre école » : formulaire court + WhatsApp. */
export function ContactSection() {
  const [values, setValues] = useState<FormState>({ name: '', school: '', phone: '', students: '' });
  const [status, setStatus] = useState<'idle' | 'sent'>('idle');

  const update = (key: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = [
      'Bonjour, je souhaite une proposition tarifaire pour GradeUp.',
      `Nom : ${values.name}`,
      `École : ${values.school}`,
      `Téléphone : ${values.phone}`,
      values.students ? `Effectif : ${values.students}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    window.open(`${site.whatsapp.href}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
    setStatus('sent');
  };

  return (
    <Section id={pricing.id} tone="subtle" aria-labelledby="tarifs-title">
      <Container>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14">
          <div className="max-w-xl">
            <SectionHeading
              eyebrow={pricing.eyebrow}
              title={pricing.title}
              intro={pricing.intro}
              align="left"
              id="tarifs-title"
            />

            <Reveal delay={80}>
              <div className="mt-8 flex flex-col gap-4 border-t border-line pt-6">
                <a
                  href={site.whatsapp.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2.5 text-sm font-medium text-foreground transition-colors hover:text-brand"
                >
                  <Icon name="MessageCircle" className="size-4 text-brand" />
                  {pricing.whatsapp} — {site.whatsapp.label}
                </a>
                <p className="text-sm text-muted-foreground">{pricing.note}</p>
              </div>
            </Reveal>
          </div>

          <Reveal delay={60}>
            <form
              onSubmit={onSubmit}
              className="rounded-xl border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(16,24,40,0.06),0_20px_50px_-35px_rgba(16,24,40,0.5)] sm:p-6"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                {pricing.contactFields.map((field) => (
                  <div key={field.name} className={field.name === 'students' ? 'sm:col-span-2' : ''}>
                    <label
                      htmlFor={`contact-${field.name}`}
                      className="mb-1.5 block text-[13px] font-medium text-foreground"
                    >
                      {field.label}
                      {field.required && (
                        <span className="text-brand" aria-hidden="true">
                          {' '}
                          *
                        </span>
                      )}
                    </label>
                    <input
                      id={`contact-${field.name}`}
                      name={field.name}
                      type={field.type}
                      required={field.required}
                      placeholder={field.placeholder}
                      value={values[field.name as keyof FormState]}
                      onChange={update(field.name as keyof FormState)}
                      autoComplete={
                        field.name === 'name' ? 'name' : field.name === 'phone' ? 'tel' : 'organization'
                      }
                      className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-[15px] text-foreground placeholder:text-muted-foreground/70 transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                    />
                  </div>
                ))}
              </div>

              <button
                type="submit"
                className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-brand px-6 text-[15px] font-semibold text-brand-foreground transition-colors hover:bg-brand-hover active:bg-brand-active"
              >
                {pricing.submit}
                <Icon name="ArrowRight" className="size-4" />
              </button>

              <p role="status" aria-live="polite" className="mt-3 text-center text-[13px] text-muted-foreground">
                {status === 'sent'
                  ? 'Votre demande est prête : elle a été ouverte dans WhatsApp, il ne reste qu’à l’envoyer.'
                  : 'Vos informations partent directement dans notre fil WhatsApp.'}
              </p>
            </form>
          </Reveal>
        </div>
      </Container>
    </Section>
  );
}
