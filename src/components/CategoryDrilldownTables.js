'use client';

// Category Drill-down tab: two stacked, click-to-expand tree tables — same
// interaction as the Skechers / VS Corp Master Dashboard's category
// drill-down (collapsed by default, click a row with children to expand it,
// contribution shown as a bar not just a number). Data is prepared by
// src/lib/categoryDrilldownShared.js; nothing is calculated here.

import { useState } from 'react';
import { Layers, Package, ChevronDown, ChevronRight } from 'lucide-react';
import { formatINRFull, formatNumber, formatPercent } from '@/lib/masterDashboardShared';
import { pctCls, pctStr } from '@/lib/categoryDrilldownShared';

function ContribCell({ value }) {
  const pct = value === null || value === undefined ? 0 : Math.max(0, Math.min(100, value));
  return (
    <td className="md-contrib-cell">
      <div className="md-contrib-bar">
        <div className="md-contrib-track"><div className="md-contrib-fill" style={{ width: `${pct}%` }} /></div>
        <span className="md-contrib-pct">{formatPercent(value)}</span>
      </div>
    </td>
  );
}

/** One row + (if expanded) its children, recursively. */
function DrillRow({ node, expanded, onToggle }) {
  const hasKids = node.children.length > 0;
  const open = expanded.has(node.path);
  return (
    <>
      <tr
        className={`md-drill-row${hasKids ? ' has-children' : ''}`}
        data-depth={Math.min(node.depth, 3)}
        onClick={hasKids ? () => onToggle(node.path) : undefined}
      >
        <td>
          <span className="md-drill-label">
            {hasKids
              ? <span className="md-drill-chevron">{open ? <ChevronDown /> : <ChevronRight />}</span>
              : <span className="md-drill-spacer" />}
            {node.label}
          </span>
        </td>
        <td>{formatNumber(node.qty)}</td>
        <td className="md-drill-prev">{node.prevQty === null ? '—' : formatNumber(node.prevQty)}</td>
        <td><span className={`md-delta ${pctCls(node.qtyGrowth)}`}>{pctStr(node.qtyGrowth)}</span></td>
        <td>{formatINRFull(node.nsv)}</td>
        <td className="md-drill-prev">{node.prevNsv === null ? '—' : formatINRFull(node.prevNsv)}</td>
        <td><span className={`md-delta ${pctCls(node.nsvGrowth)}`}>{pctStr(node.nsvGrowth)}</span></td>
        <ContribCell value={node.contribution} />
        <td className="md-drill-mdpct">{formatPercent(node.mdPct)}</td>
      </tr>
      {open && hasKids && node.children.map((child) => (
        <DrillRow key={child.path} node={child} expanded={expanded} onToggle={onToggle} />
      ))}
    </>
  );
}

function DrillTable({ title, icon: Icon, note, tree, compareLabel }) {
  const [expanded, setExpanded] = useState(() => new Set());
  const onToggle = (path) => setExpanded((prev) => {
    const next = new Set(prev);
    next.has(path) ? next.delete(path) : next.add(path);
    return next;
  });

  const grand = tree.reduce((t, r) => ({
    qty: t.qty + r.qty, prevQty: t.prevQty + (r.prevQty || 0),
    nsv: t.nsv + r.nsv, prevNsv: t.prevNsv + (r.prevNsv || 0),
    mrp: t.mrp + r.mrp,
  }), { qty: 0, prevQty: 0, nsv: 0, prevNsv: 0, mrp: 0 });
  const grandMdPct = grand.mrp > 0 ? ((grand.mrp - grand.nsv) / grand.mrp) * 100 : null;
  const grandNsvGrowth = grand.prevNsv > 0 ? (grand.nsv / grand.prevNsv - 1) * 100 : null;
  const grandQtyGrowth = grand.prevQty > 0 ? (grand.qty / grand.prevQty - 1) * 100 : null;

  return (
    <div className="card">
      <div className="card-header">
        <Icon className="card-header-icon-svg" />
        <h3>{title}</h3>
      </div>
      {note && <p className="md-note">{note} Click a row with a {'›'} to expand it.</p>}
      {tree.length === 0 ? (
        <div className="md-empty">No data for this selection.</div>
      ) : (
        <div className="md-table-wrap">
          <table className="md-table md-drill">
            <thead>
              <tr>
                <th>Category</th><th>Qty</th><th>{compareLabel} Qty</th><th>Qty growth</th>
                <th>RSV</th><th>{compareLabel} RSV</th><th>RSV growth</th><th>Contribution</th><th>MD %</th>
              </tr>
            </thead>
            <tbody>
              {tree.map((node) => (
                <DrillRow key={node.path} node={node} expanded={expanded} onToggle={onToggle} />
              ))}
              <tr className="md-total-row">
                <td>Total</td>
                <td>{formatNumber(grand.qty)}</td>
                <td>{formatNumber(grand.prevQty)}</td>
                <td><span className={`md-delta ${pctCls(grandQtyGrowth)}`}>{pctStr(grandQtyGrowth)}</span></td>
                <td>{formatINRFull(grand.nsv)}</td>
                <td>{formatINRFull(grand.prevNsv)}</td>
                <td><span className={`md-delta ${pctCls(grandNsvGrowth)}`}>{pctStr(grandNsvGrowth)}</span></td>
                <td>100.0%</td>
                <td>{formatPercent(grandMdPct)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function CategoryDrilldownTables({ categoryTree, footwearTree, compareLabel = 'last month' }) {
  return (
    <>
      <DrillTable
        title="Category drill-down"
        icon={Layers}
        note="Division › Section › Article Type. RSV = Taxable Amount (NSV). MD % = (MRP - RSV) / MRP."
        tree={categoryTree}
        compareLabel={compareLabel}
      />
      <DrillTable
        title="Footwear — by Department"
        icon={Package}
        note="Closed footwear (Shoes) vs Open footwear (sandals, sliders, socks, ...) › Department › Section."
        tree={footwearTree}
        compareLabel={compareLabel}
      />
    </>
  );
}
