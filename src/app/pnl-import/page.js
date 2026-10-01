'use client';

// Import P&L Data, admin only. Choose the P&L Excel -> preview EVERY month that was read (sales,
// margin, each expense line, depreciation, funds cost, ROI) -> Import saves all months in one
// transaction (/api/pnl/import -> public.pnl_import). Re-importing a month replaces it.
// Parsing: src/lib/pnlExcelImport.js (columns matched by header name; months as rows or columns).

import { useRef, useState } from 'react';
import Link from 'next/link';
import { FileSpreadsheet, Upload, AlertTriangle, CheckCircle2, ArrowLeft } from 'lucide-react';
import RequireAuth from '@/components/RequireAuth';
import { apiFetch } from '@/lib/api';
import { parsePnLWorkbook, opexOf, EXPENSES } from '@/lib/pnlExcelImport';
import { formatINRFull } from '@/lib/masterDashboardShared';

const monthShort = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const cell = (v) => (v == null ? '—' : formatINRFull(v));

function PnLImport() {
  const inputRef = useRef(null);
  const [fileName, setFileName] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [readError, setReadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  const reset = () => { setParsed(null); setFileName(null); setReadError(null); setResult(null); if (inputRef.current) inputRef.current.value = ''; };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    reset();
    setFileName(file.name);
    try {
      setParsed(parsePnLWorkbook(await file.arrayBuffer()));
    } catch (err) {
      setReadError(`Could not read ${file.name}: ${err.message}`);
    }
  };

  const doImport = async () => {
    setSaving(true); setResult(null);
    try {
      const res = await apiFetch('/api/pnl/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ months: parsed.months }),
      });
      const json = await res.json();
      setResult(res.ok && json.success ? { ok: true, saved: json.saved } : { ok: false, error: json.error || `HTTP ${res.status}` });
    } catch (err) {
      setResult({ ok: false, error: err.message });
    } finally {
      setSaving(false);
    }
  };

  const months = parsed?.months || [];
  const usedCats = Object.keys(EXPENSES).filter((c) => months.some((m) => m.expenses[c] != null));

  return (
    <div className="md-page">
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="page-header-icon-box"><FileSpreadsheet className="page-header-icon-svg" /></div>
        <div className="page-header-text">
          <h1>Import P&amp;L Data</h1>
          <p>Upload the monthly P&amp;L Excel. Check the preview, then import. Months already saved are replaced.</p>
        </div>
        <div className="md-header-actions">
          <Link href="/pnl-tracker" className="reebok-btn secondary"><ArrowLeft />P&amp;L Tracker</Link>
        </div>
      </div>

      <div className="card pn-drop">
        <Upload />
        <div>
          <strong>{fileName || 'Choose the P&L Excel file'}</strong>
          <p className="md-note">
            One row per month with a <em>Month</em> column, or one column per month (Jul-2026, Aug-2026, …) with line items down the side.
            Recognised lines: Sales, Income Margin, {Object.keys(EXPENSES).join(', ')}, Depreciation, Funds Cost, ROI.
          </p>
        </div>
        <button type="button" className="reebok-btn" onClick={() => inputRef.current?.click()} disabled={saving}>Choose file</button>
        <input ref={inputRef} type="file" accept=".xlsx,.xls" onChange={onFile} hidden />
      </div>

      {readError && <div className="reebok-error">{readError}</div>}

      {parsed && (
        <div className="card">
          <div className="card-header mx-card-head">
            <FileSpreadsheet className="card-header-icon-svg" />
            <h3>Preview · {months.length} month{months.length === 1 ? '' : 's'}{parsed.sheet ? ` from sheet "${parsed.sheet}"` : ''}</h3>
            <div className="mx-card-actions">
              <button type="button" className="reebok-btn secondary" onClick={reset} disabled={saving}>Clear</button>
              <button type="button" className="reebok-btn" onClick={doImport} disabled={saving || months.length === 0 || result?.ok}>
                {saving ? 'Importing...' : `Import ${months.length} month${months.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>

          {parsed.warnings.length > 0 && (
            <div className="md-notice pn-warn">
              <AlertTriangle />
              <div>
                <strong>Check before importing:</strong>
                <ul>{parsed.warnings.slice(0, 12).map((w) => <li key={w}>{w}</li>)}</ul>
                {parsed.warnings.length > 12 && <span>…and {parsed.warnings.length - 12} more.</span>}
              </div>
            </div>
          )}

          {result?.ok && (
            <div className="reebok-send-status success pn-result">
              <CheckCircle2 /> Imported {result.saved.length} month{result.saved.length === 1 ? '' : 's'} ({result.saved.join(', ')}). <Link href="/pnl-tracker" className="mx-link">Open the P&amp;L Tracker</Link>
            </div>
          )}
          {result && !result.ok && <div className="reebok-error">Nothing was imported: {result.error}</div>}

          {months.length > 0 && (
            <div className="md-table-wrap">
              <table className="md-table md-table-compact">
                <thead>
                  <tr>
                    <th>Line</th>{months.map((m) => <th key={m.period_month}>{monthShort(m.period_month)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  <tr><td>Sales (NSV)</td>{months.map((m) => <td key={m.period_month}>{cell(m.gross_sale)}</td>)}</tr>
                  <tr><td>Income margin</td>{months.map((m) => <td key={m.period_month}>{cell(m.income_margin)}</td>)}</tr>
                  {usedCats.map((c) => (
                    <tr key={c}><td className="pn-indent">{c}</td>{months.map((m) => <td key={m.period_month}>{cell(m.expenses[c])}</td>)}</tr>
                  ))}
                  <tr className="pn-row-strong"><td>Total opex</td>{months.map((m) => <td key={m.period_month}>{formatINRFull(opexOf(m))}</td>)}</tr>
                  <tr><td>Depreciation</td>{months.map((m) => <td key={m.period_month}>{cell(m.depreciation)}</td>)}</tr>
                  <tr><td>Funds cost</td>{months.map((m) => <td key={m.period_month}>{cell(m.funds_cost)}</td>)}</tr>
                  <tr><td>ROI</td>{months.map((m) => <td key={m.period_month}>{m.roi == null ? '—' : `${m.roi}%`}</td>)}</tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PnLImportPage() {
  return (
    <RequireAuth roles={['admin']}>
      <PnLImport />
    </RequireAuth>
  );
}
