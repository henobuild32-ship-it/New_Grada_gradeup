import React from 'react';

/**
 * Maquettes produit (HTML/CSS, aucun asset externe).
 * Elles représentent réellement l'interface GradeUp : les remplacer par de
 * vraies captures d'écran dès qu'elles sont disponibles — voir la note de recette.
 */

/* -------------------------------------------------------------------------- */
/*                                   CADRES                                    */
/* -------------------------------------------------------------------------- */

export function LaptopFrame({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div role="img" aria-label={label} className="relative">
      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.06),0_24px_60px_-30px_rgba(16,24,40,0.35)]">
        {/* Barre de navigateur */}
        <div className="flex items-center gap-2 border-b border-line bg-muted/50 px-3 py-2">
          <span className="size-2 rounded-full bg-[#e5e7eb]" />
          <span className="size-2 rounded-full bg-[#e5e7eb]" />
          <span className="size-2 rounded-full bg-[#e5e7eb]" />
          <span className="ml-2 hidden truncate rounded-md border border-line bg-surface px-2 py-0.5 text-[10px] text-muted-foreground sm:block">
            gradeup.app/tableau-de-bord
          </span>
        </div>
        <div className="bg-surface">{children}</div>
      </div>
      {/* Base du laptop */}
      <div className="mx-auto h-2 w-[86%] rounded-b-lg bg-[#e5e7eb] dark:bg-[#27272a]" />
      <div className="mx-auto h-1 w-[62%] rounded-b-md bg-[#d1d5db] dark:bg-[#3f3f46]" />
    </div>
  );
}

export function PhoneFrame({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div role="img" aria-label={label} className="relative w-full max-w-[248px]">
      <div className="overflow-hidden rounded-[28px] border-[6px] border-[#111827] bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.1),0_30px_60px_-30px_rgba(16,24,40,0.5)]">
        <div className="flex items-center justify-center bg-[#111827] py-1.5">
          <span className="h-1 w-14 rounded-full bg-[#374151]" />
        </div>
        <div className="bg-surface">{children}</div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                              ÉCRANS PRODUIT                                 */
/* -------------------------------------------------------------------------- */

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-2.5">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-[15px] font-semibold leading-none text-foreground">{value}</p>
      {hint && <p className="mt-1 text-[9px] text-muted-foreground/80">{hint}</p>}
    </div>
  );
}

