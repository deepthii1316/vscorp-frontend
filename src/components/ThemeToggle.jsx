'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { applyTheme, getSavedTheme, systemTheme } from '@/lib/theme';

/** Sun / moon button: switches light <-> dark and remembers it. Until clicked, follows the OS. */
export default function ThemeToggle() {
  const [theme, setTheme] = useState(null);

  useEffect(() => {
    setTheme(document.documentElement.getAttribute('data-theme') || 'light');
    if (getSavedTheme()) return undefined;
    // No saved choice yet: keep following the OS if it switches (e.g. sunset auto-dark).
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => { const t = systemTheme(); applyTheme(t, false); setTheme(t); };
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  const next = theme === 'dark' ? 'light' : 'dark';
  const label = `Switch to ${next} mode`;
  return (
    <button type="button" className="top-bar-icon-btn" title={label} aria-label={label}
      onClick={() => { applyTheme(next); setTheme(next); }}>
      {theme === 'dark' ? <Sun style={{ width: '15px', height: '15px' }} /> : <Moon style={{ width: '15px', height: '15px' }} />}
    </button>
  );
}
