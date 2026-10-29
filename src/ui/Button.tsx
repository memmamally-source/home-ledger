import { Link } from 'react-router';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { cx } from './cx';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'soft' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover shadow-sm',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-surface-2',
  ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
  soft: 'bg-accent-soft text-accent-ink hover:brightness-95',
  danger: 'bg-bad-soft text-bad-ink hover:brightness-95',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5 rounded-lg',
  md: 'h-11 px-4 text-[15px] gap-2 rounded-xl',
  lg: 'h-13 px-6 text-base gap-2 rounded-xl',
};

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', extra?: string) {
  return cx(
    'inline-flex items-center justify-center font-semibold transition-colors duration-150 select-none disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap',
    VARIANTS[variant],
    SIZES[size],
    extra,
  );
}

interface Props extends ComponentPropsWithoutRef<'button'> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({ variant = 'primary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest }: Props) {
  return (
    <button type={type} className={buttonClass(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Spinner className="size-4" /> : icon}
      {children}
    </button>
  );
}

export function ButtonLink({ to, variant = 'primary', size = 'md', icon, className, children }: { to: string; variant?: Variant; size?: Size; icon?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <Link to={to} className={buttonClass(variant, size, className)}>
      {icon}
      {children}
    </Link>
  );
}
