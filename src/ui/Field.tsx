import { useId, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { formatMoney, minorUnitDigits, parseMoneyInput } from '@/domain/money';
import { cx } from './cx';

export const inputClass =
  'w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-ink placeholder:text-ink-3/70 transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-60 aria-[invalid=true]:border-bad';

interface FieldShellProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  children: (id: string, describedBy: string | undefined) => ReactNode;
  className?: string;
}

export function FieldShell({ label, hint, error, optional, children, className }: FieldShellProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 flex items-baseline justify-between text-sm font-semibold text-ink-2">
        <span>{label}</span>
        {optional && <span className="text-xs font-normal text-ink-3">Optional</span>}
      </label>
      {children(id, describedBy)}
      {hint && !error && (
        <p id={hintId} className="mt-1.5 text-xs leading-relaxed text-ink-3">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} className="mt-1.5 text-xs font-medium text-bad">
          {error}
        </p>
      )}
    </div>
  );
}

type InputProps = Omit<ComponentPropsWithoutRef<'input'>, 'onChange'> & { label: ReactNode; hint?: ReactNode; error?: string; optional?: boolean; onChange: (v: string) => void };

export function TextField({ label, hint, error, optional, className, onChange, ...rest }: InputProps) {
  return (
    <FieldShell label={label} hint={hint} error={error} optional={optional} className={className}>
      {(id, describedBy) => <input id={id} aria-describedby={describedBy} aria-invalid={error ? true : undefined} className={inputClass} onChange={(e) => onChange(e.target.value)} {...rest} />}
    </FieldShell>
  );
}

type AreaProps = Omit<ComponentPropsWithoutRef<'textarea'>, 'onChange'> & { label: ReactNode; hint?: ReactNode; error?: string; optional?: boolean; onChange: (v: string) => void };

export function TextArea({ label, hint, error, optional, className, onChange, rows = 3, ...rest }: AreaProps) {
  return (
    <FieldShell label={label} hint={hint} error={error} optional={optional} className={className}>
      {(id, describedBy) => <textarea id={id} rows={rows} aria-describedby={describedBy} aria-invalid={error ? true : undefined} className={cx(inputClass, 'resize-y')} onChange={(e) => onChange(e.target.value)} {...rest} />}
    </FieldShell>
  );
}

type SelectProps<T extends string> = { label: ReactNode; hint?: ReactNode; error?: string; optional?: boolean; value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; className?: string; disabled?: boolean };

export function SelectField<T extends string>({ label, hint, error, optional, value, onChange, options, className, disabled }: SelectProps<T>) {
  return (
    <FieldShell label={label} hint={hint} error={error} optional={optional} className={className}>
      {(id, describedBy) => (
        <select id={id} aria-describedby={describedBy} className={cx(inputClass, 'appearance-none bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-10')} style={{ backgroundImage: CHEVRON }} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as T)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </FieldShell>
  );
}

const CHEVRON = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236d7787' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`;

/** Money input that keeps a whole number of cents. `value` is minor units or undefined when empty. */
export function MoneyField({ label, hint, error, optional, value, onChange, currency, locale, className }: { label: ReactNode; hint?: ReactNode; error?: string; optional?: boolean; value: number | undefined; onChange: (v: number | undefined) => void; currency: string; locale: string; className?: string }) {
  const toText = (v: number | undefined) => (v == null ? '' : (v / 10 ** minorUnitDigits(currency)).toFixed(minorUnitDigits(currency)));
  const [text, setText] = useState(() => toText(value));
  const [focused, setFocused] = useState(false);
  const parsed = text.trim() ? parseMoneyInput(text, currency) : undefined;
  const invalid = text.trim() !== '' && parsed === null;
  const shown = focused ? text : value == null ? '' : formatMoney(value, currency, locale);
  return (
    <FieldShell label={label} hint={hint} error={error ?? (invalid ? 'Enter an amount like 12500 or 12 500,00.' : undefined)} optional={optional} className={className}>
      {(id, describedBy) => (
        <input
          id={id}
          inputMode="decimal"
          aria-describedby={describedBy}
          aria-invalid={error || invalid ? true : undefined}
          className={cx(inputClass, 'tabular-nums')}
          value={shown}
          onFocus={() => {
            setText(toText(value));
            setFocused(true);
          }}
          onBlur={() => setFocused(false)}
          onChange={(e) => {
            setText(e.target.value);
            const p = e.target.value.trim() ? parseMoneyInput(e.target.value, currency) : undefined;
            if (p !== null) onChange(p);
          }}
        />
      )}
    </FieldShell>
  );
}

export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <div className="text-sm font-semibold text-ink">{label}</div>
        {description && <div className="mt-0.5 text-xs leading-relaxed text-ink-3">{description}</div>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx('relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50', checked ? 'bg-accent' : 'bg-surface-3')}
      >
        <span className={cx('absolute top-1 left-1 size-5 rounded-full bg-white shadow transition-transform', checked && 'translate-x-5')} />
      </button>
    </div>
  );
}
