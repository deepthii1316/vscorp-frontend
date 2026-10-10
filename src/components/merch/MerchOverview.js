'use client';

// Overview tab: stock right now + MTD / 30-day sales by Division › Department › Section › Article type.

import { useMemo, useState } from 'react';
import { Package, IndianRupee, ShoppingBag, Receipt, Percent, CalendarClock, Layers, ChevronDown, ChevronRight } from 'lucide-react';
import { Kpi, CardHead, ExportButton, exportSheets } from './MerchCommon';
import { categoryTree, valueOf, COVER_TIP, formatDays } from '@/lib/merchShared';
import { formatINRFull, formatNumber, formatPercent } from '@/lib/masterDashboardShared';

function stCls(v, stock) {
  if (v == null) return '';
  if (v >= 60) return 'mx-good';
  if (v < 15 && stock > 0) return 'mx-bad';
  return '';
}

function Row({ node, expanded, onToggle, total }) {
  const hasKids = node.children.length > 0;
  const open = expanded.has(node.path);
  const value = valueOf(node);
  const share = total > 0 ? (value / total) * 100 : 0;
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
        <td>{formatINRFull(value)}</td>
        <td className="md-contrib-cell">
          <div className="md-contrib-bar">
            <div className="md-contrib-track"><div className="md-contrib-fill" style={{ width: `${Math.min(100, share)}%` }} /></div>
            <span className="md-contrib-pct">{formatPercent(share)}</span>
          </div>
        </td>
        <td>{formatNumber(node.qtyMtd)}</td>
        <td>{formatINRFull(node.nsvMtd)}</td>
        <td>{formatNumber(node.qty30)}</td>
        <td className={stCls(node.sellThrough, node.stockQty)}>{formatPercent(node.sellThrough)}</td>
        <td>{formatDays(node.cover)}</td>
      </tr>
      {open && node.children.map((c) => (
        <Row key={c.path} node={c} expanded={expanded} onToggle={onToggle} total={total} />
      ))}
    </>
  );
}

export default function MerchOverview({ rows, summary, rateDays, asOfLabel }) {
  const [expanded, setExpanded] = useState(() => new Set());
  const tree = useMemo(() => categoryTree(rows, null, rateDays), [rows, rateDays]);
  const onToggle = (path) => setExpanded((prev) => {
    const next = new Set(prev);
    next.has(path) ? next.delete(path) : next.add(path);
    return next;
  });
  const total = valueOf(summary);
  const valueName = 'Stock value (MRP)';

  const doExport = () => {
    const flat = [];
    const walk = (nodes, names) => nodes.forEach((n) => {
      const path = [...names, n.label];
      if (n.depth === 3) {
        flat.push({
          Division: path[0], Department: path[1], Section: path[2], 'Article type': path[3],
          'Stock qty': n.stockQty, 'Stock value (MRP)': Math.round(n.mrpValue),
          'Sales qty MTD': n.qtyMtd, 'NSV MTD': Math.round(n.nsvMtd), 'Sales qty 30d': n.qty30,
          'Sell-through 30d %': n.sellThrough == null ? null : +n.sellThrough.toFixed(1),
          'Cover (days)': n.cover == null ? null : Math.round(n.cover),
        });
      }
      walk(n.children, path);
    });
    walk(tree, []);
    exportSheets(`merch-overview-${asOfLabel}.xlsx`, [
      { name: 'By Division', rows: tree.map((n) => ({ Division: n.label, 'Stock qty': n.stockQty, 'Stock value (MRP)': Math.round(n.mrpValue), 'Sales qty MTD': n.qtyMtd, 'NSV MTD': Math.round(n.nsvMtd), 'Sales qty 30d': n.qty30, 'Sell-through 30d %': n.sellThrough == null ? null : +n.sellThrough.toFixed(1), 'Cover (days)': n.cover == null ? null : Math.round(n.cover) })) },
      { name: 'Detail', rows: flat },
    ]);
  };

  return (
    <>
      <div className="md-kpis">
        <Kpi label="Stock units" icon={Package} value={formatNumber(summary.stockQty)} foot={`${formatNumber(summary.stockLines)} barcodes in stock`} />
        <Kpi label={valueName} icon={IndianRupee} value={formatINRFull(total)} foot="Stock qty × MRP" />
        <Kpi label="Sales units MTD" icon={ShoppingBag} value={formatNumber(summary.qtyMtd)} foot={`${formatNumber(summary.qty30)} in last 30 days`} />
        <Kpi label="NSV MTD" icon={Receipt} value={formatINRFull(summary.nsvMtd)} foot="Taxable amount" />
        <Kpi label="Sell-through 30d" icon={Percent} value={formatPercent(summary.sellThrough)} foot="Sold ÷ (sold + on hand)"
          title="Units sold in the last 30 days ÷ (those units + stock on hand now)" />
        <Kpi label="Stock cover" icon={CalendarClock} value={formatDays(summary.cover)} foot="Days of stock at current rate" title={COVER_TIP} />
      </div>

      <div className="card">
        <CardHead icon={Layers} title="Stock and sales by category">
          <ExportButton onClick={doExport} disabled={!tree.length} />
        </CardHead>
        <p className="md-note">
          Division › Department › Section › Article type, largest stock value first. Click a row with a › to expand it.
          Sell-through uses the last 30 days (MTD reads too low early in the month). Cover: {COVER_TIP.toLowerCase()}.
        </p>
        {tree.length === 0 ? <div className="md-empty">No stock or sales for this selection.</div> : (
          <div className="md-table-wrap">
            <table className="md-table md-drill">
              <thead>
                <tr>
                  <th>Category</th><th>Stock qty</th><th>{valueName}</th><th>Share</th>
                  <th>Sales qty MTD</th><th>NSV MTD</th><th>Sales qty 30d</th><th>Sell-thru 30d</th>
                  <th title={COVER_TIP}>Cover</th>
                </tr>
              </thead>
              <tbody>
                {tree.map((n) => <Row key={n.path} node={n} expanded={expanded} onToggle={onToggle} total={total} />)}
                <tr className="md-total-row">
                  <td>Total</td>
                  <td>{formatNumber(summary.stockQty)}</td>
                  <td>{formatINRFull(total)}</td>
                  <td>100.0%</td>
                  <td>{formatNumber(summary.qtyMtd)}</td>
                  <td>{formatINRFull(summary.nsvMtd)}</td>
                  <td>{formatNumber(summary.qty30)}</td>
                  <td>{formatPercent(summary.sellThrough)}</td>
                  <td>{formatDays(summary.cover)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

