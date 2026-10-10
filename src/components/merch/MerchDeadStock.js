'use client';

// Dead Stock tab: the barcode list behind Inventory Health's Dead bucket (same rows, same
// idle-day rule, so the two tabs can never disagree), optionally widened to At Risk.

import { useEffect, useMemo, useState } from 'react';
import { Skull, Search } from 'lucide-react';
import { CardHead, ThresholdControl, ExportButton, exportSheets, Pager, SortTh, nextSort, sortRows } from './MerchCommon';
import { bucketOf, bucketRange, BUCKET_BY_KEY, cleanName, divisionLabel, shortDate, formatDays } from '@/lib/merchShared';
import { formatINRFull, formatNumber } from '@/lib/masterDashboardShared';

const PAGE = 50;

export default function MerchDeadStock({ rows, thresholds, onThresholds, onLookup, asOfLabel }) {
  const [scope, setScope] = useState('dead');          // 'dead' | 'risk' (= At Risk + Dead)
  const [q, setQ] = useState('');
  const [sort, setSort] = useState({ key: 'value', dir: 'desc' });
  const [page, setPage] = useState(0);

  const list = useMemo(() => rows
    .map((r) => ({ ...r, bucket: bucketOf(r, thresholds), name: cleanName(r.article_name, r.size), value: r.stock_mrp_value }))
    .filter((r) => r.bucket === 'dead' || (scope === 'risk' && r.bucket === 'risk')), [rows, thresholds, scope]);

  const filtered = useMemo(() => {
    const s = q.trim().toUpperCase();
    const hits = s ? list.filter((r) => [r.barcode, r.name, r.style_code, r.article_type].some((v) => String(v || '').toUpperCase().includes(s))) : list;
    return sortRows(hits, sort);
  }, [list, q, sort]);

  useEffect(() => { setPage(0); }, [q, sort, scope, thresholds, rows]);

  const totals = filtered.reduce((t, r) => ({ qty: t.qty + r.stock_qty, value: t.value + r.value }), { qty: 0, value: 0 });
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const view = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const onSort = (k) => setSort((s) => nextSort(s, k, k === 'name' ? 'asc' : 'desc'));
  const th = (k, label, title) => <SortTh k={k} label={label} sort={sort} onSort={onSort} title={title} />;

  const doExport = () => {
    const lines = filtered.map((r) => ({
      Barcode: r.barcode, Article: r.name, 'Style code': r.style_code, Size: r.size,
      Division: divisionLabel(r.division), Department: r.department, Section: r.section, 'Article type': r.article_type,
      Bucket: BUCKET_BY_KEY[r.bucket].label, 'Stock qty': r.stock_qty, MRP: r.mrp,
      'Stock value (MRP)': Math.round(r.stock_mrp_value),
      'Last inward': r.last_inward_date, 'Age (days)': r.age_days, 'Last sale': r.last_sale_date || 'Never', 'Idle (days)': r.idle_days,
    }));
    const byType = new Map();
    filtered.forEach((r) => {
      const k = `${divisionLabel(r.division)} › ${r.department} › ${r.article_type}`;
      const t = byType.get(k) || { Category: k, Barcodes: 0, 'Stock qty': 0, 'Value (MRP)': 0 };
      t.Barcodes += 1; t['Stock qty'] += r.stock_qty; t['Value (MRP)'] += Math.round(r.stock_mrp_value);
      byType.set(k, t);
    });
    exportSheets(`merch-dead-stock-${asOfLabel}.xlsx`, [
      { name: 'Dead Stock', rows: lines },
      { name: 'By Category', rows: [...byType.values()].sort((a, b) => b['Value (MRP)'] - a['Value (MRP)']) },
    ]);
  };

  return (
    <>
      <div className="card mx-toolbar">
        <ThresholdControl value={thresholds} onApply={onThresholds} />
        <div className="md-seg" role="group" aria-label="Which buckets">
          <button type="button" className={scope === 'dead' ? 'active' : ''} onClick={() => setScope('dead')}>Dead</button>
          <button type="button" className={scope === 'risk' ? 'active' : ''} onClick={() => setScope('risk')}>Dead + At risk</button>
        </div>
      </div>

      <div className="card">
        <CardHead icon={Skull} title={scope === 'dead' ? `Dead stock (${bucketRange('dead', thresholds)})` : `Dead and at-risk stock (${thresholds.risk}+ days idle)`}>
          <ExportButton onClick={doExport} disabled={!filtered.length} />
        </CardHead>
        <div className="mx-list-head">
          <label className="mx-search">
            <Search />
            <input type="search" placeholder="Search barcode, article, style, type" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <span className="mx-list-total">
            <strong>{formatNumber(filtered.length)}</strong> barcodes · <strong>{formatNumber(totals.qty)}</strong> units · <strong>{formatINRFull(totals.value)}</strong> at MRP
          </span>
        </div>
        {filtered.length === 0 ? (
          <div className="md-empty">No barcodes have been idle for {scope === 'dead' ? thresholds.dead : thresholds.risk}+ days in this selection.</div>
        ) : (
          <>
            <div className="md-table-wrap">
              <table className="md-table md-table-compact">
                <thead>
                  <tr>
                    {th('name', 'Article')}{th('barcode', 'Barcode')}<th>Size</th><th>Category</th>
                    {th('stock_qty', 'Stock qty')}{th('value', 'Value (MRP)')}
                    {th('age_days', 'Age', 'Days since the last inward')}{th('last_sale_date', 'Last sale')}
                    {th('idle_days', 'Idle', 'Days since the later of last sale / last inward')}<th>Bucket</th>
                  </tr>
                </thead>
                <tbody>
                  {view.map((r) => (
                    <tr key={r.barcode}>
                      <td className="mx-name" title={r.article_name}>{r.name}</td>
                      <td><button type="button" className="mx-link" onClick={() => onLookup(r.barcode)}>{r.barcode}</button></td>
                      <td>{r.size || '—'}</td>
                      <td className="mx-cat">{divisionLabel(r.division)} › {r.department} › {r.article_type}</td>
                      <td>{formatNumber(r.stock_qty)}</td>
                      <td>{formatINRFull(r.value)}</td>
                      <td>{formatDays(r.age_days)}</td>
                      <td>{r.last_sale_date ? shortDate(r.last_sale_date) : 'Never'}</td>
                      <td>{formatDays(r.idle_days)}</td>
                      <td><span className="mx-chip" style={{ '--chip': BUCKET_BY_KEY[r.bucket].color }}>{BUCKET_BY_KEY[r.bucket].label}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={page} pages={pages} total={filtered.length} onPage={setPage} />
          </>
        )}
      </div>
    </>
  );
}
