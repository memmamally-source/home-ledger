import { Building2, KeyRound, Layers } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Brand } from '@/config/brand';
import { MARKETS } from '@/config/markets';
import { updateProfile, type Intent } from '@/data/users';
import { friendlyError } from '@/lib/live';
import { useAuthed } from '@/app/session';
import { Logo } from '@/app/Logo';
import { Button } from '@/ui/Button';
import { ErrorNote } from '@/ui/EmptyState';
import { SelectField, TextField } from '@/ui/Field';
import { cx } from '@/ui/cx';

const OPTIONS: { value: Intent[]; key: string; title: string; text: string; icon: typeof Building2 }[] = [
  { key: 'landlord', value: ['landlord'], title: 'I am a landlord', text: 'Manage properties, tenancies, inspections and records.', icon: Building2 },
  { key: 'tenant', value: ['tenant'], title: 'I am a tenant', text: 'Document your home, report problems and keep your tenancy records.', icon: KeyRound },
  { key: 'both', value: ['landlord', 'tenant'], title: 'I am both', text: 'Rent out property and rent a home yourself.', icon: Layers },
];

export function OnboardingPage() {
  const { user, profile } = useAuthed();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [choice, setChoice] = useState<string>(profile.intents.length === 2 ? 'both' : (profile.intents[0] ?? ''));
  const [name, setName] = useState(profile.displayName);
  const [marketId, setMarketId] = useState(profile.marketId || 'ZA');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    const opt = OPTIONS.find((o) => o.key === choice);
    if (!opt) return setError('Choose how you will use the app. You can change this later.');
    if (!name.trim()) return setError('Enter your name.');
    setBusy(true);
    try {
      await updateProfile(user.uid, { intents: opt.value, displayName: name.trim(), marketId, onboarded: true });
      const next = params.get('next');
      nav(next && next.startsWith('/') ? next : '/', { replace: true });
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col px-5 py-10">
      <Logo />
      <h1 className="mt-10 font-display text-3xl font-semibold text-ink">How will you use {Brand.name}?</h1>
      <p className="mt-2 text-ink-3">This sets up your home screen. Roles are per property, so you can add the other role at any time.</p>
      <div className="mt-8 grid gap-3" role="radiogroup" aria-label="How will you use the app">
        {OPTIONS.map((o) => (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={choice === o.key}
            onClick={() => setChoice(o.key)}
            className={cx('flex items-start gap-4 rounded-2xl border bg-surface p-5 text-left transition-all', choice === o.key ? 'border-accent ring-2 ring-accent/25' : 'border-line hover:border-line-strong')}
          >
            <div className={cx('flex size-11 shrink-0 items-center justify-center rounded-xl', choice === o.key ? 'bg-accent text-on-accent' : 'bg-accent-soft text-accent-ink')}>
              <o.icon className="size-5" />
            </div>
            <div>
              <div className="font-semibold text-ink">{o.title}</div>
              <div className="mt-0.5 text-sm text-ink-3">{o.text}</div>
            </div>
          </button>
        ))}
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <TextField label="Your name" value={name} onChange={setName} autoComplete="name" hint="Shown to people you invite and on reports you sign." />
        <SelectField label="Country" value={marketId} onChange={setMarketId} options={Object.values(MARKETS).map((m) => ({ value: m.id, label: m.name }))} hint="Sets currency, dates and terminology." />
      </div>
      {error && <div className="mt-6"><ErrorNote>{error}</ErrorNote></div>}
      <Button size="lg" className="mt-8 w-full" loading={busy} onClick={save}>
        Continue
      </Button>
    </div>
  );
}
