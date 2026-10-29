import { Brand } from '@/config/brand';
import { Logo } from './Logo';

/** Shown when the build has no Firebase configuration, instead of a broken app. */
export function SetupNeeded() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6">
      <Logo />
      <h1 className="mt-8 font-display text-2xl font-semibold text-ink">{Brand.name} isn’t connected to a backend yet</h1>
      <p className="mt-3 leading-relaxed text-ink-2">
        This build has no Firebase configuration, so it can’t sign you in or store records. Add the Firebase web app settings as described in <code className="rounded bg-surface-2 px-1">docs/FIREBASE_SETUP.md</code>, or run it locally against the emulators with <code className="rounded bg-surface-2 px-1">VITE_USE_EMULATORS=true</code>.
      </p>
    </div>
  );
}
