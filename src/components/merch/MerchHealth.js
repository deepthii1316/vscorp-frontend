'use client';

// Inventory Health tab: how much stock is Healthy / Slow / At Risk / Dead, and how old it is.
// Every barcode is bucketed on its own idle days, then summed upward.

import { useMemo, useState } from 'react';
import { HeartPulse, Hourglass, Layers, ChevronDown, ChevronRight } from 'lucide-react';
import { CardHead, MixBar, MixLegend, ThresholdControl, ExportButton, exportSheets } from './MerchCommon';
import { SortTh, useSort, sortTree } from '@/components/SortTh';
import {
  BUCKETS, bucketRange, bucketValueOf, valueOf, categoryTree, ageProfile, formatDays,
} from '@/lib/merchShared';
import { formatINRFull, formatNumber, formatPercent } from '@/lib/masterDashboardShared';

function deadCls(pct) {
  if (pct == null) return '';
  if (pct >= 20) return 'mx-bad';
  if (pct >= 10) return 'mx-warn';
  return '';
}

function Row({ node, expanded, onToggle }) {
  const hasKids = node.children.length > 0;
  const open = expanded.has(node.path);
  const total = valueOf(node);
  const deadPct = total > 0 ? (bucketValueOf(node.buckets.dead) / total) * 100 : null;
  return (
    <>
      <tr className={`md-drill-row${hasKids ? ' has-children' : ''}`} data-depth={Math.min(node.depth, 3)}
        onClick={hasKids ? () => onToggle(node.path) : undefined}>
        <td>
          <span className="md-drill-label" style={{ paddingLeft: node.depth * 14 }}>
            {hasKids ? <span className="md-drill-chevron">{open ? <ChevronDown /> : <ChevronRight />}</span> : <span className="md-drill-spacer" />}
            {node.label}
          </span>
        </td>
        <td>{formatNumber(node.stockQty)}</td>
        <td>{formatINRFull(total)}</td>
        <td className="mx-mix-cell"><MixBar buckets={node.buckets} total={total} /></td>
        {BUCKETS.map((b) => <td key={b.key}>{formatINRFull(bucketValueOf(node.buckets[b.key]))}</td>)}
        <td className={deadCls(deadPct)}>{formatPercent(deadPct)}</td>
        <td>{formatDays(node.avgAge)}</td>
      </tr>
      {open && node.children.map((c) => <Row key={c.path} node={c} expanded={expanded} onToggle={onToggle} />)}
    </>
  );
}

