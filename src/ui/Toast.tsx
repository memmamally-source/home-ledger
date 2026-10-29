import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { cx } from './cx';

interface ToastItem {
  id: number;
  message: string;
  tone: 'good' | 'bad';
}

const Ctx = createContext<(message: string, tone?: 'good' | 'bad') => void>(() => {});

export function useToast() {
  return useContext(Ctx);
}

let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((message: string, tone: 'good' | 'bad' = 'good') => {
    const id = ++seq;
    setItems((xs) => [...xs, { id, message, tone }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 4500);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={cx('animate-rise pointer-events-auto flex max-w-md items-center gap-2.5 rounded-2xl px-4 py-3 text-sm font-medium shadow-pop', t.tone === 'bad' ? 'bg-bad-soft text-bad-ink' : 'bg-ink text-bg')}>
            {t.tone === 'bad' ? <AlertTriangle className="size-4 shrink-0" /> : <CheckCircle2 className="size-4 shrink-0" />}
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
