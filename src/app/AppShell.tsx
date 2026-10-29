import { Building2, ClipboardCheck, Home, Settings, WifiOff } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { NavLink, Outlet } from 'react-router';
import { cx } from '@/ui/cx';
import { getUploadsSnapshot, subscribeUploads } from '@/lib/uploads';
import { Logo } from './Logo';
import { useSession } from './session';

const NAV = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/properties', label: 'Properties', icon: Building2 },
  { to: '/inspections', label: 'Inspections', icon: ClipboardCheck },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function useOnline() {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('online', cb);
      window.addEventListener('offline', cb);
      return () => {
        window.removeEventListener('online', cb);
        window.removeEventListener('offline', cb);
      };
    },
    () => navigator.onLine,
  );
}

export function useUploads() {
  return useSyncExternalStore(subscribeUploads, getUploadsSnapshot);
}

export function AppShell() {
  const { profile } = useSession();
  const online = useOnline();
  const uploads = useUploads();
  const pending = uploads.length;
  return (
    <div className="min-h-dvh lg:flex">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-surface/60 px-4 py-6 lg:flex">
        <div className="px-2">
          <Logo />
        </div>
        <nav className="mt-8 flex flex-col gap-1" aria-label="Main">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cx('flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-semibold transition-colors', isActive ? 'bg-accent-soft text-accent-ink' : 'text-ink-2 hover:bg-surface-2')}>
              <n.icon className="size-5" />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-3 px-2 text-xs text-ink-3">
          {pending > 0 && <div className="rounded-xl bg-warn-soft px-3 py-2 font-semibold text-warn-ink">{pending} photo{pending === 1 ? '' : 's'} waiting to upload</div>}
          <div className="truncate">{profile?.email}</div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {!online && (
          <div className="no-print flex items-center justify-center gap-2 bg-warn-soft px-4 py-2 text-sm font-semibold text-warn-ink">
            <WifiOff className="size-4" /> Offline. Your inspection changes and photos are saved on this device and will sync when you reconnect.
          </div>
        )}
        <main className="mx-auto w-full max-w-5xl px-4 pt-6 pb-28 sm:px-6 lg:px-10 lg:pt-10 lg:pb-16">
          <Outlet />
        </main>
      </div>

      <nav className="no-print pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur lg:hidden" aria-label="Main">
        <div className="mx-auto grid max-w-md grid-cols-4">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cx('relative flex flex-col items-center gap-1 pt-2.5 pb-2 text-[11px] font-semibold', isActive ? 'text-accent' : 'text-ink-3')}>
              <n.icon className="size-6" />
              {n.label}
              {n.to === '/inspections' && pending > 0 && <span className="absolute top-1.5 right-[calc(50%-18px)] size-2 rounded-full bg-warn" aria-label={`${pending} uploads waiting`} />}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
