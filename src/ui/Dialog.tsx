import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cx } from './cx';

/** Accessible modal: a bottom sheet on phones, a centred dialog on larger screens. */
export function Dialog({ open, onClose, title, description, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>('input, textarea, select, button[data-autofocus]')?.focus());
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx('animate-sheet relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl border border-line bg-surface shadow-pop sm:rounded-3xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-lg')}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-3">
          <div>
            <h2 id={titleId} className="font-display text-xl font-semibold text-ink">
              {title}
            </h2>
            {description && <p className="mt-1 text-sm text-ink-3">{description}</p>}
          </div>
          <button type="button" onClick={onClose} className="-mt-1 -mr-2 rounded-full p-2 text-ink-3 hover:bg-surface-2" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 pb-4">{children}</div>
        {footer && <div className="pb-safe flex flex-wrap justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
