import type { ReactNode } from 'react';
import { cx } from './cx';

export function Card({ children, className, as: As = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'section' | 'article' }) {
  return <As className={cx('rounded-2xl border border-line bg-surface shadow-card', className)}>{children}</As>;
}

export function CardHeader({ title, subtitle, action, icon }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-5">
      <div className="flex min-w-0 items-start gap-3">
        {icon && <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">{icon}</div>}
        <div className="min-w-0">
          <h2 className="font-semibold text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-ink-3">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'good' | 'bad' | 'warn' }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="text-xs font-semibold tracking-wide text-ink-3 uppercase">{label}</div>
      <div className={cx('mt-1.5 font-display text-2xl font-semibold tabular-nums', tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : tone === 'good' ? 'text-good' : 'text-ink')}>{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-3">{hint}</div>}
    </div>
  );
}
