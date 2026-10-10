'use client';

// Sign-in page. Left: what the application is and the sign-in form (email + password; accounts
// are created by an administrator). Right: a gently animated illustration.
// The Google button is a placeholder for now: it explains that Google sign-in is not switched on
// yet and signs nobody in.

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import Image from 'next/image';
import { Eye, EyeOff } from 'lucide-react';

function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true" width="18" height="18">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A8.97 8.97 0 0 0 9 0 9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

// A store dashboard on a screen with three cards floating around it. Drawn here (no image file);
// the movement is in globals.css and is switched off for people who ask for reduced motion.
function Illustration() {
  return (
    <svg className="lg-art" viewBox="0 0 560 470" role="img" aria-label="A store dashboard with sales, stock and petty cash cards">
      <path className="lg-blob" d="M92 250c-22-78 22-168 108-190 62-16 96 22 150 8 70-18 138 22 150 96 10 62-18 96-12 146 8 62-44 104-112 106-74 2-108-30-172-24-70 6-98-74-112-142z" />

      {/* leaves behind the screen: the only green in the picture */}
      <g className="lg-leaf lg-leaf-a"><path d="M398 150c-6-44 16-76 50-86 8 40-6 72-50 86z" fill="#9CCFAE" /><path d="M398 150c10-30 26-52 50-86" stroke="#6FB58A" strokeWidth="2" fill="none" /></g>
      <g className="lg-leaf lg-leaf-b"><path d="M418 168c14-34 44-50 74-44-8 34-34 52-74 44z" fill="#B9DEC5" /><path d="M418 168c22-18 46-32 74-44" stroke="#8CC6A2" strokeWidth="2" fill="none" /></g>

      <line x1="60" y1="410" x2="510" y2="410" stroke="#2F3A6B" strokeWidth="2" strokeLinecap="round" />

      {/* plant */}
      <g className="lg-leaf lg-leaf-c"><path d="M112 372c-18-22-20-48-6-66 18 16 22 42 6 66z" fill="#C9D6F5" /><path d="M118 374c2-30 16-50 38-56 4 26-10 46-38 56z" fill="#AEBFF0" /></g>
      <path d="M92 372h52l-7 38h-38z" fill="#C9D6F5" />

      {/* screen */}
      <rect x="250" y="368" width="44" height="34" fill="#9AA8F0" />
      <rect x="222" y="398" width="100" height="12" rx="6" fill="#B8C3F6" />
      <rect x="128" y="124" width="290" height="250" rx="16" fill="#8E9CF0" />
      <rect x="140" y="136" width="266" height="214" rx="10" fill="#4F5BD5" />
      <circle cx="156" cy="150" r="3" fill="#C9D0FA" /><circle cx="167" cy="150" r="3" fill="#C9D0FA" /><circle cx="178" cy="150" r="3" fill="#C9D0FA" />

      {/* three small tiles */}
      <g fill="#6E7BE6">
        <rect x="156" y="166" width="72" height="40" rx="6" /><rect x="237" y="166" width="72" height="40" rx="6" /><rect x="318" y="166" width="72" height="40" rx="6" />
      </g>
      <g fill="#FFFFFF" opacity="0.9">
        <rect x="165" y="176" width="30" height="5" rx="2.5" /><rect x="246" y="176" width="30" height="5" rx="2.5" /><rect x="327" y="176" width="30" height="5" rx="2.5" />
      </g>
      <rect x="165" y="188" width="46" height="9" rx="3" fill="#FFB067" />
      <rect x="246" y="188" width="38" height="9" rx="3" fill="#FFFFFF" />
      <rect x="327" y="188" width="50" height="9" rx="3" fill="#A7E3BD" />

      {/* bars */}
      <g className="lg-bars">
        <rect x="164" y="282" width="16" height="48" rx="3" fill="#FFB067" />
        <rect x="188" y="262" width="16" height="68" rx="3" fill="#FF9440" />
        <rect x="212" y="292" width="16" height="38" rx="3" fill="#FFB067" />
        <rect x="236" y="246" width="16" height="84" rx="3" fill="#FF9440" />
        <rect x="260" y="270" width="16" height="60" rx="3" fill="#FFB067" />
      </g>
      {/* trend line */}
      <polyline className="lg-line" points="296,312 318,290 338,300 360,262 386,238" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <g className="lg-dots" fill="#FFFFFF"><circle cx="318" cy="290" r="4" /><circle cx="360" cy="262" r="4" /><circle cx="386" cy="238" r="5" /></g>
      <line x1="156" y1="332" x2="390" y2="332" stroke="#7E8AEA" strokeWidth="2" />

      {/* card: sales */}
      <g className="lg-card lg-card-a">
        <rect x="52" y="150" width="128" height="74" rx="12" fill="#FFFFFF" />
        <rect x="66" y="164" width="44" height="6" rx="3" fill="#C5CBE8" />
        <rect x="66" y="178" width="62" height="12" rx="4" fill="#2F3A6B" />
        <polyline points="66,210 84,202 100,206 118,194 140,198 164,184" fill="none" stroke="#4F5BD5" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M150 164l8 10h-16z" fill="#3DAA6D" />
      </g>
      {/* card: stock */}
      <g className="lg-card lg-card-b">
        <rect x="384" y="196" width="124" height="82" rx="12" fill="#FFFFFF" />
        <rect x="398" y="210" width="40" height="6" rx="3" fill="#C5CBE8" />
        <rect x="398" y="226" width="96" height="8" rx="4" fill="#E6EAF8" /><rect x="398" y="226" width="70" height="8" rx="4" fill="#4F5BD5" />
        <rect x="398" y="242" width="96" height="8" rx="4" fill="#E6EAF8" /><rect x="398" y="242" width="46" height="8" rx="4" fill="#FF9440" />
        <rect x="398" y="258" width="96" height="8" rx="4" fill="#E6EAF8" /><rect x="398" y="258" width="82" height="8" rx="4" fill="#8E9CF0" />
      </g>
      {/* card: petty cash voucher */}
      <g className="lg-card lg-card-c">
        <path d="M398 302h96a10 10 0 0 1 10 10v70l-10-7-11 7-11-7-11 7-11-7-11 7-11-7-10 7v-70a10 10 0 0 1 10-10z" fill="#FFF3E6" />
        <rect x="412" y="318" width="50" height="6" rx="3" fill="#F2C9A0" />
        <rect x="412" y="332" width="76" height="6" rx="3" fill="#F7DDC2" />
        <rect x="412" y="346" width="60" height="6" rx="3" fill="#F7DDC2" />
        <circle cx="478" cy="322" r="11" fill="#3DAA6D" /><path d="M472 322l4 4 8-8" stroke="#FFFFFF" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

export default function LoginPage() {
  const { signIn, isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  // The home page sends each role to its own first page.
  useEffect(() => {
    if (isAuthenticated) router.replace('/');
  }, [isAuthenticated, router]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr(''); setNote('');
    setBusy(true);
    const { error } = await signIn(email, password);
    setBusy(false);
    if (error) {
      setErr(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : (error.message || 'Sign-in failed.'));
      return;
    }
    router.replace('/');
  };

  const working = busy || authLoading;

  return (
    <div className="lg-shell">
      <header className="lg-top">
        <span className="lg-logo"><Image src="/virata-logo.png" alt="" width={34} height={34} priority /></span>
        <span className="lg-name">Virata Retail</span>
      </header>

      <div className="lg-body">
        <section className="lg-left">
          <h1 className="lg-title">Your store&apos;s numbers,<br />in one place.</h1>
          <p className="lg-sub">Sales, stock, P&amp;L and petty cash for Uppal Reebok. Upload the day&apos;s files and every report is ready.</p>

          {/* Placeholder: Google sign-in is not switched on yet, so this signs nobody in. */}
          <button type="button" className="lg-google" onClick={() => { setErr(''); setNote('Google sign-in is not available yet. Please use your email and password below.'); }}>
            <GoogleMark />
            Sign up with your Google account
            <span className="lg-soon">Soon</span>
          </button>
          {note && <p className="lg-note" role="status">{note}</p>}

          <div className="lg-or"><span>OR</span></div>

          <form onSubmit={onSubmit} className="lg-form">
            <input className="lg-input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address" aria-label="Email address" required />
            <div className="lg-row">
              <span className="lg-password">
                <input className="lg-input" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password}
                  onChange={(e) => setPassword(e.target.value)} placeholder="Password" aria-label="Password" required />
                <button type="button" className="lg-eye" onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'} title={showPassword ? 'Hide password' : 'Show password'}>
                  {showPassword ? <EyeOff /> : <Eye />}
                </button>
              </span>
              <button type="submit" className="lg-submit" disabled={working}>{working ? 'Signing in…' : 'Sign in'}</button>
            </div>
            {err && <div className="lg-err" role="alert">{err}</div>}
          </form>

          <p className="lg-foot">Internal access only. Trouble signing in? Ask your administrator to reset your password.</p>
        </section>

        <section className="lg-right" aria-hidden="true"><Illustration /></section>
      </div>
    </div>
  );
}
