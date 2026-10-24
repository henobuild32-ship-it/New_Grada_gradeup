'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, Wallet, Users, Receipt, Loader2 } from 'lucide-react';
import { useAppStore } from '@/lib/store';

type Student = {
  id: string;
  fullName: string;
  matricule?: string;
  classEnrollments?: { class: { id: string; name: string; fees: number } }[];
};
type Payment = { id: string; amount: number; status: string; method: string; receiptNumber?: string | null; createdAt: string };

export default function CashierCaisse() {
  const { user } = useAppStore();
  const [search, setSearch] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [selected, setSelected] = useState<Student | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!user?.schoolId) return;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      const params = new URLSearchParams({ schoolId: user.schoolId, role: 'STUDENT' });
      if (search.trim()) params.set('search', search.trim());
      const response = await fetch(`/api/users?${params}`);
      const data = await response.json();
      setStudents(response.ok ? data.users ?? [] : []);
      setLoading(false);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search, user?.schoolId]);

  async function selectStudent(student: Student) {
    setSelected(student);
    setMessage('');
    const response = await fetch(`/api/payments?studentId=${student.id}`);
    const data = await response.json();
    setPayments(response.ok ? data.payments ?? [] : []);
  }

  const classInfo = selected?.classEnrollments?.[0]?.class;
  const totalPaid = useMemo(() => payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0), [payments]);
  const remaining = Math.max(0, Number(classInfo?.fees || 0) - totalPaid);

  async function savePayment() {
    if (!selected || Number(amount) <= 0) return;
    setSaving(true);
    setMessage('');
    const response = await fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: selected.id, amount: Number(amount), status: 'paid', method, currency: user?.school?.currency || 'USD' }),
    });
    const data = await response.json();
    if (response.ok) {
      setPayments((current) => [data.payment, ...current]);
      setAmount('');
      setMessage(`Paiement enregistré. Reçu n° ${data.payment.receiptNumber || '—'}`);
    } else setMessage(data.error || 'Enregistrement impossible.');
    setSaving(false);
  }

  return (
    <main className="min-h-full bg-slate-50 p-4 pb-24 md:p-8">
      <section className="mx-auto max-w-6xl space-y-5">
        <header className="rounded-3xl bg-gradient-to-br from-emerald-600 to-teal-700 p-5 text-white shadow-lg md:p-8">
          <p className="text-sm font-semibold uppercase tracking-wider text-emerald-100">Espace caisse</p>
          <h1 className="mt-2 text-2xl font-bold md:text-3xl">Enregistrer un paiement</h1>
          <p className="mt-2 text-sm text-emerald-50">Recherchez un élève pour consulter son solde et établir un reçu.</p>
        </header>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
          <section className="rounded-3xl bg-white p-4 shadow-sm md:p-6">
            <label className="relative block">
              <Search className="absolute left-4 top-3.5 h-5 w-5 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nom ou matricule de l'élève" className="h-12 w-full rounded-2xl border border-slate-200 pl-12 pr-4 outline-none focus:border-emerald-500" />
            </label>
            <div className="mt-4 flex items-center gap-2 text-sm text-slate-500"><Users className="h-4 w-4" /> {loading ? 'Recherche…' : `${students.length} élève(s)`}</div>
            <div className="mt-3 divide-y rounded-2xl border border-slate-100">
              {students.map((student) => <button key={student.id} onClick={() => selectStudent(student)} className={`block w-full p-4 text-left transition hover:bg-emerald-50 ${selected?.id === student.id ? 'bg-emerald-50' : ''}`}><strong className="block text-slate-900">{student.fullName}</strong><span className="text-sm text-slate-500">{student.matricule || 'Sans matricule'} · {student.classEnrollments?.[0]?.class.name || 'Classe inconnue'}</span></button>)}
              {!loading && students.length === 0 && <p className="p-6 text-center text-sm text-slate-500">Aucun élève trouvé.</p>}
            </div>
          </section>

          <section className="space-y-5">
            {selected ? <>
              <div className="rounded-3xl bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Élève sélectionné</p><h2 className="mt-1 text-xl font-bold text-slate-900">{selected.fullName}</h2><p className="text-sm text-slate-500">{classInfo?.name || 'Classe inconnue'}</p><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-emerald-50 p-4"><p className="text-xs text-emerald-700">Total payé</p><strong className="text-lg text-emerald-800">{totalPaid.toLocaleString()} {user?.school?.currency}</strong></div><div className="rounded-2xl bg-amber-50 p-4"><p className="text-xs text-amber-700">Reste</p><strong className="text-lg text-amber-800">{remaining.toLocaleString()} {user?.school?.currency}</strong></div></div></div>
              <div className="rounded-3xl bg-white p-5 shadow-sm"><div className="flex items-center gap-2 font-semibold"><Wallet className="h-5 w-5 text-emerald-600" /> Nouveau paiement</div><input type="number" min="1" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Montant" className="mt-4 h-12 w-full rounded-2xl border border-slate-200 px-4" /><select value={method} onChange={(event) => setMethod(event.target.value)} className="mt-3 h-12 w-full rounded-2xl border border-slate-200 px-4"><option value="cash">Espèces</option><option value="mobile">Mobile money</option><option value="virement">Virement bancaire</option><option value="cheque">Chèque</option></select><button disabled={saving || Number(amount) <= 0} onClick={savePayment} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 font-semibold text-white disabled:opacity-50">{saving && <Loader2 className="h-4 w-4 animate-spin" />} Enregistrer le paiement</button>{message && <p className="mt-3 text-center text-sm text-emerald-700">{message}</p>}</div>
              <div className="rounded-3xl bg-white p-5 shadow-sm"><div className="flex items-center gap-2 font-semibold"><Receipt className="h-5 w-5 text-slate-500" /> Historique récent</div>{payments.slice(0, 5).map((payment) => <div key={payment.id} className="flex justify-between border-b py-3 text-sm last:border-0"><span>{payment.receiptNumber || 'Paiement'}<small className="ml-2 text-slate-400">{payment.method}</small></span><strong>{Number(payment.amount).toLocaleString()}</strong></div>)}</div>
            </> : <div className="rounded-3xl bg-white p-8 text-center text-slate-500 shadow-sm">Sélectionnez un élève pour commencer.</div>}
          </section>
        </div>
      </section>
    </main>
  );
}
