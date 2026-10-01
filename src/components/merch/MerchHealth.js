'use client';

// Inventory Health tab: how much stock is Healthy / Slow / At Risk / Dead, and how old it is.
// Every barcode is bucketed on its own idle days, then summed upward.

import { useMemo, useState } from 'react';
import { HeartPulse, Hourglass, Layers, ChevronDown, ChevronRight } from 'lucide-react';
import { CardHead, MixBar, MixLegend, ThresholdControl, ExportButton, exportSheets } from './MerchCommon';
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

function Row({ node, expanded, onToggle, valueKey }) {
  const hasKids = node.children.length > 0;
  const open = expanded.has(node.path);
  const total = valueOf(node, valueKey);
  const deadPct = total > 0 ? (bucketValueOf(node.buckets.dead, valueKey) / total) * 100 : null;
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
        <td className="mx-mix-cell"><MixBar buckets={node.buckets} valueKey={valueKey} total={total} /></td>
        {BUCKETS.map((b) => <td key={b.key}>{formatINRFull(bucketValueOf(node.buckets[b.key], valueKey))}</td>)}
        <td className={deadCls(deadPct)}>{formatPercent(deadPct)}</td>
        <td>{formatDays(node.avgAge)}</td>
      </tr>
      {open && node.children.map((c) => <Row key={c.path} node={c} expanded={expanded} onToggle={onToggle} valueKey={valueKey} />)}
    </>
  );
}

export default function MerchHealth({ rows, summary, rateDays, valueKey, thresholds, onThresholds, asOfLabel }) {
  const [expanded, setExpanded] = useState(() => new Set());
  const stockRows = useMemo(() => rows.filter((r) => r.stock_qty > 0), [rows]);
  const tree = useMemo(() => categoryTree(stockRows, thresholds, rateDays, valueKey), [stockRows, thresholds, rateDays, valueKey]);
  const ages = useMemo(() => ageProfile(stockRows), [stockRows]);
  const onToggle = (path) => setExpanded((prev) => {
    const next = new Set(prev);
    next.has(path) ? next.delete(path) : next.add(path);
    return next;
  });

  const total = valueOf(summary, valueKey);
  const ageMax = Math.max(1, ...ages.map((a) => (valueKey === 'cost' ? a.cost : a.mrp)));
  const valueName = valueKey === 'cost' ? 'cost' : 'MRP';

  const doExport = () => {
    const flat = [];
    const walk = (nodes, names) => nodes.forEach((n) => {
      const path = [...names, n.label];
      const row = { Level: ['Division', 'Department', 'Section', 'Article type'][n.depth], Category: path.join(' › '), 'Stock qty': n.stockQty, [`Stock value (${valueName})`]: Math.round(valueOf(n, valueKey)) };
      BUCKETS.forEach((b) => { row[`${b.label} value`] = Math.round(bucketValueOf(n.buckets[b.key], valueKey)); row[`${b.label} qty`] = n.buckets[b.key].qty; });
      row['Avg age (days)'] = n.avgAge == null ? null : Math.round(n.avgAge);
      flat.push(row);
      walk(n.children, path);
    });
    walk(tree, []);
    exportSheets(`merchandiser-health-${asOfLabel}.xlsx`, [
      { name: 'By Category', rows: flat },
      { name: 'Age Profile', rows: ages.map((a) => ({ Age: a.label, 'Stock qty': a.qty, 'Value (MRP)': Math.round(a.mrp), 'Value (cost)': Math.round(a.cost) })) },
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
          const v = bucketValueOf(s, valueKey);
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
          <MixBar buckets={summary.buckets} valueKey={valueKey} total={total} height={18} />
          <MixLegend />
          <table className="md-table md-table-compact mx-mt">
            <thead><tr><th>Bucket</th><th>Units</th><th>Value ({valueName})</th><th>Share</th></tr></thead>
            <tbody>
              {BUCKETS.map((b) => {
                const s = summary.buckets[b.key];
                const v = bucketValueOf(s, valueKey);
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
              const v = valueKey === 'cost' ? a.cost : a.mrp;
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
                  <th>Category</th><th>Stock qty</th><th>Value ({valueName})</th><th>Mix</th>
                  {BUCKETS.map((b) => <th key={b.key}>{b.label}</th>)}
                  <th>Dead %</th><th>Avg age</th>
                </tr>
              </thead>
              <tbody>
                {tree.map((n) => <Row key={n.path} node={n} expanded={expanded} onToggle={onToggle} valueKey={valueKey} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
