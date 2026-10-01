'use client';

// Small building blocks shared by the Merch Dashboard tabs.

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { BUCKETS, bucketValueOf, clampThresholds } from '@/lib/merchShared';
import { formatINRFull, formatNumber, formatPercent } from '@/lib/masterDashboardShared';

export function Kpi({ label, icon: Icon, value, foot, title }) {
  return (
    <div className="card md-kpi" title={title}>
      <div className="md-kpi-top">
        <span className="md-label">{label}</span>
        {Icon && <Icon />}
      </div>
      <div className="md-kpi-value">{value}</div>
      {foot && <div className="md-kpi-foot">{foot}</div>}
    </div>
  );
}

export function CardHead({ icon: Icon, title, children }) {
  return (
    <div className="card-header mx-card-head">
      {Icon && <Icon className="card-header-icon-svg" />}
      <h3>{title}</h3>
      {children && <div className="mx-card-actions">{children}</div>}
    </div>
  );
}

/**
 * Stacked bar of the four health buckets for one row. Segments are separated by a 2px gap;
 * each has a hover tooltip (bucket, value, share) so colour is never the only carrier.
 */
export function MixBar({ buckets, total, height = 10 }) {
  if (!(total > 0)) return <div className="mx-mix mx-mix-empty" style={{ height }} />;
  return (
    <div className="mx-mix" style={{ height }} role="img"
      aria-label={BUCKETS.map((b) => `${b.label} ${formatPercent((bucketValueOf(buckets[b.key]) / total) * 100)}`).join(', ')}>
      {BUCKETS.map((b) => {
        const v = bucketValueOf(buckets[b.key]);
        if (!(v > 0)) return null;
        const pct = (v / total) * 100;
        return (
          <span key={b.key} style={{ width: `${pct}%`, background: b.color }}
            title={`${b.label}: ${formatINRFull(v)} (${formatPercent(pct)}), ${formatNumber(buckets[b.key].qty)} units`} />
        );
      })}
    </div>
  );
}

export function MixLegend() {
  return (
    <div className="md-legend mx-legend">
      {BUCKETS.map((b) => <span key={b.key}><span className="md-dot" style={{ background: b.color }} />{b.label}</span>)}
    </div>
  );
}

/** Slow / At Risk / Dead day counts: edited as a draft, applied with the button. */
export function ThresholdControl({ value, onApply }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  const changed = draft.slow !== value.slow || draft.risk !== value.risk || draft.dead !== value.dead;
  const field = (key, label) => (
    <label className="md-filter-item">
      <span className="md-label">{label}</span>
      <input type="number" min={1} max={365} className="md-date mx-num" value={draft[key]}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value === '' ? '' : +e.target.value })} />
    </label>
  );
  return (
    <div className="mx-thresholds">
      <span className="md-label">Idle days ≥</span>
      {field('slow', 'Slow')}
      {field('risk', 'At risk')}
      {field('dead', 'Dead')}
      <button type="button" className="md-apply" disabled={!changed} onClick={() => onApply(clampThresholds(draft))}>Apply</button>
    </div>
  );
}

/** Client-side Excel export: sheets = [{ name, rows: [{ column: value }] }]. */
export async function exportSheets(filename, sheets) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  sheets.forEach(({ name, rows }) => {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: 'No rows for this selection' }]), name.slice(0, 31));
  });
  XLSX.writeFile(wb, filename);
}

export function ExportButton({ onClick, disabled }) {
  return (
    <button type="button" className="reebok-btn secondary mx-btn-sm" onClick={onClick} disabled={disabled}>
      <Download />Excel
    </button>
  );
}

/** 50-rows-per-page pager. */
export function Pager({ page, pages, total, onPage }) {
  if (pages <= 1) return <div className="mx-pager"><span>{formatNumber(total)} rows</span></div>;
  return (
    <div className="mx-pager">
      <span>{formatNumber(total)} rows · page {page + 1} of {pages}</span>
      <button type="button" className="reebok-btn secondary mx-btn-sm" disabled={page === 0} onClick={() => onPage(page - 1)}>Previous</button>
      <button type="button" className="reebok-btn secondary mx-btn-sm" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>Next</button>
    </div>
  );
}

/** Sortable table header cell. sort = { key, dir }. */
export function SortTh({ k, label, sort, onSort, title }) {
  const active = sort.key === k;
  return (
    <th className={`mx-sort${active ? ' active' : ''}`} onClick={() => onSort(k)} title={title}
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      {label}{active ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  );
}

export function nextSort(sort, key, defaultDir = 'desc') {
  return sort.key === key ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: defaultDir };
}

export function sortRows(rows, sort, get = (r, k) => r[k]) {
  const dir = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = get(a, sort.key), y = get(b, sort.key);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return (typeof x === 'string' ? x.localeCompare(y) : x - y) * dir;
  });
}
