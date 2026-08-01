import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { legacyRedirect } from './shared/router';

// Alte URLs ohne Sprachpräfix (/your-weekly-mix, /shared-playlist) auf die
// neuen umleiten, bevor überhaupt gerendert wird – Einladungslinks mit
// ?join=… behalten dabei ihren Query-Teil.
const redirect = legacyRedirect();
if (redirect) {
  window.location.replace(redirect);
} else {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
