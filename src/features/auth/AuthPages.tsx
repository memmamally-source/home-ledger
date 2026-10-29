import { ShieldCheck } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Brand } from '@/config/brand';
import { resetPassword, signInWithApple, signInWithEmail, signInWithGoogle, signUpWithEmail } from '@/data/auth';
import { appleSignInEnabled, usingEmulators } from '@/lib/firebase';
import { friendlyError } from '@/lib/live';
import { Logo } from '@/app/Logo';
import { Button } from '@/ui/Button';
import { ErrorNote, InfoNote } from '@/ui/EmptyState';
import { TextField } from '@/ui/Field';

function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-accent p-12 text-on-accent lg:flex lg:flex-col">
        <div className="absolute -right-24 -bottom-24 size-[420px] rounded-full bg-white/5" />
        <div className="absolute top-40 -right-10 size-56 rounded-full bg-white/5" />
        <div className="relative flex items-center gap-2.5 font-display text-xl font-semibold">{Brand.name}</div>
        <div className="relative mt-auto max-w-md">
          <p className="font-display text-4xl leading-tight font-semibold">{Brand.tagline}</p>
          <ul className="mt-8 space-y-3 text-[15px] opacity-90">
            <li>Room-by-room inspections with photo evidence and server timestamps</li>
            <li>Leases, rent schedules and escalations calculated for you</li>
            <li>Landlords and tenants can each keep their own records, or link up</li>
          </ul>
        </div>
      </div>
      <div className="flex flex-col justify-center px-5 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <div className="lg:hidden">
            <Logo />
          </div>
          <h1 className="mt-8 font-display text-3xl font-semibold text-ink lg:mt-0">{title}</h1>
          <p className="mt-2 text-ink-3">{subtitle}</p>
          <div className="mt-8">{children}</div>
          <div className="mt-8 text-center text-sm text-ink-3">{footer}</div>
          {usingEmulators && <p className="mt-6 text-center text-xs text-ink-3">Development mode: using the local Firebase emulators. No real accounts or data.</p>}
        </div>
      </div>
    </div>
  );
}

function SocialButtons({ onError, busy, setBusy }: { onError: (m: string) => void; busy: boolean; setBusy: (b: boolean) => void }) {
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      onError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2.5">
      <Button variant="secondary" className="w-full" disabled={busy} onClick={() => run(signInWithGoogle)} icon={<GoogleIcon />}>
        Continue with Google
      </Button>
      {appleSignInEnabled && (
        <Button variant="secondary" className="w-full" disabled={busy} onClick={() => run(signInWithApple)}>
          Continue with Apple
        </Button>
      )}
      <div className="flex items-center gap-3 py-2 text-xs text-ink-3">
        <div className="h-px flex-1 bg-line" /> or with email <div className="h-px flex-1 bg-line" />
      </div>
    </div>
  );
}

function useNext() {
  const [params] = useSearchParams();
  const next = params.get('next');
  return next && next.startsWith('/') ? next : '/';
}

export function SignInPage() {
  const nav = useNavigate();
  const next = useNext();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await signInWithEmail(email, password);
      nav(next, { replace: true });
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your property records." footer={<>New here? <Link className="font-semibold text-accent" to={`/signup${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`}>Create an account</Link></>}>
      <SocialButtons onError={setError} busy={busy} setBusy={setBusy} />
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <ErrorNote>{error}</ErrorNote>}
        <TextField label="Email" type="email" autoComplete="email" value={email} onChange={setEmail} required />
        <TextField label="Password" type="password" autoComplete="current-password" value={password} onChange={setPassword} required />
        <div className="flex justify-end">
          <Link to="/reset" className="text-sm font-semibold text-accent">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" className="w-full" size="lg" loading={busy}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}

export function SignUpPage() {
  const nav = useNavigate();
  const next = useNext();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const errors = {
    name: !name.trim() ? 'Enter your name.' : undefined,
    email: !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? 'Enter a valid email address.' : undefined,
    password: password.length < 8 ? 'Use at least 8 characters.' : undefined,
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (errors.name || errors.email || errors.password) return;
    setError('');
    setBusy(true);
    try {
      await signUpWithEmail(name, email, password);
      nav(next, { replace: true });
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthLayout title="Create your account" subtitle="Free while we test. Your records stay yours." footer={<>Already have an account? <Link className="font-semibold text-accent" to={`/signin${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`}>Sign in</Link></>}>
      <SocialButtons onError={setError} busy={busy} setBusy={setBusy} />
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <ErrorNote>{error}</ErrorNote>}
        <TextField label="Your name" autoComplete="name" value={name} onChange={setName} error={touched ? errors.name : undefined} />
        <TextField label="Email" type="email" autoComplete="email" value={email} onChange={setEmail} error={touched ? errors.email : undefined} />
        <TextField label="Password" type="password" autoComplete="new-password" value={password} onChange={setPassword} error={touched ? errors.password : undefined} hint="At least 8 characters." />
        <Button type="submit" className="w-full" size="lg" loading={busy}>
          Create account
        </Button>
        <p className="flex gap-2 text-xs leading-relaxed text-ink-3">
          <ShieldCheck className="size-4 shrink-0 text-accent" />
          Your records are private to you unless you choose to share them. We never share your previous tenancies with new landlords.
        </p>
      </form>
    </AuthLayout>
  );
}

export function ResetPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await resetPassword(email);
      setSent(true);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthLayout title="Reset your password" subtitle="We’ll ask Firebase to email you a reset link." footer={<Link className="font-semibold text-accent" to="/signin">Back to sign in</Link>}>
      {sent ? (
        <InfoNote tone="accent">If an account exists for {email}, a reset link has been requested. Check your inbox and spam folder. The link comes from Firebase Authentication.</InfoNote>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error && <ErrorNote>{error}</ErrorNote>}
          <TextField label="Email" type="email" autoComplete="email" value={email} onChange={setEmail} />
          <Button type="submit" className="w-full" size="lg" loading={busy}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2-1.9 3.2-4.7 3.2-8z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.8 14.2a6.6 6.6 0 0 1 0-4.3V7.1H2.1a11 11 0 0 0 0 9.9z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z" />
    </svg>
  );
}
