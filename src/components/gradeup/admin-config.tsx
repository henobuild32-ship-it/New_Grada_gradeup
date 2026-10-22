'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import PWAInstallDialog from './pwa-install-dialog';
import {
  Settings,
  School,
  Mail,
  Globe,
  Save,
  Info,
  Loader2,
  Upload,
  Trash2,
  CheckCircle2,
  Smartphone,
  RefreshCw,
  Copy,
  MapPin,
  Navigation,
  Phone,
  Building2,
  Bell,
  Shield,
  Key,
  Link2,
} from 'lucide-react';

interface ConfigData {
  id: string;
  name: string;
  email: string;
  currency: string;
  inviteCode?: string;
  logoUrl?: string;
  createdAt: string;
  heureArriveeScolaire?: string;
  province?: string;
  city?: string;
  commune?: string;
  academicYear?: string;
  latitude?: number | null;
  longitude?: number | null;
}

interface NotifPrefs {
  inApp: boolean;
  push: boolean;
  email: boolean;
  sms: boolean;
}

const PROVINCES_RDC = [
  'Kinshasa', 'Kongo-Central', 'Kwango', 'Kwilu', 'Mai-Ndombe',
  'Kasaï', 'Kasaï-Central', 'Kasaï-Oriental', 'Lomami', 'Sankuru',
  'Maniema', 'Sud-Kivu', 'Nord-Kivu', 'Tanganyika', 'Haut-Lomami',
  'Lualaba', 'Haut-Katanga', 'Haut-Uele', 'Ituri', 'Bas-Uele',
  'Nord-Ubangi', 'Mongala', 'Sud-Ubangi', 'Équateur', 'Tshuapa',
  'Tshopo',
];

const currencies = [
  { value: 'USD', label: 'USD — Dollar américain', symbol: '$' },
  { value: 'CDF', label: 'CDF — Franc congolais', symbol: 'FC' },
  { value: 'EUR', label: 'EUR — Euro', symbol: '€' },
];

