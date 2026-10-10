// app/merch-reports/page.js — Uppal Reebok merchandiser report in-page view
// Calls /api/reports/merch-report and renders its three tabs (Division Summary, Footwear,
// Apparel). ?report=<key> filters to one tab. Each tab is also captured as a PNG, and the
// whole report downloads as an Excel workbook — the same pattern as the Sales Reports page.
// Every tab fills the page width, one below the other; a table wider than the page is shrunk to
// fit (never scrolled sideways).

'use client';

import { useState, useEffect, useLayoutEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Download, RefreshCw, Image as ImageIcon, Layers, Footprints, Shirt, LayoutList, FlaskConical, Send } from 'lucide-react';
import html2canvas from 'html2canvas';
import RequireAuth from '@/components/RequireAuth';
import { apiFetch } from '@/lib/api';
import { SkeletonTable } from '@/components/Skeleton';

const REPORT_KEYS = ['division', 'footwear', 'apparel'];
const REPORT_TITLES = {
  division: 'Division Summary',
  footwear: 'Footwear',
  apparel:  'Apparel',
};
const REPORT_ICONS = {
  division: Layers,
  footwear: Footprints,
  apparel:  Shirt,
};

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// One report tab, filling the page width. Its tables stretch to the card like the sales
// report's; a table whose natural width is more than the card is scaled down as one block
// (text included) instead of scrolling sideways - the sales page's fitTables technique.
function FitBox({ html }) {
  const ref = useRef(null);

  const fit = useCallback(() => {
    ref.current?.querySelectorAll('table').forEach((table) => {
      const wrap = table.parentElement;
      wrap.style.overflow = 'hidden';
      // Measure the true natural width: .report-section table pins width to 100% in CSS.
      table.style.minWidth = '0';
      table.style.width = 'max-content';
      table.style.transform = 'none';
      const naturalWidth = table.scrollWidth, naturalHeight = table.scrollHeight;
      const availWidth = wrap.clientWidth;
      if (availWidth > 0 && naturalWidth > availWidth) {
        const scale = availWidth / naturalWidth;
        table.style.transformOrigin = 'top left';
        table.style.transform = `scale(${scale})`;
        wrap.style.height = `${naturalHeight * scale}px`;
      } else {
        // Already fits: back to the normal CSS, stretched to fill the card.
        table.style.minWidth = '';
        table.style.width = '';
        wrap.style.height = 'auto';
      }
    });
  }, []);

  useLayoutEffect(() => {
    fit();
    const t = setTimeout(fit, 120); // refit once web fonts/layout settle
    const observer = new ResizeObserver(fit);
    observer.observe(ref.current);
    return () => { clearTimeout(t); observer.disconnect(); };
  }, [html, fit]);

  return <div ref={ref} dangerouslySetInnerHTML={{ __html: html }} />;
}

