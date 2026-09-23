import { useEffect, useState, type FormEvent } from 'react';
import { createRootPortal } from './portal';

export function PinPad({
  title,
  subtitle,
  length = 4,
  onComplete,
  error,
  onClose,
}: {
  title: string;
  subtitle?: string;
  length?: number;
  onComplete: (pin: string) => void;
  error?: string;
  onClose?: () => void;
}) {
  const [digits, setDigits] = useState('');
  const [showClose] = useState(() => !!onClose);

  // A failed attempt clears the dots so the next try starts fresh.
  useEffect(() => {
    if (error) setDigits('');
  }, [error]);

  const push = (d: string) => {
    if (digits.length >= length) return;
    const next = digits + d;
    setDigits(next);
    if (next.length === length) {
      // brief pause so the last dot animates in
      window.setTimeout(() => onComplete(next), 180);
    }
  };

  const onKey = (e: FormEvent<HTMLDivElement>) => {
    const key = (e.target as HTMLElement).dataset?.key;
    if (key === 'back') setDigits(digits.slice(0, -1));
    else if (key) push(key);
  };

  return createRootPortal(
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="modal" style={{ maxWidth: 360 }} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          {showClose && (
            <button className="icon-btn" onClick={onClose} aria-label="Cancel">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          )}
        </div>
        <div className="modal-body" style={{ alignItems: 'center' }}>
          {subtitle && <p className="muted">{subtitle}</p>}
          <div className="pin-dots" aria-label={`PIN entry, ${digits.length} of ${length} digits`}>
            {Array.from({ length }, (_, i) => (
              <span key={i} className={`pin-dot ${i < digits.length ? 'filled' : ''}`} />
            ))}
          </div>
          <div className="pin-pad" onClick={onKey}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => (
              <button key={k} type="button" className="pin-key" data-key={k}>
                {k}
              </button>
            ))}
            <span />
            <button type="button" className="pin-key" data-key="0">
              0
            </button>
            <button type="button" className="pin-key" data-key="back" aria-label="Delete digit">
              ⌫
            </button>
          </div>
          <div className="pin-error">{error}</div>
        </div>
      </div>
    </div>,
  );
}