export default function MerchHealth({ rows, summary, rateDays, thresholds, onThresholds, asOfLabel }) {
  const [expanded, setExpanded] = useState(() => new Set());
  const stockRows = useMemo(() => rows.filter((r) => r.stock_qty > 0), [rows]);
  const tree = useMemo(() => categoryTree(stockRows, thresholds, rateDays), [stockRows, thresholds, rateDays]);
  const ages = useMemo(() => ageProfile(stockRows), [stockRows]);
  const onToggle = (path) => setExpanded((prev) => {
    const next = new Set(prev);
    next.has(path) ? next.delete(path) : next.add(path);
    return next;
  });

  const total = valueOf(summary);
  const ageMax = Math.max(1, ...ages.map((a) => a.mrp));

  // Sorting. Category table: every level follows the chosen column. Health mix: the four buckets.
  const cat = useSort({ textKeys: ['label'] });
  const catValue = (n, k) => {
    if (k === 'value') return valueOf(n);
    if (k === 'deadPct') { const v = valueOf(n); return v > 0 ? (bucketValueOf(n.buckets.dead) / v) * 100 : null; }
    if (n.buckets[k]) return bucketValueOf(n.buckets[k]);
    return n[k];
  };
  const treeView = useMemo(() => sortTree(tree, cat.sort, catValue), [tree, cat.sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const cth = (k, label) => <SortTh k={k} label={label} sort={cat.sort} onSort={cat.onSort} />;
  const mix = useSort({ textKeys: ['label'] });
  const mixRows = BUCKETS.map((b) => ({ ...b, qty: summary.buckets[b.key].qty, value: bucketValueOf(summary.buckets[b.key]) }));
  const mth = (k, label) => <SortTh k={k} label={label} sort={mix.sort} onSort={mix.onSort} />;
  const valueName = 'MRP';

  const doExport = () => {
    const flat = [];
    const walk = (nodes, names) => nodes.forEach((n) => {
      const path = [...names, n.label];
      const row = { Level: ['Division', 'Department', 'Section', 'Article type'][n.depth], Category: path.join(' › '), 'Stock qty': n.stockQty, [`Stock value (${valueName})`]: Math.round(valueOf(n)) };
      BUCKETS.forEach((b) => { row[`${b.label} value`] = Math.round(bucketValueOf(n.buckets[b.key])); row[`${b.label} qty`] = n.buckets[b.key].qty; });
      row['Avg age (days)'] = n.avgAge == null ? null : Math.round(n.avgAge);
      flat.push(row);
      walk(n.children, path);
    });
    walk(tree, []);
    exportSheets(`merch-health-${asOfLabel}.xlsx`, [
      { name: 'By Category', rows: flat },
      { name: 'Age Profile', rows: ages.map((a) => ({ Age: a.label, 'Stock qty': a.qty, 'Value (MRP)': Math.round(a.mrp) })) },
      { name: 'Thresholds', rows: BUCKETS.map((b) => ({ Bucket: b.label, Rule: bucketRange(b.key, thresholds) })) },
    ]);
  };

  return (
    <>
      <div className="card mx-toolbar">
        <ThresholdControl value={thresholds} onApply={onThresholds} />
        <span className="md-note mx-inline-note">Idle days = days since the later of the last sale and the last inward.</span>
      </div>

      <div className="mx-buckets">
        {BUCKETS.map((b) => {
          const s = summary.buckets[b.key];
          const v = bucketValueOf(s);
          return (
            <div key={b.key} className="card md-kpi mx-bucket" style={{ borderTopColor: b.color }}>
              <div className="md-kpi-top"><span className="md-label">{b.label}</span><span className="mx-bucket-rule">{bucketRange(b.key, thresholds)}</span></div>
              <div className="md-kpi-value">{formatINRFull(v)}</div>
              <div className="md-kpi-foot">{formatPercent(total > 0 ? (v / total) * 100 : null)} of stock value · {formatNumber(s.qty)} units · {formatNumber(s.lines)} barcodes</div>
            </div>
          );
        })}
      </div>

      <div className="md-row md-row-even">
        <div className="card">
          <CardHead icon={HeartPulse} title="Health mix" />
          <MixBar buckets={summary.buckets} total={total} height={18} />
          <MixLegend />
          <table className="md-table md-table-compact mx-mt">
            <thead><tr>{mth('label', 'Bucket')}{mth('qty', 'Units')}{mth('value', `Value (${valueName})`)}{mth('value', 'Share')}</tr></thead>
            <tbody>
              {mix.sorted(mixRows).map((b) => {
                const s = summary.buckets[b.key];
                const v = bucketValueOf(s);
                return (
                  <tr key={b.key}>
                    <td><span className="md-dot" style={{ background: b.color }} />{b.label}</td>
                    <td>{formatNumber(s.qty)}</td><td>{formatINRFull(v)}</td><td>{formatPercent(total > 0 ? (v / total) * 100 : null)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="card">
          <CardHead icon={Hourglass} title="Age profile" />
          <p className="md-note">Days since the last inward. Average age {formatDays(summary.avgAge)} (unit-weighted).</p>
          <div className="mx-hbars">
            {ages.map((a) => {
              const v = a.mrp;
              return (
                <div key={a.key} className="mx-hbar-row" title={`${a.label}: ${formatNumber(a.qty)} units, ${formatINRFull(v)}`}>
                  <span>{a.label}</span>
                  <div><i style={{ width: `${(v / ageMax) * 100}%` }} /></div>
                  <strong>{formatINRFull(v)}</strong>
                  <em>{formatNumber(a.qty)} u</em>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="card">
        <CardHead icon={Layers} title="Health by category">
          <ExportButton onClick={doExport} disabled={!tree.length} />
        </CardHead>
        <p className="md-note">
          Every barcode is judged on its own idle days, then summed upward. A mostly-healthy category can still hide
          dead barcodes, so check Dead Stock for the actual list. Dead % is red at 20% or more, amber at 10% or more.
        </p>
        {tree.length === 0 ? <div className="md-empty">No stock for this selection.</div> : (
          <div className="md-table-wrap">
            <table className="md-table md-drill">
              <thead>
                <tr>
                  {cth('label', 'Category')}{cth('stockQty', 'Stock qty')}{cth('value', `Value (${valueName})`)}<th>Mix</th>
                  {BUCKETS.map((b) => <SortTh key={b.key} k={b.key} label={b.label} sort={cat.sort} onSort={cat.onSort} />)}
                  {cth('deadPct', 'Dead %')}{cth('avgAge', 'Avg age')}
                </tr>
              </thead>
              <tbody>
                {treeView.map((n) => <Row key={n.path} node={n} expanded={expanded} onToggle={onToggle} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
