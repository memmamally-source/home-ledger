import { cx } from './cx';

export function Tabs<T extends string>({ value, onChange, tabs, label }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: string; count?: number }[]; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          type="button"
          aria-selected={t.value === value}
          onClick={() => onChange(t.value)}
          className={cx(
            'flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold whitespace-nowrap transition-colors',
            t.value === value ? 'bg-ink text-bg' : 'text-ink-2 hover:bg-surface-2',
          )}
        >
          {t.label}
          {t.count != null && t.count > 0 && <span className={cx('rounded-full px-1.5 text-xs', t.value === value ? 'bg-bg/20' : 'bg-surface-3')}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label, size = 'md' }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string; size?: 'sm' | 'md' }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx('rounded-lg font-semibold transition-colors', size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm', o.value === value ? 'bg-surface text-ink shadow-sm' : 'text-ink-3 hover:text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
