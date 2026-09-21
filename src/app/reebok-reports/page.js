// app/reebok-reports/page.js — Uppal Reebok reports in-page view
// Calls /api/reports/reebok-sales and renders the 4 HTML tables.
// Sidebar children pass ?report=<key> to filter to one table.

'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Download, RefreshCw, Calendar, CalendarDays, Users, Layers, VenusAndMars, LayoutList, Mail } from 'lucide-react';
import html2canvas from 'html2canvas';
import { Download, RefreshCw, Calendar, CalendarDays, Users, Layers, VenusAndMars, LayoutList, FlaskConical, Send, X } from 'lucide-react';
import RequireAuth from '@/components/RequireAuth';
import { apiFetch } from '@/lib/api';
import { SkeletonTable } from '@/components/Skeleton';

const REPORT_KEYS = ['daywise', 'staff', 'category', 'gender'];
const REPORT_TITLES = {
  daywise:  'Target, Daywise, MTD & YTD',
  staff:    'Staff KPI',
  category: 'FW / APP / ACC',
  gender:   'Gender / Division',
};

const REPORT_ICONS = {
  daywise:  CalendarDays,
  staff:    Users,
  category: Layers,
  gender:   VenusAndMars,
};

const REPORT_ICONS = {
  daywise:  CalendarDays,
  staff:    Users,
  category: Layers,
  gender:   VenusAndMars,
};

function todayIST() { return new Date().toISOString().split('T')[0]; }
function yesterdayIST() { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0]; }