export default function AdminConfig() {
  const { user } = useAppStore();
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('info');

  // Institution info
  const [schoolName, setSchoolName] = useState('');
  const [schoolEmail, setSchoolEmail] = useState('');
  const [province, setProvince] = useState('');
  const [city, setCity] = useState('');
  const [commune, setCommune] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [savingInfo, setSavingInfo] = useState(false);

  // Currency + Arrival time
  const [selectedCurrency, setSelectedCurrency] = useState('USD');
  const [arrivalTime, setArrivalTime] = useState('08:00');
  const [savingCurrency, setSavingCurrency] = useState(false);

  // Logo
  const [logoUrl, setLogoUrl] = useState('');
  const [uploading, setUploading] = useState(false);

  // Invite code
  const [inviteCode, setInviteCode] = useState('');
  const [regenerating, setRegenerating] = useState(false);

  // GPS
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [gpsLoading, setGpsLoading] = useState(false);
  const [savingGps, setSavingGps] = useState(false);

  // Notification preferences
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs>({ inApp: true, push: true, email: false, sms: false });
  const [loadingPrefs, setLoadingPrefs] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const fetchConfig = useCallback(async () => {
    if (!user?.schoolId) return;
    try {
      const res = await fetch(`/api/config?schoolId=${user.schoolId}`);
      const data = await res.json();
      if (data.config) {
        const c = data.config;
        setConfig(c);
        setSchoolName(c.name || '');
        setSchoolEmail(c.email || '');
        setSelectedCurrency(c.currency || 'USD');
        setLogoUrl(c.logoUrl || '');
        setArrivalTime(c.heureArriveeScolaire || '08:00');
        setInviteCode(c.inviteCode || user?.school?.inviteCode || '');
        setProvince(c.province || '');
        setCity(c.city || '');
        setCommune(c.commune || '');
        setAcademicYear(c.academicYear || '');
        setLatitude(c.latitude != null ? String(c.latitude) : '');
        setLongitude(c.longitude != null ? String(c.longitude) : '');
      }
    } catch {
      toast.error('Erreur lors du chargement de la configuration');
    } finally {
      setLoading(false);
    }
  }, [user?.schoolId, user?.school?.inviteCode]);

  const fetchNotifPrefs = useCallback(async () => {
    setLoadingPrefs(true);
    try {
      const res = await fetch('/api/notification-preferences');
      const data = await res.json();
      if (data.preference) {
        setNotifPrefs({
          inApp: data.preference.inApp ?? true,
          push: data.preference.push ?? true,
          email: data.preference.email ?? false,
          sms: data.preference.sms ?? false,
        });
      }
    } catch {
      // ignore
    } finally {
      setLoadingPrefs(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
    fetchNotifPrefs();
  }, [fetchConfig, fetchNotifPrefs]);

  // Save institution info
  const handleSaveInfo = async () => {
    if (!schoolName.trim()) {
      toast.error("Le nom de l'école est requis");
      return;
    }
    setSavingInfo(true);
    try {
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId: user?.schoolId,
          name: schoolName.trim(),
          email: schoolEmail.trim(),
          province: province.trim(),
          city: city.trim(),
          commune: commune.trim(),
          academicYear: academicYear.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setConfig((prev) => prev ? { ...prev, ...data.config } : data.config);
      toast.success("Informations de l'école mises à jour");
    } catch (e: any) {
      toast.error(e.message || 'Erreur de mise à jour');
    } finally {
      setSavingInfo(false);
    }
  };

  // Save currency + arrival time
  const handleSaveCurrency = async () => {
    setSavingCurrency(true);
    try {
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId: user?.schoolId,
          currency: selectedCurrency,
          heureArriveeScolaire: arrivalTime,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setConfig((prev) => prev ? { ...prev, ...data.config } : data.config);
      toast.success("Devise et heure d'arrivée enregistrées");
    } catch (e: any) {
      toast.error(e.message || 'Erreur lors de la mise à jour');
    } finally {
      setSavingCurrency(false);
    }
  };

  // Save GPS
  const handleSaveGps = async () => {
    setSavingGps(true);
    try {
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId: user?.schoolId,
          latitude: latitude.trim() === '' ? null : parseFloat(latitude),
          longitude: longitude.trim() === '' ? null : parseFloat(longitude),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setConfig((prev) => prev ? { ...prev, ...data.config } : data.config);
      toast.success('Coordonnées GPS enregistrées');
    } catch (e: any) {
      toast.error(e.message || 'Erreur GPS');
    } finally {
      setSavingGps(false);
    }
  };

  // Get current GPS position
  const handleGetGpsPosition = () => {
    if (!navigator.geolocation) {
      toast.error("La géolocalisation n'est pas disponible sur cet appareil");
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude.toFixed(6);
        const lng = position.coords.longitude.toFixed(6);
        setLatitude(lat);
        setLongitude(lng);
        setGpsLoading(false);
        toast.success(`Position détectée : ${lat}, ${lng}`);
      },
      (err) => {
        setGpsLoading(false);
        const msgs: Record<number, string> = {
          1: 'Accès à la localisation refusé. Autorisez la géolocalisation dans les paramètres.',
          2: "Position indisponible. Essayez à l'extérieur ou vérifiez le GPS.",
          3: 'Délai dépassé. Réessayez.',
        };
        toast.error(msgs[err.code] || 'Erreur de géolocalisation');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Regenerate invite code
  const handleRegenerateCode = async () => {
    if (!confirm("Régénérer le code d'invitation ? L'ancien code ne fonctionnera plus pour les nouvelles inscriptions.")) return;
    setRegenerating(true);
    try {
      const res = await fetch('/api/invite-code', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setInviteCode(data.inviteCode);
      toast.success(`Nouveau code : ${data.inviteCode}`);
    } catch (e: any) {
      toast.error(e.message || 'Erreur lors de la régénération');
    } finally {
      setRegenerating(false);
    }
  };

  const handleCopyInviteCode = () => {
    if (!inviteCode) return;
    navigator.clipboard.writeText(inviteCode).then(() => {
      toast.success("Code d'invitation copié !");
    }).catch(() => {
      toast.error('Impossible de copier');
    });
  };

  // Logo upload
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.schoolId) return;
    if (file.size > 48 * 1024 * 1024) { toast.error('Logo trop grand (max 48 MB).'); return; }
    const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
    if (!ALLOWED.includes(file.type)) { toast.error('Format invalide. Acceptés : JPG, PNG, WEBP, GIF, SVG.'); return; }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('schoolId', user.schoolId);
      const res = await fetch('/api/ecole/logo', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur upload');
      setLogoUrl(data.logoUrl);
      setConfig((prev) => prev ? { ...prev, logoUrl: data.logoUrl } : prev);
      toast.success('Logo mis à jour !');
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de l'upload du logo.");
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleRemoveLogo = async () => {
    if (!user?.schoolId) return;
    try {
      const res = await fetch('/api/ecole/logo', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schoolId: user.schoolId }),
      });
      if (!res.ok) throw new Error('Erreur suppression logo');
      setLogoUrl('');
      setConfig((prev) => prev ? { ...prev, logoUrl: '' } : prev);
      toast.success('Logo supprimé.');
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de la suppression.');
    }
  };

  // Save notification prefs
  const handleSaveNotifPrefs = async () => {
    setSavingPrefs(true);
    try {
      const res = await fetch('/api/notification-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notifPrefs),
      });
      if (!res.ok) throw new Error('Erreur');
      toast.success('Préférences de notification enregistrées');
    } catch {
      toast.error('Erreur lors de la sauvegarde des préférences');
    } finally {
      setSavingPrefs(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-16">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-blue-500 to-indigo-600 p-6 lg:p-8 text-white shadow-xl shadow-blue-500/20">
        <div className="relative z-10 flex items-center gap-3">
          <div className="p-3 rounded-xl bg-white/15 backdrop-blur-sm shrink-0">
            <Settings className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Configuration de l'École</h1>
            <p className="text-blue-100 text-sm">
              Paramètres globaux · Code d'invitation · Localisation GPS
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid grid-cols-2 sm:grid-cols-4 min-h-[48px] p-1 bg-muted/60 rounded-xl gap-1">
            <TabsTrigger value="info" className="min-h-[40px] text-xs sm:text-sm font-semibold gap-1.5">
              <School className="h-4 w-4" /> Informations
            </TabsTrigger>
            <TabsTrigger value="access" className="min-h-[40px] text-xs sm:text-sm font-semibold gap-1.5">
              <Key className="h-4 w-4" /> Accès & Code
            </TabsTrigger>
            <TabsTrigger value="location" className="min-h-[40px] text-xs sm:text-sm font-semibold gap-1.5">
              <MapPin className="h-4 w-4" /> Localisation
            </TabsTrigger>
            <TabsTrigger value="notifs" className="min-h-[40px] text-xs sm:text-sm font-semibold gap-1.5">
              <Bell className="h-4 w-4" /> Notifications
            </TabsTrigger>
          </TabsList>

          {/* ============================================================ */}
          {/* TAB 1: INSTITUTION INFO                                       */}
          {/* ============================================================ */}
          <TabsContent value="info" className="space-y-4">
            {/* Logo */}
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Upload className="h-5 w-5 text-blue-600" />
                  Logo de l'école
                </CardTitle>
                <CardDescription>Affiché sur les bulletins, cartes et l'interface</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row items-center gap-5">
                  {logoUrl ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-24 h-24 rounded-xl border bg-white flex items-center justify-center p-2 shadow-sm overflow-hidden">
                        <img src={logoUrl} alt="Logo école" className="max-w-full max-h-full object-contain" />
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleRemoveLogo}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 min-h-[44px] text-xs"
                      >
                        <Trash2 className="w-4 h-4 mr-1" /> Retirer
                      </Button>
                    </div>
                  ) : (
                    <div className="w-24 h-24 rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/20 flex items-center justify-center">
                      <School className="w-10 h-10 text-muted-foreground/40" />
                    </div>
                  )}
                  <div className="flex-1 w-full">
                    <Label htmlFor="school-logo-upload" className={uploading ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}>
                      <div className="flex items-center justify-center gap-2 border-2 border-dashed rounded-xl p-4 hover:bg-muted/50 transition-colors min-h-[60px]">
                        {uploading ? (
                          <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                        ) : (
                          <Upload className="w-4 h-4 text-muted-foreground" />
                        )}
                        <span className="text-sm text-muted-foreground">
                          {uploading ? 'Envoi en cours...' : 'Cliquez pour choisir un logo (JPG, PNG, WEBP, SVG — max 48 MB)'}
                        </span>
                      </div>
                    </Label>
                    <input
                      id="school-logo-upload"
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
                      className="hidden"
                      onChange={handleLogoUpload}
                      disabled={uploading}
                    />
                    {logoUrl && (
                      <p className="text-[11px] text-emerald-600 mt-1.5 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Logo enregistré — utilisé sur les bulletins et cartes d'identité
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* School Info Form */}
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-blue-600" />
                  Informations de l'établissement
                </CardTitle>
                <CardDescription>Ces informations apparaissent sur les bulletins et documents officiels</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="school-name">Nom de l'école *</Label>
                    <Input
                      id="school-name"
                      value={schoolName}
                      onChange={(e) => setSchoolName(e.target.value)}
                      placeholder="Ex: Lycée Roi Baudouin"
                      className="min-h-[44px]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="school-email">Email de l'établissement</Label>
                    <Input
                      id="school-email"
                      type="email"
                      value={schoolEmail}
                      onChange={(e) => setSchoolEmail(e.target.value)}
                      placeholder="contact@ecole.cd"
                      className="min-h-[44px]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="academic-year">Année scolaire active</Label>
                    <Input
                      id="academic-year"
                      value={academicYear}
                      onChange={(e) => setAcademicYear(e.target.value)}
                      placeholder="Ex: 2026-2027"
                      className="min-h-[44px]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="province">Province</Label>
                    <Input
                      id="province"
                      value={province}
                      onChange={(e) => setProvince(e.target.value)}
                      placeholder="Ex: Kinshasa"
                      list="provinces-list"
                      className="min-h-[44px]"
                    />
                    <datalist id="provinces-list">
                      {PROVINCES_RDC.map((p) => (
                        <option key={p} value={p} />
                      ))}
                    </datalist>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="city">Ville / Territoire</Label>
                    <Input
                      id="city"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Ex: Kinshasa"
                      className="min-h-[44px]"
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="commune">Commune / Quartier</Label>
                    <Input
                      id="commune"
                      value={commune}
                      onChange={(e) => setCommune(e.target.value)}
                      placeholder="Ex: Gombe, Kalamu..."
                      className="min-h-[44px]"
                    />
                  </div>
                </div>

                <Button
                  onClick={handleSaveInfo}
                  disabled={savingInfo || !schoolName.trim()}
                  className="min-h-[44px] w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                >
                  {savingInfo ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enregistrement...</>
                  ) : (
                    <><Save className="h-4 w-4 mr-2" />Enregistrer les informations</>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Currency + Arrival time */}
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Globe className="h-5 w-5 text-blue-600" />
                  Devise & Heure d'arrivée
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <RadioGroup value={selectedCurrency} onValueChange={setSelectedCurrency} className="space-y-2">
                  {currencies.map((c) => (
                    <Label
                      key={c.value}
                      htmlFor={`currency-${c.value}`}
                      className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all min-h-[56px] ${
                        selectedCurrency === c.value
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-muted hover:border-muted-foreground/30'
                      }`}
                    >
                      <RadioGroupItem value={c.value} id={`currency-${c.value}`} />
                      <div className="flex-1">
                        <p className="font-semibold">{c.label}</p>
                      </div>
                      <span className="text-2xl font-bold text-muted-foreground/50">{c.symbol}</span>
                    </Label>
                  ))}
                </RadioGroup>

                <Separator />

                <div className="space-y-1.5">
                  <Label htmlFor="arrival-time">Heure officielle d'arrivée</Label>
                  <Input
                    id="arrival-time"
                    type="time"
                    value={arrivalTime}
                    onChange={(e) => setArrivalTime(e.target.value)}
                    className="min-h-[44px] max-w-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    Toute présence enregistrée après cette heure sera signalée comme retard.
                  </p>
                </div>

                <Button
                  onClick={handleSaveCurrency}
                  disabled={savingCurrency}
                  className="min-h-[44px] w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                >
                  {savingCurrency ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enregistrement...</>
                  ) : (
                    <><Save className="h-4 w-4 mr-2" />Enregistrer la devise & l'heure</>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* PWA Install */}
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-blue-600" />
                  Application Mobile
                </CardTitle>
                <CardDescription>
                  Installez GradeUp sur votre appareil mobile pour un accès rapide hors-connexion
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PWAInstallDialog placement="settings" />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============================================================ */}
          {/* TAB 2: ACCESS & INVITE CODE                                  */}
          {/* ============================================================ */}
          <TabsContent value="access" className="space-y-4">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Link2 className="h-5 w-5 text-blue-600" />
                  Code d'invitation de l'école
                </CardTitle>
                <CardDescription>
                  Les enseignants, élèves et parents utilisent ce code pour rejoindre votre établissement sur GradeUp.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <div className="flex-1 p-4 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 flex items-center justify-center min-h-[60px]">
                    <span className="text-2xl font-bold font-mono tracking-widest text-blue-700 select-all">
                      {inviteCode || '——————'}
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      variant="outline"
                      onClick={handleCopyInviteCode}
                      disabled={!inviteCode}
                      className="min-h-[44px] flex-1 sm:flex-none gap-1.5 font-semibold"
                    >
                      <Copy className="h-4 w-4 text-blue-600" />
                      Copier
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleRegenerateCode}
                      disabled={regenerating}
                      className="min-h-[44px] flex-1 sm:flex-none gap-1.5 font-semibold text-amber-700 border-amber-300 hover:bg-amber-50"
                    >
                      {regenerating ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      Régénérer
                    </Button>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                  <Shield className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
                  <div>
                    <p className="font-bold mb-0.5">Important — Sécurité</p>
                    <p>Ne partagez ce code qu'avec des personnes autorisées. Si vous le régénérez, l'ancien code deviendra immédiatement invalide pour les nouvelles inscriptions.</p>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <p className="text-sm font-semibold text-foreground">Informations de l'établissement</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border">
                      <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                        <School className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground font-medium">École</p>
                        <p className="font-semibold text-sm">{config?.name || '—'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border">
                      <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                        <Mail className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground font-medium">Email</p>
                        <p className="font-semibold text-sm truncate">{config?.email || '—'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border">
                      <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                        <Globe className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground font-medium">Devise</p>
                        <p className="font-semibold text-sm">{config?.currency || 'USD'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border">
                      <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                        <Settings className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground font-medium">Membre depuis</p>
                        <p className="font-semibold text-sm">
                          {config?.createdAt
                            ? new Date(config.createdAt).toLocaleDateString('fr-FR', {
                                year: 'numeric',
                                month: 'long',
                              })
                            : '—'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============================================================ */}
          {/* TAB 3: GPS LOCATION                                          */}
          {/* ============================================================ */}
          <TabsContent value="location" className="space-y-4">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-blue-600" />
                  Coordonnées GPS de l'établissement
                </CardTitle>
                <CardDescription>
                  Utilisées pour la vérification automatique de présence par géolocalisation
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {config?.latitude && config?.longitude ? (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-xs text-emerald-800">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                    <span className="font-medium">
                      Position configurée : {config.latitude?.toFixed(5)}, {config.longitude?.toFixed(5)}
                    </span>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-center gap-2 text-xs text-amber-800">
                    <Info className="h-4 w-4 shrink-0 text-amber-600" />
                    <span>Aucune coordonnée GPS configurée. La vérification de présence par zone n'est pas active.</span>
                  </div>
                )}

                <Button
                  onClick={handleGetGpsPosition}
                  disabled={gpsLoading}
                  variant="outline"
                  className="min-h-[44px] w-full gap-2 font-semibold border-blue-300 text-blue-700 hover:bg-blue-50"
                >
                  {gpsLoading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />Détection en cours...</>
                  ) : (
                    <><Navigation className="h-4 w-4" />📍 Obtenir ma position GPS actuelle</>
                  )}
                </Button>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="gps-lat">Latitude</Label>
                    <Input
                      id="gps-lat"
                      type="number"
                      step="0.000001"
                      value={latitude}
                      onChange={(e) => setLatitude(e.target.value)}
                      placeholder="-4.322447"
                      className="min-h-[44px] font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="gps-lng">Longitude</Label>
                    <Input
                      id="gps-lng"
                      type="number"
                      step="0.000001"
                      value={longitude}
                      onChange={(e) => setLongitude(e.target.value)}
                      placeholder="15.322177"
                      className="min-h-[44px] font-mono"
                    />
                  </div>
                </div>

                <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  Lorsque les coordonnées sont définies, le système peut vérifier si les enseignants et élèves sont bien présents dans l'enceinte scolaire lors de la prise de présence.
                </p>

                <Button
                  onClick={handleSaveGps}
                  disabled={savingGps}
                  className="min-h-[44px] w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                >
                  {savingGps ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enregistrement...</>
                  ) : (
                    <><Save className="h-4 w-4 mr-2" />Enregistrer les coordonnées GPS</>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============================================================ */}
          {/* TAB 4: NOTIFICATION PREFERENCES                              */}
          {/* ============================================================ */}
          <TabsContent value="notifs" className="space-y-4">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Bell className="h-5 w-5 text-blue-600" />
                  Préférences de notification
                </CardTitle>
                <CardDescription>
                  Choisissez comment vous souhaitez être notifié des événements importants
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {loadingPrefs ? (
                  <div className="space-y-3">
                    <Skeleton className="h-16 rounded-xl" />
                    <Skeleton className="h-16 rounded-xl" />
                    <Skeleton className="h-16 rounded-xl" />
                  </div>
                ) : (
                  <div className="space-y-3">
                    {[
                      {
                        key: 'inApp' as keyof NotifPrefs,
                        label: "Notifications dans l'application",
                        desc: "Cloche et popups à l'intérieur de GradeUp",
                        icon: Bell,
                        recommended: true,
                      },
                      {
                        key: 'push' as keyof NotifPrefs,
                        label: 'Notifications push (mobile)',
                        desc: "Reçues sur votre écran même lorsque l'app est fermée",
                        icon: Smartphone,
                        recommended: true,
                      },
                      {
                        key: 'email' as keyof NotifPrefs,
                        label: 'Notifications par email',
                        desc: "Envoyées à l'adresse email de l'école",
                        icon: Mail,
                        recommended: false,
                      },
                      {
                        key: 'sms' as keyof NotifPrefs,
                        label: 'Notifications par SMS',
                        desc: 'Envoyées au numéro de téléphone enregistré',
                        icon: Phone,
                        recommended: false,
                      },
                    ].map(({ key, label, desc, icon: Icon, recommended }) => (
                      <div
                        key={key}
                        className={`flex items-center justify-between gap-4 p-4 rounded-xl border transition-all ${
                          notifPrefs[key] ? 'bg-blue-50/40 border-blue-200' : 'bg-muted/10'
                        }`}
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <div className={`p-2.5 rounded-xl ${notifPrefs[key] ? 'bg-blue-100 text-blue-700' : 'bg-muted text-muted-foreground'}`}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-sm">{label}</p>
                              {recommended && (
                                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px] font-bold">Recommandé</Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">{desc}</p>
                          </div>
                        </div>
                        <Switch
                          checked={notifPrefs[key]}
                          onCheckedChange={(v) => setNotifPrefs((prev) => ({ ...prev, [key]: v }))}
                          className="shrink-0"
                        />
                      </div>
                    ))}
                  </div>
                )}

                <Button
                  onClick={handleSaveNotifPrefs}
                  disabled={savingPrefs || loadingPrefs}
                  className="min-h-[44px] w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                >
                  {savingPrefs ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enregistrement...</>
                  ) : (
                    <><Save className="h-4 w-4 mr-2" />Enregistrer les préférences</>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
