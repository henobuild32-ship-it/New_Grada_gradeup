import React from 'react';
import { features } from './content';
import { Container, Icon, Reveal, Section, SectionHeading } from './primitives';
import { CahierScreen } from './device-frames';

/** Mini-interface « finances » : état des minervals par élève. */
function FinanceScreen() {
  const rows = ['Élève', 'Élève', 'Élève', 'Élève'];
  return (
    <div className="p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-[13px] font-semibold leading-tight text-foreground">Frais scolaires</p>
          <p className="text-[9.5px] text-muted-foreground">Classe et période sélectionnées</p>
        </div>
        <span className="rounded-md border border-line px-2 py-0.5 text-[9px] text-muted-foreground">USD · CDF</span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-line p-2.5">
          <p className="text-[9.5px] text-muted-foreground">Attendu</p>
          <p className="text-[14px] font-semibold leading-none text-foreground">—</p>
        </div>
        <div className="rounded-lg border border-line p-2.5">
          <p className="text-[9.5px] text-muted-foreground">Encaissé</p>
          <p className="text-[14px] font-semibold leading-none text-foreground">—</p>
        </div>
        <div className="rounded-lg border border-line p-2.5">
          <p className="text-[9.5px] text-muted-foreground">Reste dû</p>
          <p className="text-[14px] font-semibold leading-none text-foreground">—</p>
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-lg border border-line">
        <table className="w-full text-[9.5px]">
          <thead>
            <tr className="border-b border-line bg-muted/40 text-muted-foreground">
              <th className="px-2.5 py-1.5 text-left font-medium">Élève</th>
              <th className="px-2 py-1.5 text-right font-medium">Du</th>
              <th className="px-2 py-1.5 text-right font-medium">Payé</th>
              <th className="px-2.5 py-1.5 text-right font-medium">Solde</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((student, index) => (
              <tr key={index} className="border-b border-line/70 last:border-0">
                <td className="px-2.5 py-1.5 font-medium text-foreground">{student}</td>
                <td className="px-2 py-1.5 text-right text-muted-foreground">—</td>
                <td className="px-2 py-1.5 text-right text-muted-foreground">—</td>
                <td className="px-2.5 py-1.5 text-right font-semibold text-foreground">—</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[9.5px] text-muted-foreground">Les reçus et les soldes sont associés à chaque élève.</p>
    </div>
  );
}

function SmallCard({ item, delay }: { item: (typeof features.small)[number]; delay: number }) {
  return (
    <Reveal delay={delay} className="h-full">
      <article className="flex h-full flex-col gap-3 rounded-xl border border-line bg-surface p-5 transition-colors hover:border-brand/40">
        <span className="grid size-9 place-items-center rounded-lg border border-line text-brand">
          <Icon name={item.icon} />
        </span>
        <h3 className="text-[15px] font-semibold leading-snug text-foreground">{item.title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{item.description}</p>
      </article>
    </Reveal>
  );
}

export function FeaturesBento() {
  const [grading, finance] = features.large;

  return (
    <Section id={features.id} aria-labelledby="features-title">
      <Container>
        <SectionHeading
          eyebrow={features.eyebrow}
          title={features.title}
          intro={features.intro}
          id="features-title"
        />

        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4 lg:grid-rows-3">
          {/* Grande carte 1 — cahier de cotation */}
          <Reveal className="h-full lg:col-span-2 lg:row-span-2">
            <article className="flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface">
              <div className="flex flex-col gap-3 p-5 sm:p-6">
                <span className="grid size-9 place-items-center rounded-lg border border-line text-brand">
                  <Icon name={grading.icon} />
                </span>
                <h3 className="text-h3 tracking-tight text-foreground">{grading.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground max-w-[60ch]">
                  {grading.description}
                </p>
                <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1.5">
                  {grading.bullets.map((bullet) => (
                    <li key={bullet} className="text-[13px] font-medium text-foreground/80">
                      · {bullet}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-auto border-t border-line bg-muted/30">
                <CahierScreen />
              </div>
            </article>
          </Reveal>

          {/* Petites cartes (rangée 1-2, colonnes 3-4) */}
          {features.small.slice(0, 4).map((item, index) => (
            <SmallCard key={item.title} item={item} delay={index * 50} />
          ))}

          {/* Grande carte 2 — finances */}
          <Reveal delay={80} className="h-full lg:col-span-2">
            <article className="flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface">
              <div className="flex flex-col gap-3 p-5 sm:p-6">
                <span className="grid size-9 place-items-center rounded-lg border border-line text-brand">
                  <Icon name={finance.icon} />
                </span>
                <h3 className="text-h3 tracking-tight text-foreground">{finance.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground max-w-[60ch]">
                  {finance.description}
                </p>
                <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1.5">
                  {finance.bullets.map((bullet) => (
                    <li key={bullet} className="text-[13px] font-medium text-foreground/80">
                      · {bullet}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-auto border-t border-line bg-muted/30">
                <FinanceScreen />
              </div>
            </article>
          </Reveal>

          {/* Petites cartes restantes */}
          {features.small.slice(4).map((item, index) => (
            <SmallCard key={item.title} item={item} delay={index * 50} />
          ))}
        </div>
      </Container>
    </Section>
  );
}
