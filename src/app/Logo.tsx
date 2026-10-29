import { Brand } from '@/config/brand';

export function LogoMark({ className = 'size-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <rect width="40" height="40" rx="11" fill="var(--accent)" />
      <path d="M11 19.5 20 12l9 7.5V29a1 1 0 0 1-1 1h-5v-6h-6v6h-5a1 1 0 0 1-1-1z" fill="none" stroke="var(--on-accent)" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M15 34h10" stroke="var(--on-accent)" strokeOpacity="0.55" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="font-display text-xl font-semibold tracking-tight text-ink">{Brand.name}</span>
    </span>
  );
}
