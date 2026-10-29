import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

export function PageHeader({ title, subtitle, back, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; back?: { to: string; label: string }; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className="mb-6">
      {back && (
        <Link to={back.to} className="-ml-1 mb-3 inline-flex items-center gap-1 rounded-lg py-1 pr-2 text-sm font-semibold text-ink-3 hover:text-ink">
          <ChevronLeft className="size-4" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <div className="mb-1 text-xs font-bold tracking-wider text-accent uppercase">{eyebrow}</div>}
          <h1 className="font-display text-[28px] leading-tight font-semibold text-ink sm:text-[32px]">{title}</h1>
          {subtitle && <div className="mt-1.5 text-[15px] text-ink-3">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function Section({ title, action, children, className }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold tracking-wide text-ink-3 uppercase">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
