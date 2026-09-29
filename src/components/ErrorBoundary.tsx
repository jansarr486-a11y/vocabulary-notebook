import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Last-resort crash shield. Without this, any render error anywhere in the
 * tree unmounts React and leaves a pure white page with no clue what happened
 * (and no way back except DevTools). With this, the student sees what broke,
 * can retry, or can nuke the offline cache and reload — their words live in
 * IndexedDB and survive all of it.
 */

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Same repair routine as the boot watchdog in index.html and recover.html. */
async function repairAndReload(): Promise<void> {
  try {
    const regs = await navigator.serviceWorker?.getRegistrations();
    await Promise.all((regs ?? []).map((r) => r.unregister()));
    const keys = await caches?.keys();
    await Promise.all((keys ?? []).map((k) => caches.delete(k)));
  } catch {
    /* best effort — reload regardless */
  }
  window.location.reload();
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Mirror to console for DevTools, and persist a short trace so the
    // repair page (recover.html) can show what happened last time.
    console.error('Vocabulary Notebook crashed:', error, info);
    const detail = [error.message, info.componentStack?.split('\n').slice(0, 6).join('\n')]
      .filter(Boolean)
      .join('\n')
      .slice(0, 1500);
    try {
      localStorage.setItem('vn:last-error', detail);
    } catch {
      /* private mode — fine */
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="gate-wrap" dir="ltr">
        <div
          className="paper-card washi"
          style={{ maxWidth: 560, margin: '0 auto', textAlign: 'center', padding: 'var(--sp-5)' }}
        >
          <span className="doodle" style={{ fontSize: '2.4rem' }}>
            🩹
          </span>
          <h2 style={{ margin: 'var(--sp-3) 0 var(--sp-2)' }}>Something broke on this page</h2>
          <p className="muted">Your words and progress are safe — this is only a display problem.</p>
          <pre
            style={{
              textAlign: 'left',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              background: 'rgba(0,0,0,0.05)',
              borderRadius: 8,
              padding: 'var(--sp-3)',
              fontSize: '0.8rem',
              maxHeight: 160,
              overflow: 'auto',
              margin: 'var(--sp-3) 0',
            }}
          >
            {error.message}
          </pre>
          <div className="btn-row" style={{ justifyContent: 'center' }}>
            <button className="btn" onClick={() => this.setState({ error: null })}>
              ↩ Try again
            </button>
            <button className="btn btn-primary" onClick={() => void repairAndReload()}>
              🧹 Repair &amp; reload
            </button>
          </div>
          <p className="faint" style={{ marginTop: 'var(--sp-3)', fontSize: '0.85rem' }}>
            Still stuck? <a href="./recover.html">Open the repair page</a>
          </p>
        </div>
      </div>
    );
  }
}
