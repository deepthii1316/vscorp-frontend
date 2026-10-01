// Light / dark theme. The choice is saved per browser ('light' | 'dark'); with no saved choice the
// app follows the operating system. The resolved theme is written to <html data-theme="..."> and
// every colour in globals.css hangs off that attribute.

export const THEME_KEY = 'virata-theme';

// Runs in <head> before the first paint (see app/layout.js), so a dark-mode user never sees a
// white flash. Kept as a string; it must not depend on any bundle code.
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

export function getSavedTheme() {
  try {
    const t = window.localStorage.getItem(THEME_KEY);
    return t === 'light' || t === 'dark' ? t : null;
  } catch {
    return null;
  }
}

export function systemTheme() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme, save = true) {
  document.documentElement.setAttribute('data-theme', theme);
  if (save) {
    try { window.localStorage.setItem(THEME_KEY, theme); } catch { /* private mode: still applied for this page */ }
  }
}
