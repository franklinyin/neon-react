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
  } else if (params.has('r3')) {
    void import('./lib/verovio/r3-reset-slur-probe').then(({ runR3ResetSlur }) => {
      void runR3ResetSlur();
    });
  } else if (params.has('notemove')) {
    void import('./lib/verovio/note-move-probe').then(({ runNoteMove }) => {
      void runNoteMove();
    });
  } else if (params.has('beammove')) {
    void import('./lib/verovio/beam-note-move-probe').then(({ runBeamNoteMove }) => {
      void runBeamNoteMove();
    });
  } else if (params.has('l2a')) {
    void import('./lib/verovio/l2a-label-probe').then(({ runL2A }) => {
      void runL2A();
    });
  } else if (params.has('l1b2')) {
    void import('./lib/verovio/l1b2-label-probe').then(({ runL1B2 }) => {
      void runL1B2();
    });
  } else if (params.has('l1b1')) {
    void import('./lib/verovio/l1b1-label-probe').then(({ runL1B1 }) => {
      void runL1B1();
    });
  } else if (params.has('l1') || params.has('l1a')) {
    void import('./lib/verovio/l1-label-probe').then(({ runL1Label }) => {
      void runL1Label();
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
