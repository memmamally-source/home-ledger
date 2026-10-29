import { Brand } from '@/config/brand';

/**
 * The mark: a roof over an open ledger. Green tile, ivory drawing. `detail` adds the ruled lines,
 * which are dropped below ~32 px where they would blur.
 */
export function LogoMark({ className = 'size-9', detail = true }: { className?: string; detail?: boolean }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <rect width="48" height="48" rx="13" fill="#1f4d3a" />
      <path d="M10 22.2 24 10.8l14 11.4" fill="none" stroke="#f8f3e7" strokeWidth="2.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M24 26.4c-3.6-2.3-8-2.9-11.6-2.5v13.6c3.6-.4 8 .2 11.6 2.5 3.6-2.3 8-2.9 11.6-2.5V23.9c-3.6-.4-8 .2-11.6 2.5z" fill="#f8f3e7" />
      <path d="M24 26.4v12.6" stroke="#1f4d3a" strokeWidth="1.7" />
      {detail && (
        <path
          d="M15.2 28.6c2.1-.1 4.3.4 6 1.2M15.2 32.4c2.1-.1 4.3.4 6 1.2M26.8 29.8c1.7-.8 3.9-1.3 6-1.2M26.8 33.6c1.7-.8 3.9-1.3 6-1.2"
          stroke="#1f4d3a"
          strokeWidth="1.35"
          strokeLinecap="round"
          fill="none"
          opacity=".7"
        />
      )}
    </svg>
  );
}

/** Wordmark: the first half of the name in ink, the second in green. */
export function Wordmark({ className = 'text-xl', onDark = false }: { className?: string; onDark?: boolean }) {
  const split = Brand.name.search(/[A-Z](?=[a-z]*$)/);
  const [a, b] = split > 0 ? [Brand.name.slice(0, split), Brand.name.slice(split)] : [Brand.name, ''];
  return (
    <span className={`font-display font-semibold tracking-tight ${className}`}>
      <span className={onDark ? 'text-[#fbf8f1]' : 'text-ink'}>{a}</span>
      <span className={onDark ? 'text-[#b9d9c6]' : 'text-accent'}>{b}</span>
    </span>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <Wordmark />
    </span>
  );
}
