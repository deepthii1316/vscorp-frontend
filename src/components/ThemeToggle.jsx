'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { applyTheme } from '@/lib/theme';

/** Sun / moon button: switches light <-> dark and remembers it. Light until the user picks dark. */
export default function ThemeToggle() {
  const [theme, setTheme] = useState(null);

  useEffect(() => {
    setTheme(document.documentElement.getAttribute('data-theme') || 'light');
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
