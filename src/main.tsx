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
  if (params.has('phase2a')) {
    void import('./lib/verovio/phase2a-probe').then(({ runPhase2A }) => {
      void runPhase2A();
    });
  } else if (params.has('smoke')) {
    void import('./lib/verovio/smoke').then(({ runVerovioSmoke }) => {
      void runVerovioSmoke();
    });
  }
}
