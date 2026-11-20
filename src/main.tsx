import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { applyPalette, readPalette } from './landing/PalettePicker';

// apply saved colours and time of day before the first paint
applyPalette(readPalette());
try { document.documentElement.dataset.time = localStorage.getItem('terralyt.site.night') === '1' ? 'night' : 'day'; } catch { /* storage blocked */ }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
