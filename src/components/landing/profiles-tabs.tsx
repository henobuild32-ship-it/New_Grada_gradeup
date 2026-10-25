'use client';

import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { profiles } from './content';
import { BrandButton, Container, Icon, Reveal, Section, SectionHeading } from './primitives';
import {
  CahierScreen,
  CashierScreen,
  DashboardScreen,
  GradesScreen,
  LaptopFrame,
  ParentPhoneScreen,
  PhoneFrame,
} from './device-frames';

const SCREENS = {
  reader: { title: 'Vue en lecture seule de l’école', render: () => (
    <div className="space-y-3 p-4">
      <div className="flex items-center justify-between rounded-xl bg-brand/10 p-3">
        <div><p className="text-sm font-bold">Vue d’ensemble</p><p className="text-xs text-muted-foreground">Activité de l’établissement</p></div>
        <Icon name="EyeOff" className="size-5 text-brand" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {['Classes', 'Présences', 'Paiements', 'Communiqués'].map((label) => (
          <div key={label} className="rounded-xl border border-line bg-surface p-3 text-xs font-semibold">{label}<p className="mt-1 font-normal text-muted-foreground">Consultation</p></div>
        ))}
      </div>
      <div className="rounded-xl border border-line p-3 text-xs text-muted-foreground">Journal d’activité · accès en lecture seule</div>
    </div>
  ) },
  dashboard: { title: 'Tableau de bord de la direction', render: () => <DashboardScreen /> },
  cashier: { title: 'Espace caisse de l’établissement', render: () => <CashierScreen /> },
  grading: { title: 'Cahier de cotation de l’enseignant', render: () => <CahierScreen /> },
  parent: { title: 'Espace parent sur téléphone', render: () => <ParentPhoneScreen /> },
  grades: { title: 'Notes de l’élève', render: () => <GradesScreen /> },
} as const;

export function ProfilesTabs({ onRegister }: { onRegister: () => void }) {
  return (
    <Section id={profiles.id} aria-labelledby="profils-title">
      <Container>
        <SectionHeading
          eyebrow={profiles.eyebrow}
          title={profiles.title}
          id="profils-title"
        />

        <Reveal delay={80} className="mt-10">
          <Tabs defaultValue={profiles.tabs[0].key} className="w-full">
            <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-6">
              {profiles.tabs.map((tab) => (
                <TabsTrigger key={tab.key} value={tab.key} className="h-11 text-sm">
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {profiles.tabs.map((tab) => {
              const screen = SCREENS[tab.screen];
              const isPhone = tab.screen === 'parent';
              return (
                <TabsContent key={tab.key} value={tab.key} className="mt-6 focus-visible:outline-none">
                  <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-12">
                    <div className="max-w-md">
                      <p className="text-[15px] font-semibold text-foreground">{tab.label}</p>
                      <ol className="mt-4 flex flex-col gap-3">
                        {tab.tasks.map((task, index) => (
                          <li key={task} className="flex items-start gap-3">
                            <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-brand/30 text-[12px] font-semibold text-brand">
                              {index + 1}
                            </span>
                            <span className="text-[15px] leading-relaxed text-muted-foreground">{task}</span>
                          </li>
                        ))}
                      </ol>

                      <div className="mt-6">
                        <BrandButton size="md" onClick={onRegister}>
                          {tab.cta}
                          <Icon name="ArrowRight" className="size-4" />
                        </BrandButton>
                      </div>
                    </div>

                    <div className="flex justify-center lg:justify-end">
                      {isPhone ? (
                        <PhoneFrame label={screen.title}>{screen.render()}</PhoneFrame>
                      ) : (
                        <div className="w-full">
                          <LaptopFrame label={screen.title}>{screen.render()}</LaptopFrame>
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>
              );
            })}
          </Tabs>
        </Reveal>
      </Container>
    </Section>
  );
}
