'use client';

import { useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

interface ChartsWidgetProps {
  schoolId: string;
  currency?: string;
}

export function MonthlyRevenueChart({ schoolId, currency = 'USD' }: ChartsWidgetProps) {
  const [data, setData] = useState<{ month: string; revenue: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchRevenue = async () => {
      setError('');
      try {
        const res = await fetch(`/api/payments?schoolId=${schoolId}&status=paid`);
        if (!res.ok) throw new Error('Impossible de charger les paiements.');
        const json = await res.json();
        const payments: { amount: number; currency?: string; createdAt: string }[] = Array.isArray(json.payments) ? json.payments : [];

        const monthMap: Record<string, number> = {};
        const monthNames = [
          'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun',
          'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc',
        ];

        const currentMonth = new Date();
        const monthsToShow = Array.from({ length: 6 }, (_, index) => {
          const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - (5 - index), 1);
          const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          return { key, label: `${monthNames[date.getMonth()]} ${String(date.getFullYear()).slice(-2)}` };
        });
        payments.filter((payment) => (payment.currency || 'USD') === currency).forEach((payment) => {
          const dt = new Date(payment.createdAt);
          if (!Number.isFinite(dt.getTime())) return;
          const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
          monthMap[key] = (monthMap[key] || 0) + Number(payment.amount || 0);
        });
        setData(monthsToShow.map(({ key, label }) => ({ month: label, revenue: monthMap[key] || 0 })));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Erreur réseau lors du chargement des paiements.');
      } finally {
        setLoading(false);
      }
    };

    fetchRevenue();
  }, [schoolId, currency]);

  if (loading) {
    return (
      <Card className="transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Revenus mensuels · {currency}</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  return (
      <Card className="transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Revenus mensuels · {currency}</CardTitle>
      </CardHeader>
      <CardContent>
        {error ? <p role="alert" className="py-16 text-center text-sm text-destructive">{error}</p> : data.every((item) => item.revenue === 0) ? <p className="py-16 text-center text-sm text-muted-foreground">Aucun paiement confirmé en {currency} sur les six derniers mois.</p> :
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={{ stroke: 'hsl(var(--border))' }}
            />
            <YAxis
              tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={{ stroke: 'hsl(var(--border))' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '13px',
              }}
              formatter={(value: number) => [`${value.toLocaleString('fr-FR')} ${currency}`, 'Revenus']}
            />
            <Bar dataKey="revenue" fill="#3b82f6" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        }
      </CardContent>
    </Card>
  );
}

export function GradeDistributionChart({ schoolId }: ChartsWidgetProps) {
  const [data, setData] = useState<{ name: string; value: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchGrades = async () => {
      try {
        const res = await fetch(`/api/grades?schoolId=${schoolId}`);
        const json = await res.json();
        const grades: { score: number; maxScore: number }[] = Array.isArray(json) ? json : [];

        let excellent = 0;
        let bien = 0;
        let moyen = 0;
        let faible = 0;

        grades.forEach((g) => {
          const pct = (g.score / g.maxScore) * 100;
          if (pct >= 80) excellent++;
          else if (pct >= 60) bien++;
          else if (pct >= 40) moyen++;
          else faible++;
        });

        const result = [
          { name: 'Excellent (≥80%)', value: excellent },
          { name: 'Bien (60-79%)', value: bien },
          { name: 'Moyen (40-59%)', value: moyen },
          { name: 'Faible (<40%)', value: faible },
        ];

        setData(result.some((d) => d.value > 0) ? result : [
          { name: 'Aucune note', value: 1 },
        ]);
      } catch {
        setData([{ name: 'Aucune donnée', value: 1 }]);
      } finally {
        setLoading(false);
      }
    };

    fetchGrades();
  }, [schoolId]);

  if (loading) {
    return (
      <Card className="transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Distribution des notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Distribution des notes</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={90}
              paddingAngle={4}
              dataKey="value"
              label={({ name, percent }) =>
                `${name.split(' ')[0]} ${(percent * 100).toFixed(0)}%`
              }
              labelLine={{ strokeWidth: 1, stroke: 'hsl(var(--muted-foreground))' }}
            >
              {data.map((_, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={COLORS[index % COLORS.length]}
                  className="stroke-card"
                  strokeWidth={2}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '13px',
              }}
            />
            <Legend
              verticalAlign="bottom"
              iconType="circle"
              iconSize={8}
              formatter={(value: string) => (
                <span style={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))' }}>{value}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export function AttendanceTrendChart({ schoolId }: ChartsWidgetProps) {
  const [data, setData] = useState<{ day: string; rate: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAttendance = async () => {
      try {
        const res = await fetch(`/api/attendance?schoolId=${schoolId}`);
        const json = await res.json();
        const records: { date: string; status: string }[] = Array.isArray(json) ? json : [];

        const today = new Date();
        const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
        const result: { day: string; rate: number }[] = [];

        for (let i = 6; i >= 0; i--) {
          const d = new Date(today);
          d.setDate(d.getDate() - i);
          const dateStr = d.toISOString().split('T')[0];
          const dayLabel = dayNames[d.getDay()];

          const dayRecords = records.filter((r) => r.date === dateStr);
          if (dayRecords.length > 0) {
            const present = dayRecords.filter((r) => r.status === 'present').length;
            result.push({ day: `${dayLabel} ${d.getDate()}`, rate: Math.round((present / dayRecords.length) * 100) });
          } else {
            result.push({ day: `${dayLabel} ${d.getDate()}`, rate: 0 });
          }
        }

        setData(result);
      } catch {
        const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
        const today = new Date();
        const fallback: { day: string; rate: number }[] = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date(today);
          d.setDate(d.getDate() - i);
          fallback.push({ day: `${dayNames[d.getDay()]} ${d.getDate()}`, rate: 0 });
        }
        setData(fallback);
      } finally {
        setLoading(false);
      }
    };

    fetchAttendance();
  }, [schoolId]);

  if (loading) {
    return (
      <Card className="transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Tendance de présence</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48 w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Tendance de présence (7 jours)</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={{ stroke: 'hsl(var(--border))' }}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={{ stroke: 'hsl(var(--border))' }}
              tickFormatter={(v: number) => `${v}%`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '13px',
              }}
              formatter={(value: number) => [`${value}%`, 'Taux de présence']}
            />
            <Line
              type="monotone"
              dataKey="rate"
              stroke="#10b981"
              strokeWidth={3}
              dot={{ fill: '#10b981', r: 5, strokeWidth: 2, stroke: 'hsl(var(--card))' }}
              activeDot={{ r: 7, stroke: '#10b981', strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
