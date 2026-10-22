'use client';

import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { pwa } from './content';
import { Container, Icon, Reveal, Section, SectionHeading } from './primitives';
import { PhoneFrame } from './device-frames';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Vrai sur iPhone/iPad/iPod avec un navigateur autre qu'Appareil photo/Edge/Firefox iOS. */
const detectIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) &&
  !/crios|fxios|edgios/i.test(navigator.userAgent);

const subscribeNothing = () => () => {};

/** Étapes d'installation, avec détection réelle de `beforeinstallprompt`. */
export function PwaSection() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const isIOS = useSyncExternalStore(subscribeNothing, detectIOS, () => false);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === 'accepted') setInstallEvent(null);
  };

  const stepsToShow = isIOS ? pwa.stepsIos : pwa.stepsAndroid;
  const canInstall = Boolean(installEvent) && !installed;

  return (
    <Section id={pwa.id} tone="subtle" aria-labelledby="pwa-title">
      <Container>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-14">
          <div>
            <SectionHeading
              eyebrow={pwa.eyebrow}
              title={pwa.title}
              intro={pwa.intro}
              align="left"
              id="pwa-title"
            />

            <Reveal delay={60}>
              <ol className="mt-8 flex flex-col gap-5">
                {stepsToShow.map((step, index) => (
                  <li key={step.title} className="flex gap-4">
                    <span
                      aria-hidden="true"
                      className="grid size-8 shrink-0 place-items-center rounded-full border border-line bg-surface text-[13px] font-semibold text-brand"
                    >
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-[15px] font-semibold text-foreground">{step.title}</p>
                      <p className="mt-0.5 max-w-[52ch] text-sm leading-relaxed text-muted-foreground">
                        {step.description}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </Reveal>

            <Reveal delay={120}>
              <ul className="mt-8 flex flex-col gap-3 border-t border-line pt-6">
                <li className="flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground">
                  <Icon name="WifiOff" className="mt-0.5 size-4 shrink-0 text-brand" />
                  {pwa.offline}
                </li>
                <li className="flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground">
                  <Icon name="Smartphone" className="mt-0.5 size-4 shrink-0 text-brand" />
                  {pwa.light}
                </li>
              </ul>

              <div className="mt-6">
                {canInstall ? (
                  <button
                    type="button"
                    onClick={install}
                    className="inline-flex h-12 items-center gap-2 rounded-lg border border-line bg-surface px-5 text-[15px] font-semibold text-foreground transition-colors hover:bg-muted"
                  >
                    <Icon name="FileDown" className="size-4" />
                    {pwa.install}
                  </button>
                ) : installed ? (
                  <p className="text-sm font-medium text-signal">Application installée.</p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {isIOS
                      ? 'Sur iPhone, utilisez le bouton « Partager » de Safari.'
                      : 'Le bouton d’installation s’active dans le navigateur compatible.'}
                  </p>
                )}
              </div>
            </Reveal>
          </div>

          <Reveal delay={100} className="flex justify-center lg:justify-end">
            <PhoneFrame label="GradeUp installé sur un téléphone, écran d’accueil">
              <div className="min-h-[420px] bg-muted/30 p-4">
                <div className="mb-4 flex items-center gap-2">
                  <span className="grid size-6 place-items-center rounded-[7px] bg-brand text-[10px] font-bold text-white">
                    G
                  </span>
                  <span className="text-[12px] font-semibold text-foreground">GradeUp</span>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {['Notes', 'Présences', 'Devoirs', 'Bulletins', 'Messages', 'Paiements'].map((label) => (
                    <div key={label} className="rounded-xl border border-line bg-surface p-3">
                      <span className="grid size-7 place-items-center rounded-lg bg-brand/10 text-brand">
                        <span className="size-3 rounded-sm border border-current" aria-hidden="true" />
                      </span>
                      <p className="mt-2 text-[10.5px] font-medium text-foreground">{label}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 rounded-xl border border-line bg-surface p-3">
                  <p className="text-[10.5px] font-semibold text-foreground">Prochain cours</p>
                  <p className="mt-0.5 text-[9.5px] text-muted-foreground">
                    Mathématiques · 4e Humanités A · 10 h 30
                  </p>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full w-1/3 rounded-full bg-brand" />
                  </div>
                </div>
                <div className="mt-3 rounded-xl border border-dashed border-line p-3 text-center">
                  <p className="text-[9.5px] text-muted-foreground">Mode hors ligne — saisie en attente</p>
                </div>
              </div>
            </PhoneFrame>
          </Reveal>
        </div>
      </Container>
    </Section>
  );
}
