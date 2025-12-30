import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './assets/fonts.css'
import './App.css'
import App from './App.tsx'

// Suppress known TLDraw/TipTap duplicate extension warning
// This is an internal TLDraw issue, not something we can fix directly
const originalWarn = console.warn;
console.warn = (...args: unknown[]) => {
  const message = args[0];
  if (typeof message === 'string' && message.includes('Duplicate extension names found')) {
    return; // Suppress this specific warning
  }
  originalWarn.apply(console, args);
};

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
