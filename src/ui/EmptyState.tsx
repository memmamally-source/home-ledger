import type { ReactNode } from 'react';

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink">{icon}</div>
      <h3 className="mt-4 font-display text-lg font-semibold text-ink">{title}</h3>
      {children && <div className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-3">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-xl bg-bad-soft px-4 py-3 text-sm text-bad-ink">
      {children}
    </div>
  );
}

export function InfoNote({ children, tone = 'info', icon }: { children: ReactNode; tone?: 'info' | 'warn' | 'accent'; icon?: ReactNode }) {
  const cls = tone === 'warn' ? 'bg-warn-soft text-warn-ink' : tone === 'accent' ? 'bg-accent-soft text-accent-ink' : 'bg-info-soft text-info-ink';
  return (
    <div className={`flex gap-2.5 rounded-xl px-4 py-3 text-sm leading-relaxed ${cls}`}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div>{children}</div>
    </div>
  );
}