function MerchReportsInner() {
  const router     = useRouter();
  const pathname   = usePathname();
  const searchParams = useSearchParams();
  const report     = searchParams.get('report');

  const [parts, setParts]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [noData, setNoData]     = useState(false);
  const [subject, setSubject]   = useState('');
  const [reportDate, setReportDate] = useState(null);
  const stageRef = useRef(null);

  // Captured tab images, and the Excel download in flight
  const [images, setImages]       = useState([]);
  const [capturing, setCapturing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sendState, setSendState] = useState({ status: 'idle', message: '' });
  // Send to All: the same distribution list as the Sales Reports page, picked in a confirm dialog
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [allRecipients, setAllRecipients] = useState([]);
  const [selectedRecipients, setSelectedRecipients] = useState([]);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/reports/merch-report', { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setParts(json.parts || []);
      setNoData(json.noData || false);
      setSubject(json.subject || '');
      setReportDate(json.reportDate || null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  // Recipient list for the Send to All picker (Send Test has no picker).
  useEffect(() => {
    apiFetch('/api/reports/reebok-send').then((r) => r.json()).then((json) => {
      setAllRecipients(json.allRecipients || []);
      setSelectedRecipients(json.allRecipients || []); // everyone checked by default
    }).catch(() => {});
  }, []);

  const toggleRecipient = (addr) => {
    setSelectedRecipients((prev) => (prev.includes(addr) ? prev.filter((r) => r !== addr) : [...prev, addr]));
  };

  // Capture every tab as a PNG in the background so a click only has to save.
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
          blobs.push({ key: node.dataset.key, blob });
        }
        if (!cancelled) setImages(blobs);
      } catch (e) {
        if (!cancelled) setError('Could not prepare report images: ' + e.message);
      } finally {
        if (!cancelled) setCapturing(false);
      }
    })();
    return () => { cancelled = true; };
  }, [parts, loading]);

  const downloadImages = () => {
    images
      .filter((img) => !report || img.key === report)
      .forEach((img) => saveBlob(img.blob, `Reebok_Merch_${REPORT_TITLES[img.key].replace(/\s+/g, '_')}_${reportDate}.png`));
  };

  // The export route needs the Bearer token, so it is fetched (not a plain link).
  const downloadExcel = async () => {
    setExporting(true);
    setError(null);
    try {
      const res = await apiFetch('/api/reports/merch-report/export');
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      saveBlob(await res.blob(), `Virata_Retail_Reebok_Merchandiser_Stock_Report_${reportDate}.xlsx`);
    } catch (e) {
      setError(e.message);
    } finally {
      setExporting(false);
    }
  };

  // Tab images inline + the Excel attached. 'test' goes to config.js TEST_RECIPIENTS; 'all' goes
  // to whichever of ALL_RECIPIENTS are checked in the confirm dialog (validated server-side).
  const sendReport = async (mode) => {
    setConfirmOpen(false);
    setSendState({ status: 'sending', message: mode === 'all' ? 'Sending to all recipients…' : 'Sending test email…' });
    try {
      const fd = new FormData();
      images.forEach((img, i) => fd.append('images', img.blob, 'report-' + (i + 1) + '.png'));
      fd.append('mode', mode);
      fd.append('report', 'merch');
      if (mode === 'all') fd.append('recipients', JSON.stringify(selectedRecipients));
      const res = await apiFetch('/api/reports/reebok-send', { method: 'POST', body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'HTTP ' + res.status);
      setSendState({ status: 'success', message: (mode === 'all' ? 'Report' : 'Test report') + ' emailed to ' + json.recipients + ' recipient' + (json.recipients === 1 ? '' : 's') + '.' });
    } catch (e) {
      setSendState({ status: 'error', message: e.message });
    }
  };

  const setReport = (key) => {
    if (!key || !REPORT_KEYS.includes(key)) router.replace(pathname);
    else router.replace(`${pathname}?report=${key}`);
  };

  const visibleParts = report ? parts.filter((p) => p.key === report) : parts;
  const imagesReady = images.length > 0 && !capturing && !loading;

  return (
    <div className="reebok-page-wrapper">
      <div className="reebok-layout">
        <nav className="reebok-subnav" aria-label="Merchandiser reports">
          <div className="reebok-subnav-label">Merch Reports</div>
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
        <div className="reebok-page-header">
          <div className="reebok-page-header-row">
            <div>
              <h1 className="reebok-page-title">Uppal Reebok — Merchandiser Reports</h1>
              <p className="reebok-page-subtitle">
                {subject || (loading ? 'Loading stock data…' : '')}
              </p>
            </div>
            <div className="reebok-page-actions">
              <button className="reebok-btn secondary" onClick={fetchReport} disabled={loading} type="button">
                <RefreshCw style={{ width: 13, height: 13 }} />
                {loading ? 'Loading…' : 'Refresh'}
              </button>
              <button className="reebok-btn secondary" onClick={downloadImages} disabled={!imagesReady} type="button"
                      title="Save each report tab as a PNG image">
                <ImageIcon style={{ width: 13, height: 13 }} />
                {capturing ? 'Preparing…' : 'Download images'}
              </button>
              <button className="reebok-btn secondary" onClick={() => sendReport('test')} disabled={!imagesReady || sendState.status === 'sending'} type="button"
                      title="Email this report to the test recipients only">
                <FlaskConical style={{ width: 13, height: 13 }} />
                {sendState.status === 'sending' ? 'Sending…' : 'Send Test'}
              </button>
              <button className="reebok-btn secondary" onClick={() => setConfirmOpen(true)} disabled={!imagesReady || sendState.status === 'sending' || allRecipients.length === 0} type="button"
                      title="Email this report to the full distribution list">
                <Send style={{ width: 13, height: 13 }} />
                Send to All
              </button>
              <button className="reebok-btn" onClick={downloadExcel} disabled={loading || exporting || !reportDate} type="button">
                <Download style={{ width: 13, height: 13 }} />
                {exporting ? 'Building…' : 'Download .xlsx'}
              </button>
            </div>
          </div>

          {noData && (
            <div className="reebok-warn">
              No stock report has been processed yet. Upload a Stock Balance Report and run processing.
            </div>
          )}
        </div>

        {error && <div className="reebok-error">Error: {error}</div>}
        {sendState.status === 'success' && <div className="reebok-warn" role="status">{sendState.message}</div>}
        {sendState.status === 'error' && <div className="reebok-error" role="status">Could not send: {sendState.message}</div>}

        {loading ? (
          <>
            <SkeletonTable rows={5} columns={8} />
            <SkeletonTable rows={8} columns={8} />
          </>
        ) : (
          <div>
            {visibleParts.map((p) => (
              <FitBox key={p.key} html={p.html} />
            ))}
          </div>
        )}
      </div>
      </div>
      {confirmOpen && (
        <div className="reebok-modal-backdrop" onClick={() => setConfirmOpen(false)}>
          <div className="reebok-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>Send report to whom?</h3>
            <p>
              This will email the Uppal Reebok merchandiser stock report, stock as of <strong>{reportDate}</strong> ({images.length} tabs as images + the Excel file),
              to whichever recipients are checked below.
            </p>
            <div className="reebok-recipient-list">
              {allRecipients.map((addr) => (
                <label key={addr} className="reebok-recipient-item">
                  <input type="checkbox" checked={selectedRecipients.includes(addr)} onChange={() => toggleRecipient(addr)} />
                  <span>{addr}</span>
                </label>
              ))}
            </div>
            <div className="reebok-modal-actions">
              <button type="button" className="reebok-send-btn secondary" onClick={() => setConfirmOpen(false)}>Cancel</button>
              <button type="button" className="reebok-send-btn" disabled={selectedRecipients.length === 0} onClick={() => sendReport('all')}>
                <Send /> Send to {selectedRecipients.length} recipient{selectedRecipients.length === 1 ? '' : 's'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Off-screen staging: every tab rendered once, captured to PNG */}
      <div ref={stageRef} aria-hidden="true" style={{ position: 'fixed', left: -30000, top: 0, width: 1400, pointerEvents: 'none' }}>
        {parts.map((p) => (
          <div key={p.key} data-key={p.key} style={{ background: '#fff', padding: 16, width: 'max-content', maxWidth: 1400 }} dangerouslySetInnerHTML={{ __html: p.html }} />
        ))}
      </div>
    </div>
  );
}

export default function MerchReportsPage() {
  return (
    <RequireAuth roles={['admin']}>
      <Suspense fallback={
        <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          Loading…
        </div>
      }>
        <MerchReportsInner />
      </Suspense>
    </RequireAuth>
  );
}
