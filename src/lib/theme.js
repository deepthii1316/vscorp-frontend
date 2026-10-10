// Light / dark theme. Light is the default; dark only when the user picks it with the toggle
// (saved per browser as 'light' | 'dark'). The resolved theme is written to <html data-theme="..."> and
// every colour in globals.css hangs off that attribute.

export const THEME_KEY = 'virata-theme';

// Runs in <head> before the first paint (see app/layout.js), so a dark-mode user never sees a
// white flash. Kept as a string; it must not depend on any bundle code.
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');if(t!=='dark'){t='light';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

export function getSavedTheme() {
  try {
    const t = window.localStorage.getItem(THEME_KEY);
    return t === 'light' || t === 'dark' ? t : null;
  } catch {
    return null;
  }
}

export function applyTheme(theme, save = true) {
  document.documentElement.setAttribute('data-theme', theme);
  if (save) {
    try { window.localStorage.setItem(THEME_KEY, theme); } catch { /* private mode: still applied for this page */ }
  }
}
