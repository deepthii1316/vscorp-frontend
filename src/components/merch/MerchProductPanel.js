'use client';

// Barcode lookup drawer: everything about one EAN — identity, stock, health, sell-through, and
// every sales line / stock snapshot. Opened from the header search box or any barcode link.

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import {
  bucketOf, BUCKET_BY_KEY, cleanName, divisionLabel, sellThrough, coverDays, shortDate, formatDays, COVER_TIP,
} from '@/lib/merchShared';
import { formatINRFull, formatNumber, formatPercent } from '@/lib/masterDashboardShared';

function Fact({ label, value, title }) {
  return <div className="mx-fact" title={title}><span className="md-label">{label}</span><strong>{value}</strong></div>;
}

export default function MerchProductPanel({ barcode, row, thresholds, rateDays, onClose }) {
  const [hist, setHist] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setHist(null); setError(null);
    (async () => {
      try {
        const res = await apiFetch(`/api/merchandiser/product?barcode=${encodeURIComponent(barcode)}`);
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
        if (!cancelled) setHist(json);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();
    return () => { cancelled = true; };
  }, [barcode]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const sales = hist?.sales || [];
  const notFound = hist && !row && sales.length === 0 && hist.stock.length === 0;
  const bucket = row ? bucketOf(row, thresholds) : null;
  const soldTotal = sales.reduce((s, r) => s + (r.qty || 0), 0);
  const nsvTotal = sales.reduce((s, r) => s + (r.nsv || 0), 0);

  return (
    <div className="mx-overlay" onClick={onClose}>
      <aside className="mx-drawer card" role="dialog" aria-label={`Barcode ${barcode}`} onClick={(e) => e.stopPropagation()}>
        <div className="mx-drawer-head">
          <div>
            <span className="md-label">Barcode {barcode}</span>
            <h2>{row ? cleanName(row.article_name, row.size) : sales[0] ? 'Not in current stock' : '…'}</h2>
            {row && <p>{divisionLabel(row.division)} › {row.department} › {row.section} › {row.article_type}{row.style_code ? ` · Style ${row.style_code}` : ''}{row.size ? ` · Size ${row.size}` : ''}{row.color ? ` · ${row.color}` : ''}</p>}
          </div>
          <button type="button" className="mx-close" onClick={onClose} aria-label="Close"><X /></button>
        </div>

        {error && <div className="reebok-error">Could not load this barcode: {error}</div>}
        {!hist && !error && <div className="md-empty">Loading…</div>}
        {notFound && <div className="md-empty">No stock or sales found for barcode {barcode}. Check the number (EAN on the tag).</div>}

        {row && (
          <div className="mx-facts">
            <Fact label="Stock now" value={formatNumber(row.stock_qty)} />
            <Fact label="MRP" value={row.mrp ? formatINRFull(row.mrp) : '—'} />
            <Fact label="Stock value (MRP)" value={formatINRFull(row.stock_mrp_value)} />
            <Fact label="Stock value (cost)" value={formatINRFull(row.stock_cost_value)} />
            <Fact label="Last inward" value={shortDate(row.last_inward_date)} />
            <Fact label="Age" value={formatDays(row.age_days)} title="Days since the last inward" />
            <Fact label="Last sale" value={row.last_sale_date ? shortDate(row.last_sale_date) : 'Never'} />
            <Fact label="Idle" value={formatDays(row.idle_days)} title="Days since the later of last sale / last inward" />
            <Fact label="Health" value={bucket ? BUCKET_BY_KEY[bucket].label : row.stock_qty > 0 ? '—' : 'Sold out'} />
            <Fact label="Sold 30d" value={formatNumber(row.sales_qty_30d)} />
            <Fact label="Sell-thru 30d" value={formatPercent(sellThrough(row.sales_qty_30d, row.stock_qty))} />
            <Fact label="Cover" value={formatDays(coverDays(row.stock_qty, row.sales_qty_rate, rateDays))} title={COVER_TIP} />
          </div>
        )}

        {hist && sales.length > 0 && (
          <>
            <h3 className="mx-drawer-h3">Sales ({formatNumber(soldTotal)} units, {formatINRFull(nsvTotal)} NSV)</h3>
            <div className="md-table-wrap">
              <table className="md-table md-table-compact">
                <thead><tr><th>Date</th><th>Bill</th><th>Salesperson</th><th>Qty</th><th>MRP</th><th>NSV</th></tr></thead>
                <tbody>
                  {sales.map((r, i) => (
                    <tr key={`${r.bill_no}-${i}`} className={r.qty < 0 ? 'md-warn-row' : ''}>
                      <td>{shortDate(r.full_date)}</td><td>{r.bill_no}</td><td>{r.salesperson || '—'}</td>
                      <td>{formatNumber(r.qty)}{r.qty < 0 ? ' (return)' : ''}</td><td>{formatINRFull(r.mrp)}</td><td>{formatINRFull(r.nsv)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {hist && sales.length === 0 && row && <p className="md-note mx-drawer-h3">No sales recorded for this barcode since the store opened.</p>}

        {hist && hist.stock.length > 0 && (
          <>
            <h3 className="mx-drawer-h3">Stock snapshots</h3>
            <div className="md-table-wrap">
              <table className="md-table md-table-compact">
                <thead><tr><th>Stock date</th><th>Qty</th><th>Last inward</th></tr></thead>
                <tbody>
                  {hist.stock.map((r) => (
                    <tr key={r.full_date}><td>{shortDate(r.full_date)}</td><td>{formatNumber(r.stock_qty)}</td><td>{shortDate(r.inward_date)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
