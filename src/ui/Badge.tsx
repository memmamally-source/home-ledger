import type { ReactNode } from 'react';
import { cx } from './cx';

export type Tone = 'neutral' | 'accent' | 'good' | 'bad' | 'warn' | 'info';

const TONES: Record<Tone, string> = {
  neutral: 'bg-muted-soft text-muted-ink',
  accent: 'bg-accent-soft text-accent-ink',
  good: 'bg-good-soft text-good-ink',
  bad: 'bg-bad-soft text-bad-ink',
  warn: 'bg-warn-soft text-warn-ink',
  info: 'bg-info-soft text-info-ink',
};

export function Badge({ tone = 'neutral', children, icon, className }: { tone?: Tone; children: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', TONES[tone], className)}>
      {icon}
      {children}
    </span>
  );
}
