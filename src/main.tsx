import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

import './styles/tokens.css';
import './styles/base.css';
import './styles/ui.css';
import './styles/features.css';
import './styles/progress.css';

// Stand down the boot watchdog in index.html — the app mounted fine.
try {
  sessionStorage.removeItem('vn:boot');
  localStorage.removeItem('vn:repair-count');
} catch {
  /* noop */
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