function ReebokReportsInner() {
  const router     = useRouter();
  const pathname   = usePathname();
  const searchParams = useSearchParams();
  const report     = searchParams.get('report');

  const [date, setDate]         = useState(yesterdayIST());
  const [parts, setParts]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]        = useState(null);
  const [noData, setNoData]     = useState(false);
  const [latestDate, setLatestDate] = useState(null);
  const [subject, setSubject]    = useState('');
  const refs = useRef({});
  const stageRef = useRef(null);

  // Email: captured table images, send status, "send to all" confirmation
  const [reportDate, setReportDate] = useState(null);
  const [images, setImages]         = useState([]);
  const [capturing, setCapturing]   = useState(false);
  const [sendState, setSendState]   = useState({ status: 'idle', message: '' });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [counts, setCounts]         = useState({ test: null, all: null });

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/reports/reebok-sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setParts(json.parts || []);
      setNoData(json.noData || false);
      setLatestDate(json.latestDate || null);
      setSubject(json.subject || '');
      setReportDate(json.reportDate || null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  // Scroll to selected section after data loads
  useEffect(() => {
    if (!loading && report && refs.current[report]) {
      const t = setTimeout(() => {
        const el = refs.current[report];
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        el.classList.add('report-section-highlight');
        setTimeout(() => el.classList.remove('report-section-highlight'), 1800);
      }, 80);
      return () => clearTimeout(t);
    }
  }, [loading, report]);

  // Recipient counts for the confirmation dialog (counts only, never addresses)
  useEffect(() => {
    fetch('/api/reports/reebok-send').then((r) => r.json()).then(setCounts).catch(() => {});
  }, []);

  // Capture every table as a PNG in the background so a click only has to send.
  useEffect(() => {
    setImages([]);
    if (loading || parts.length === 0) return undefined;
    let cancelled = false;
    setCapturing(true);
    (async () => {
      try {
        await new Promise((r) => setTimeout(r, 200)); // let the staging DOM paint
        const nodes = Array.from(stageRef.current?.children || []);
        const blobs = [];
        for (const node of nodes) {
          node.querySelectorAll('div').forEach((d) => { d.style.overflow = 'visible'; });
          const canvas = await html2canvas(node, {
            scale: 1.75,
            backgroundColor: '#ffffff',
            useCORS: true,
            logging: false,
            width: node.scrollWidth,
            height: node.scrollHeight,
            windowWidth: node.scrollWidth,
            windowHeight: node.scrollHeight,
          });
          const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
          if (cancelled) return;
          blobs.push(blob);
        }
        if (!cancelled) setImages(blobs);
      } catch (e) {
        if (!cancelled) setSendState({ status: 'error', message: 'Could not prepare report images: ' + e.message });
      } finally {
        if (!cancelled) setCapturing(false);
      }
    })();
    return () => { cancelled = true; };
  }, [parts, loading]);

  const sendReport = async (mode) => {
    setConfirmOpen(false);
    setSendState({ status: 'sending', message: mode === 'all' ? 'Sending to all recipients…' : 'Sending test email…' });
    try {
      const fd = new FormData();
      images.forEach((b, i) => fd.append('images', b, 'report-' + (i + 1) + '.png'));
      fd.append('date', reportDate || date);
      fd.append('mode', mode);
      const res = await fetch('/api/reports/reebok-send', { method: 'POST', body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'HTTP ' + res.status);
      setSendState({
        status: 'success',
        message: (mode === 'all' ? 'Report' : 'Test report') + ' emailed to ' + json.recipients + ' recipient' + (json.recipients === 1 ? '' : 's') + '.',
      });
    } catch (e) {
      setSendState({ status: 'error', message: e.message });
    }
  };

  const sendReady = images.length > 0 && !capturing && !loading && sendState.status !== 'sending';

  const setReport = (key) => {
    if (!key || !REPORT_KEYS.includes(key)) router.replace(pathname);
    else router.replace(`${pathname}?report=${key}`);
  };

  // Each part carries a `key` (daywise | staff | category | gender) from the API.
  const visibleParts = report ? parts.filter((p) => p.key === report) : parts;
  const reportKeyForPart = (p) => p.key || null;

  return (
    <div className="reebok-page-wrapper">
      <div className="reebok-layout">
        <nav className="reebok-subnav" aria-label="Sales reports">
          <div className="reebok-subnav-label">Sales Reports</div>
          <button type="button" className={`reebok-subnav-item ${!report ? 'active' : ''}`} onClick={() => setReport(null)}>
            <LayoutList /><span>All Reports</span>
          </button>
          {REPORT_KEYS.map((k) => {
            const Icon = REPORT_ICONS[k];
            return (
              <button key={k} type="button" className={`reebok-subnav-item ${report === k ? 'active' : ''}`} onClick={() => setReport(k)}>
                <Icon /><span>{REPORT_TITLES[k]}</span>
              </button>
            );
          })}
        </nav>
      <div className="reebok-layout">
        <nav className="reebok-subnav" aria-label="Sales reports">
          <div className="reebok-subnav-label">Sales Reports</div>
          <button type="button" className={`reebok-subnav-item ${!report ? 'active' : ''}`} onClick={() => setReport(null)}>
            <LayoutList /><span>All Reports</span>
          </button>
          {REPORT_KEYS.map((k) => {
            const Icon = REPORT_ICONS[k];
            return (
              <button key={k} type="button" className={`reebok-subnav-item ${report === k ? 'active' : ''}`} onClick={() => setReport(k)}>
                <Icon /><span>{REPORT_TITLES[k]}</span>
              </button>
            );
          })}
        </nav>
      <div className="reebok-page-container">
        {/* Page Header */}
        <div className="reebok-page-header">
          <div className="reebok-page-header-row">
            <div>
              <h1 className="reebok-page-title">Uppal Reebok — Sales Reports</h1>
              <p className="reebok-page-subtitle">
                {subject || 'Loading sales data…'}
              </p>
            </div>
            <div className="reebok-page-actions">
              <label className="reebok-input-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Calendar style={{ width: 13, height: 13 }} />
                Report date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                max={todayIST()}
                className="reebok-input"
              />
              <button
                className="reebok-btn secondary"
                onClick={fetchReport}
                disabled={loading}
                type="button"
              >
                <RefreshCw style={{ width: 13, height: 13 }} />
                {loading ? 'Loading…' : 'Refresh'}
              </button>
              <a
                href={`/api/reports/reebok-export?date=${date}`}
                className="reebok-btn"
                type="button"
              >
                <Download style={{ width: 13, height: 13 }} />
                Download .xlsx
              </a>
            </div>
          </div>

          {noData && (
            <div className="reebok-warn">
              No data for <strong>{date}</strong>.
              {latestDate ? <> Latest available: <strong>{latestDate}</strong>.</> : ' No gold table data yet.'}
            </div>
          )}
        </div>

        {error && <div className="reebok-error">Error: {error}</div>}

        {loading ? (
          <>
            <SkeletonTable rows={8} columns={3} />
            <SkeletonTable rows={5} columns={6} />
          </>
        ) : (
          <>
            {visibleParts.map((p) => {
              const rk = reportKeyForPart(p);
              return (
                <div
                  key={p.title}
                  ref={(el) => { if (rk && el && !refs.current[rk]?.isConnected) refs.current[rk] = el; }}
                  className="report-section"
                  dangerouslySetInnerHTML={{ __html: p.html }}
                />
              );
            })}
            {!loading && visibleParts.length === 0 && !error && (
              <div className="reebok-empty">No report parts to display.</div>
            )}
          </>
        )}
      </div>
      </div>
      <button type="button" className="reebok-send-fab" title="Send this report to an email address">
        <Mail /> Send to Mail
      </button>
      </div>
      {/* Off-screen staging: every table rendered once, captured to PNG for the email */}
      <div ref={stageRef} aria-hidden="true" style={{ position: 'fixed', left: -30000, top: 0, width: 1400, pointerEvents: 'none' }}>
        {parts.map((p) => (
          <div key={p.title} style={{ background: '#fff', padding: 16, width: 'max-content', maxWidth: 1400 }} dangerouslySetInnerHTML={{ __html: p.html }} />
        ))}
      </div>

      <div className="reebok-send-bar">
        {sendState.status !== 'idle' && (
          <div className={'reebok-send-status ' + sendState.status} role="status">
            <span>{sendState.message}</span>
            {sendState.status !== 'sending' && (
              <button type="button" aria-label="Dismiss" onClick={() => setSendState({ status: 'idle', message: '' })}><X /></button>
            )}
          </div>
        )}
        <div className="reebok-send-actions">
          <button type="button" className="reebok-send-btn secondary" disabled={!sendReady} onClick={() => sendReport('test')}
                  title="Email this report to the test recipients only">
            <FlaskConical /> {capturing ? 'Preparing…' : 'Send Test'}
          </button>
          <button type="button" className="reebok-send-btn" disabled={!sendReady} onClick={() => setConfirmOpen(true)}
                  title="Email this report to the full distribution list">
            <Send /> Send to All
          </button>
        </div>
      </div>

      {confirmOpen && (
        <div className="reebok-modal-backdrop" onClick={() => setConfirmOpen(false)}>
          <div className="reebok-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>Send report to everyone?</h3>
            <p>
              This will email the <strong>{reportDate || date}</strong> Uppal Reebok report ({images.length} tables as images + the Excel file)
              to <strong>{counts.all ?? '…'}</strong> recipient{counts.all === 1 ? '' : 's'}.
            </p>
            <div className="reebok-modal-actions">
              <button type="button" className="reebok-send-btn secondary" onClick={() => setConfirmOpen(false)}>Cancel</button>
              <button type="button" className="reebok-send-btn" onClick={() => sendReport('all')}><Send /> Send to All</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReebokReportsPage() {
  return (
    <RequireAuth>
      <Suspense fallback={
        <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          Loading…
        </div>
      }>
        <ReebokReportsInner />
      </Suspense>
    </RequireAuth>
  );
}
