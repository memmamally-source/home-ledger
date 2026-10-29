import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { firebaseConfigured } from '@/lib/firebase';
import { applyTheme } from '@/app/theme';
import { SetupNeeded } from '@/app/SetupNeeded';

let saved: 'light' | 'dark' | 'system' = 'light';
try {
  const t = localStorage.getItem('hl-theme');
  if (t === 'dark' || t === 'system') saved = t;
} catch {
  // ignore: storage can be unavailable
}
applyTheme(saved);

const root = createRoot(document.getElementById('root')!);

if (!firebaseConfigured) {
  root.render(<SetupNeeded />);
} else {
  void Promise.all([import('@/app/App'), import('@/lib/uploads')]).then(([{ App }, uploads]) => {
    uploads.startUploadWorker();
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
}
