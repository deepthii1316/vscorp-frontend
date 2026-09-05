// app/reebok-reports/page.js — Uppal Reebok reports in-page view
// Calls /api/reports/reebok-sales and renders the 4 HTML tables.
// Sidebar children pass ?report=<key> to filter to one table.

'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Download, RefreshCw, Calendar } from 'lucide-react';
import RequireAuth from '@/components/RequireAuth';
import { SkeletonTable } from '@/components/Skeleton';

const REPORT_KEYS = ['daywise', 'staff', 'category', 'gender'];
const REPORT_TITLES = {
  daywise:  'Daywise + MTD',
  staff:    'Staff KPI',
  category: 'FW / APP / ACC',
  gender:   'Gender / Division',
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

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/reports/reebok-sales', {
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

  const setReport = (key) => {
    if (!key || !REPORT_KEYS.includes(key)) router.replace(pathname);
    else router.replace(`${pathname}?report=${key}`);
  };

  const visibleParts = (() => {
    if (!report) return parts;
    return parts.filter((p) => {
      const t = (p.title || '').toLowerCase();
      if (report === 'daywise')  return t.includes('daywise') || t.includes('mtd');
      if (report === 'staff')    return t.includes('staff');
      if (report === 'category') return t.includes('fw') || t.includes('app') || t.includes('acc') || t.includes('category');
      if (report === 'gender')   return t.includes('gender') || t.includes('division');
      return true;
    });
  })();

  const reportKeyForPart = (p) => {
    const t = (p.title || '').toLowerCase();
    if (t.includes('daywise'))  return 'daywise';
    if (t.includes('staff'))    return 'staff';
    if (t.includes('fw'))       return 'category';
    if (t.includes('gender'))  return 'gender';
    return null;
  };

  return (
    <div className="reebok-page-wrapper">
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

          {/* Quick-jump tabs */}
          <div className="reebok-jump-row">
            <span className="reebok-jump-label">Jump to</span>
            <button className={`reebok-jump-tab ${!report ? 'active' : ''}`} onClick={() => setReport(null)} type="button">
              All Reports
            </button>
            {REPORT_KEYS.map((k) => (
              <button key={k} className={`reebok-jump-tab ${report === k ? 'active' : ''}`} onClick={() => setReport(k)} type="button">
                {REPORT_TITLES[k]}
              </button>
            ))}
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
                  ref={(el) => { if (rk && el) refs.current[rk] = el; }}
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
