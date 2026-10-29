import { cx } from './cx';

export function ProgressBar({ value, className, tone = 'accent', label }: { value: number; className?: string; tone?: 'accent' | 'good'; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cx('h-2 overflow-hidden rounded-full bg-surface-3', className)} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)} aria-label={label}>
      <div className={cx('h-full rounded-full transition-[width] duration-300', tone === 'good' ? 'bg-good' : 'bg-accent')} style={{ width: `${v}%` }} />
    </div>
  );
}

export function ProgressRing({ value, size = 44, label }: { value: number; size?: number; label?: string }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label ?? `${Math.round(v)}% done`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth="4" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={v === 100 ? 'var(--good)' : 'var(--accent)'} strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (c * v) / 100} className="transition-[stroke-dashoffset] duration-300" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-ink-2 tabular-nums">{Math.round(v)}%</span>
    </div>
  );
}
