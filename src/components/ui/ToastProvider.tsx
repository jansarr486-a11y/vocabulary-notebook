import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

interface ToastItem {
  id: number;
  message: string;
  actionLabel?: string;
  action?: () => void;
  duration: number;
}

const ToastContext = createContext<{
  toast: (message: string, opts?: { actionLabel?: string; action?: () => void; duration?: number }) => void;
}>({ toast: () => undefined });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const toast = useCallback(
    (message: string, opts?: { actionLabel?: string; action?: () => void; duration?: number }) => {
      const id = nextId.current++;
      const item: ToastItem = {
        id,
        message,
        actionLabel: opts?.actionLabel,
        action: opts?.action,
        duration: opts?.duration ?? 5000,
      };
      setItems((prev) => [...prev, item]);
      window.setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== id));
      }, item.duration);
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="toast">
            <span>{t.message}</span>
            {t.actionLabel && (
              <button
                onClick={() => {
                  t.action?.();
                  setItems((prev) => prev.filter((x) => x.id !== t.id));
                }}
              >
                {t.actionLabel}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