/** Tableau de bord direction (desktop). */
export function DashboardScreen() {
  const nav = ['Tableau de bord', 'Élèves', 'Classes', 'Notes', 'Paiements', 'Bulletins'];
  const rows = [
    ['Nadège Mbuyi', '4e Humanités A', '14,6/20', '2e'],
    ['Patrick Ilunga', '3e EB B', '11,2/20', '17e'],
    ['Grâce Tshibangu', '6e EB A', '16,1/20', '1er'],
    ['Emmanuel Kanku', '4e Humanités A', '9,8/20', '31e'],
  ];
  return (
    <div className="flex min-h-[240px] text-left sm:min-h-[300px]">
      {/* Barre latérale */}
      <div className="hidden w-[112px] shrink-0 border-r border-line bg-muted/40 p-2 sm:block">
        <div className="mb-3 flex items-center gap-1.5 px-1">
          <span className="grid size-4 place-items-center rounded-[5px] bg-brand text-[8px] font-bold text-white">G</span>
          <span className="text-[10px] font-semibold text-foreground">GradeUp</span>
        </div>
        <ul className="space-y-0.5">
          {nav.map((item, i) => (
            <li
              key={item}
              className={`rounded-md px-1.5 py-1 text-[9.5px] ${
                i === 0 ? 'bg-brand text-brand-foreground font-semibold' : 'text-muted-foreground'
              }`}
            >
              {item}
            </li>
          ))}
        </ul>
      </div>

      {/* Contenu */}
      <div className="min-w-0 flex-1 p-3 sm:p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-[13px] font-semibold leading-tight text-foreground">Tableau de bord</p>
            <p className="text-[9.5px] text-muted-foreground">Lycée La Grâce · Année 2025-2026</p>
          </div>
          <span className="rounded-full border border-line px-2 py-0.5 text-[9px] text-muted-foreground">
            Direction
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatCard label="Élèves inscrits" value="486" hint="+12 ce trimestre" />
          <StatCard label="Enseignants" value="27" hint="Tous actifs" />
          <StatCard label="Minerval encaissé" value="72 %" hint="Sur 3 échéances" />
          <StatCard label="Présence du jour" value="94 %" hint="486 élèves" />
        </div>

        <div className="mt-3 overflow-hidden rounded-lg border border-line">
          <div className="flex items-center justify-between border-b border-line bg-muted/40 px-2.5 py-1.5">
            <p className="text-[9.5px] font-semibold text-foreground">Meilleures moyennes du trimestre</p>
            <p className="text-[9px] text-muted-foreground">Rang</p>
          </div>
          <table className="w-full text-[9.5px]">
            <tbody>
              {rows.map(([name, cls, note, rank]) => (
                <tr key={name} className="border-b border-line/70 last:border-0">
                  <td className="px-2.5 py-1.5 font-medium text-foreground">{name}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">{cls}</td>
                  <td className="px-2 py-1.5 text-foreground">{note}</td>
                  <td className="px-2.5 py-1.5 text-right text-muted-foreground">{rank}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/** Bulletin scolaire (desktop). */
export function BulletinScreen() {
  const rows: [string, string, string, string][] = [
    ['Mathématiques', '15,5 / 20', 'Très bien', '4,65'],
    ['Physique-Chimie', '13,0 / 20', 'Assez bien', '3,90'],
    ['Français', '16,0 / 20', 'Très bien', '4,80'],
    ['Histoire-Géographie', '12,5 / 20', 'Passable', '2,50'],
    ['Anglais', '14,5 / 20', 'Bien', '4,35'],
    ['SVT', '15,0 / 20', 'Très bien', '3,00'],
  ];
  return (
    <div className="min-h-[240px] p-3 text-left sm:min-h-[300px] sm:p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold leading-tight text-foreground">Bulletin — 1er trimestre</p>
          <p className="text-[9.5px] text-muted-foreground">Nadège Mbuyi · Matricule MAT-2025-1042 · 4e Humanités A</p>
        </div>
        <span className="rounded-md bg-signal/10 px-1.5 py-0.5 text-[9px] font-semibold text-signal">
          Publié
        </span>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2">
        <StatCard label="Moyenne générale" value="14,6 / 20" hint="Assez bien" />
        <StatCard label="Rang" value="2e" hint="sur 42 élèves" />
        <StatCard label="Absences" value="2 h" hint="Justifiées" />
      </div>

      <div className="overflow-hidden rounded-lg border border-line">
        <table className="w-full text-[9.5px]">
          <thead>
            <tr className="border-b border-line bg-muted/40 text-muted-foreground">
              <th className="px-2.5 py-1.5 text-left font-medium">Matière</th>
              <th className="px-2 py-1.5 text-left font-medium">Note</th>
              <th className="hidden px-2 py-1.5 text-left font-medium sm:table-cell">Appréciation</th>
              <th className="px-2.5 py-1.5 text-right font-medium">Bonus</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([subject, note, comment, coef]) => (
              <tr key={subject} className="border-b border-line/70 last:border-0">
                <td className="px-2.5 py-1.5 font-medium text-foreground">{subject}</td>
                <td className="px-2 py-1.5 text-foreground">{note}</td>
                <td className="hidden px-2 py-1.5 text-muted-foreground sm:table-cell">{comment}</td>
                <td className="px-2.5 py-1.5 text-right text-muted-foreground">{coef}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-end justify-between gap-2">
        <p className="text-[9px] text-muted-foreground">
          Appréciation du titulaire : « Trimestre sérieux, bons résultats. »
        </p>
        <span className="rounded-md border border-dashed border-line px-2 py-1 text-[8.5px] text-muted-foreground">
          Signature direction
        </span>
      </div>
    </div>
  );
}

/** Cahier de cotation (desktop). */
export function CahierScreen() {
  const students = [
    { name: 'Nadège Mbuyi', marks: ['15', '14', '16', '15', '14'] },
    { name: 'Patrick Ilunga', marks: ['11', '12', '10', '13', '11'] },
    { name: 'Grâce Tshibangu', marks: ['17', '16', '15', '17', '16'] },
    { name: 'Emmanuel Kanku', marks: ['9', '10', '11', '9', '10'] },
    { name: 'Sarah Luboya', marks: ['13', '14', '13', '15', '14'] },
  ];
  return (
    <div className="min-h-[240px] p-3 text-left sm:min-h-[300px] sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[13px] font-semibold leading-tight text-foreground">Cahier de cotation</p>
          <p className="text-[9.5px] text-muted-foreground">Mathématiques · 4e Humanités A · 1er trimestre</p>
        </div>
        <div className="flex gap-1">
          {['C1', 'C2', 'Devoir', 'C3', 'Examen'].map((label) => (
            <span key={label} className="rounded-md border border-line px-1.5 py-0.5 text-[8.5px] text-muted-foreground">
              {label}
            </span>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-line">
        <table className="w-full text-[9.5px]">
          <thead>
            <tr className="border-b border-line bg-muted/40 text-muted-foreground">
              <th className="px-2.5 py-1.5 text-left font-medium">Élève</th>
              <th className="px-1.5 py-1.5 text-center font-medium">C1</th>
              <th className="px-1.5 py-1.5 text-center font-medium">C2</th>
              <th className="px-1.5 py-1.5 text-center font-medium">D</th>
              <th className="px-1.5 py-1.5 text-center font-medium">C3</th>
              <th className="px-1.5 py-1.5 text-center font-medium">Ex</th>
              <th className="px-2.5 py-1.5 text-right font-medium">Moy.</th>
            </tr>
          </thead>
          <tbody>
            {students.map((student) => {
              const avg = (
                student.marks.reduce((sum, mark) => sum + Number(mark), 0) / student.marks.length
              ).toFixed(1);
              return (
                <tr key={student.name} className="border-b border-line/70 last:border-0">
                  <td className="px-2.5 py-1.5 font-medium text-foreground">{student.name}</td>
                  {student.marks.map((mark, index) => (
                    <td key={index} className="px-1.5 py-1.5 text-center text-muted-foreground">
                      {mark}
                    </td>
                  ))}
                  <td className="px-2.5 py-1.5 text-right font-semibold text-foreground">{avg}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-[9px] text-muted-foreground">Moyenne de la classe : 13,4 / 20</p>
        <span className="rounded-md bg-brand px-2 py-1 text-[9px] font-semibold text-brand-foreground">
          Envoyer au titulaire
        </span>
      </div>
    </div>
  );
}

/** Notes d'un élève (desktop). */
export function GradesScreen() {
  const subjects: [string, number][] = [
    ['Mathématiques', 15.5],
    ['Français', 16],
    ['Anglais', 14.5],
    ['Physique', 13],
    ['Histoire-Géo', 12.5],
    ['SVT', 15],
  ];
  return (
    <div className="min-h-[240px] p-3 text-left sm:min-h-[300px] sm:p-4">
      <div className="mb-3">
        <p className="text-[13px] font-semibold leading-tight text-foreground">Mes notes</p>
        <p className="text-[9.5px] text-muted-foreground">1er trimestre · 4e Humanités A</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {subjects.map(([name, note]) => (
          <div key={name} className="rounded-lg border border-line bg-surface p-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[10.5px] font-medium text-foreground">{name}</span>
              <span className="text-[11px] font-semibold text-foreground">
                {String(note).replace('.', ',')}<span className="text-[9px] font-normal text-muted-foreground"> / 20</span>
              </span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full ${note >= 10 ? 'bg-brand' : 'bg-[#b91c1c]'}`}
                style={{ width: `${(note / 20) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between rounded-lg border border-line bg-muted/40 px-2.5 py-2">
        <span className="text-[9.5px] text-muted-foreground">Moyenne générale</span>
        <span className="text-[12px] font-semibold text-foreground">14,4 / 20</span>
      </div>
    </div>
  );
}

/** Espace parent (téléphone). */
export function ParentPhoneScreen() {
  return (
    <div className="min-h-[420px] text-left">
      <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
        <div>
          <p className="text-[11px] font-semibold leading-tight text-foreground">Mon enfant</p>
          <p className="text-[8.5px] text-muted-foreground">Lycée La Grâce</p>
        </div>
        <span className="grid size-5 place-items-center rounded-full bg-brand text-[9px] font-semibold text-white">
          NM
        </span>
      </div>

      <div className="space-y-2.5 p-3">
        <div className="rounded-xl border border-line p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-foreground">Nadège Mbuyi</p>
              <p className="text-[8.5px] text-muted-foreground">4e Humanités A · MAT-2025-1042</p>
            </div>
            <span className="rounded-md bg-signal/10 px-1.5 py-0.5 text-[8.5px] font-semibold text-signal">
              Bulletin publié
            </span>
          </div>

          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-muted/60 p-2">
              <p className="text-[8.5px] text-muted-foreground">Moyenne</p>
              <p className="text-[13px] font-semibold leading-tight text-foreground">14,6</p>
            </div>
            <div className="rounded-lg bg-muted/60 p-2">
              <p className="text-[8.5px] text-muted-foreground">Rang</p>
              <p className="text-[13px] font-semibold leading-tight text-foreground">2e / 42</p>
            </div>
          </div>

          <div className="mt-2.5 flex gap-2">
            <span className="flex-1 rounded-lg bg-brand px-2 py-1.5 text-center text-[9.5px] font-semibold text-brand-foreground">
              Voir le bulletin
            </span>
            <span className="rounded-lg border border-line px-2 py-1.5 text-[9.5px] font-medium text-foreground">
              PDF
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-line p-3">
          <div className="flex items-center justify-between">
            <p className="text-[10.5px] font-semibold text-foreground">Minerval</p>
            <span className="text-[9.5px] text-muted-foreground">3e échéance</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full w-2/3 rounded-full bg-brand" />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[9px]">
            <span className="text-muted-foreground">Payé : 200 USD</span>
            <span className="font-medium text-foreground">Reste : 100 USD</span>
          </div>
        </div>

        <div className="rounded-xl border border-line p-3">
          <p className="text-[10.5px] font-semibold text-foreground">Dernières nouvelles</p>
          <ul className="mt-1.5 space-y-1.5 text-[9px] text-muted-foreground">
            <li className="flex gap-1.5">
              <span className="mt-1 size-1 shrink-0 rounded-full bg-brand" />
              Conseil de classe le 12 décembre à 14 h.
            </li>
            <li className="flex gap-1.5">
              <span className="mt-1 size-1 shrink-0 rounded-full bg-brand" />
              Absence enregistrée le 3 novembre (2 h).
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
