import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

if (import.meta.env.DEV) {
  const params = new URLSearchParams(window.location.search);
  if (params.has('recovery')) {
    void import('./lib/verovio/recovery-s5a-probe').then(({ runRecoveryS5A }) => {
      void runRecoveryS5A();
    });
  } else if (params.has('phase5')) {
    void import('./lib/verovio/phase5-probe').then(({ runPhase5 }) => {
      void runPhase5();
    });
  } else if (params.has('phase4')) {
    void import('./lib/verovio/phase4-probe').then(({ runPhase4 }) => {
      void runPhase4();
    });
  } else if (params.has('phase2a')) {
    void import('./lib/verovio/phase2a-probe').then(({ runPhase2A }) => {
      void runPhase2A();
    });
  } else if (params.has('smoke')) {
    void import('./lib/verovio/smoke').then(({ runVerovioSmoke }) => {
      void runVerovioSmoke();
    });
  }
}
