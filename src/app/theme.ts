import type { ThemePreference } from '@/data/users';

export function applyTheme(pref: ThemePreference) {
  const dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0d120f' : '#faf7ef');
  try {
    localStorage.setItem('hl-theme', pref);
  } catch {
    // storage may be unavailable (private mode); the profile keeps the preference
  }
}
