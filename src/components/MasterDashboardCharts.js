'use client';

// Chart cards for the Master Dashboard Overview tab (Recharts + small inline SVG sparklines).
// All values are prepared by src/lib/masterDashboardShared.js; nothing is calculated here.

import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, BarChart, Bar,
} from 'recharts';
import { ChartLine, ChartPie, CreditCard, ChartColumn, Table2 } from 'lucide-react';
import {
  CHART_COLORS, DIVISION_COLORS, TREND_METRICS,
  formatINR, formatINRFull, formatNumber, formatPercent,
} from '@/lib/masterDashboardShared';

const UNCLASSIFIED_COLOR = 'var(--chart-neutral)';

function formatBy(kind, value, compact = false) {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  if (kind === 'inr') return compact ? formatINR(value) : formatINRFull(value);
  if (kind === 'pct') return formatPercent(value);
  return formatNumber(value);
}

const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

function Empty({ children }) {
  return <div className="md-empty">{children}</div>;
}

// ─── KPI sparkline ─────────────────────────────────────────────────────────

export function Sparkline({ values }) {
  const v = (values || []).filter((x) => x !== null && x !== undefined && !Number.isNaN(x));
  if (v.length < 2) return <div className="md-spark" />;
  const w = 120, h = 26, min = Math.min(...v), max = Math.max(...v), range = max - min || 1;
  const pts = v.map((x, i) => `${(i / (v.length - 1)) * w},${h - 3 - ((x - min) / range) * (h - 6)}`).join(' ');
  return (
    <svg className="md-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={CHART_COLORS.green} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ─── Daily trend ───────────────────────────────────────────────────────────

export function TrendCard({ series, metric, onMetric, hasComparison, compareLabel = 'last month' }) {
  const def = TREND_METRICS.find((m) => m.key === metric) || TREND_METRICS[0];
  const hasData = series.some((p) => p.cur !== null);
  return (
    <div className="card">
      <div className="card-header">
        <ChartLine className="card-header-icon-svg" />
        <h3>Daily trend</h3>
        <select className="md-select" value={metric} onChange={(e) => onMetric(e.target.value)} aria-label="Trend metric">
          {TREND_METRICS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
      </div>
      <p className="md-note">
        Solid line: this period.{hasComparison ? ` Dashed line: ${compareLabel}, day by day.` : ' No comparison period is available for this selection.'}
      </p>
      {hasData ? (
        <div className="md-chart">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={series} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
              <defs>
                <linearGradient id="mdTrendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART_COLORS.green} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={CHART_COLORS.green} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: CHART_COLORS.axis }} tickLine={false} axisLine={{ stroke: CHART_COLORS.grid }} minTickGap={24} />
              <YAxis tick={{ fontSize: 11, fill: CHART_COLORS.axis }} tickLine={false} axisLine={false} width={56} tickFormatter={(v) => formatBy(def.kind, v, true)} />
              <Tooltip
                formatter={(value, name) => [formatBy(def.kind, value), name === 'cur' ? 'This period' : cap(compareLabel)]}
                labelFormatter={(label) => label}
                contentStyle={{ borderRadius: 6, border: `1px solid ${CHART_COLORS.grid}`, fontSize: 12 }}
              />
              {hasComparison && (
                <Line type="monotone" dataKey="prev" stroke={CHART_COLORS.previous} strokeWidth={1.6} strokeDasharray="5 4" dot={false} connectNulls={false} isAnimationActive={false} />
              )}
              <Area type="monotone" dataKey="cur" stroke={CHART_COLORS.green} strokeWidth={2.2} fill="url(#mdTrendFill)" dot={false} connectNulls={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : <Empty>{def.storeOnly ? `${def.label} is recorded for the whole store only. Choose All divisions to see it.` : 'No data for this metric in the selected range.'}</Empty>}
    </div>
  );
}

// ─── Division split (two donuts) ───────────────────────────────────────────

function Donut({ data, valueKey, selected, onSelect, centerTop, centerBottom }) {
  const total = data.reduce((s, d) => s + d[valueKey], 0);
  return (
    <div className="md-donut">
      <PieChart width={156} height={156}>
        <Pie data={data.filter((d) => d[valueKey] > 0)} dataKey={valueKey} nameKey="name" innerRadius={48} outerRadius={70} paddingAngle={1} stroke="none" isAnimationActive={false}
             onClick={(d) => onSelect && d && d.name !== 'Unclassified' && onSelect(d.name)} style={{ cursor: onSelect ? 'pointer' : 'default' }}>
          {data.filter((d) => d[valueKey] > 0).map((d) => (
            <Cell key={d.name} fill={DIVISION_COLORS[d.name] || UNCLASSIFIED_COLOR} fillOpacity={selected === 'ALL' || selected === d.name ? 1 : 0.3} />
          ))}
        </Pie>
        <Tooltip formatter={(value, name) => [`${formatBy(valueKey === 'nsv' ? 'inr' : 'num', value)} (${total > 0 ? ((value / total) * 100).toFixed(1) : 0}%)`, name]} contentStyle={{ borderRadius: 6, border: `1px solid ${CHART_COLORS.grid}`, fontSize: 12 }} />
      </PieChart>
      <div className="md-donut-center">
        <strong>{centerTop}</strong>
        <span>{centerBottom}</span>
      </div>
    </div>
  );
}

export function DivisionSplitCard({ split, selectedDivision, onSelect }) {
  const nsvTotal = split.reduce((s, d) => s + d.nsv, 0);
  const qtyTotal = split.reduce((s, d) => s + d.qty, 0);
  return (
    <div className="card">
      <div className="card-header">
        <ChartPie className="card-header-icon-svg" />
        <h3>Division split</h3>
      </div>
      <p className="md-note">Click a slice to filter the dashboard by division. Click it again to clear.</p>
      {nsvTotal > 0 ? (
        <>
          <div className="md-donuts">
            <div>
              <Donut data={split} valueKey="nsv" selected={selectedDivision} onSelect={(n) => onSelect(selectedDivision === n ? 'ALL' : n)} centerTop={formatINR(nsvTotal)} centerBottom="NSV" />
              <div className="md-donut-cap">NSV</div>
            </div>
            <div>
              <Donut data={split} valueKey="qty" selected={selectedDivision} onSelect={(n) => onSelect(selectedDivision === n ? 'ALL' : n)} centerTop={formatNumber(qtyTotal)} centerBottom="units" />
              <div className="md-donut-cap">Qty</div>
            </div>
          </div>
          <div className="md-legend">
            {split.map((d) => (
              <span key={d.name}><i className="md-dot" style={{ background: DIVISION_COLORS[d.name] || UNCLASSIFIED_COLOR }} />{d.name}</span>
            ))}
          </div>
        </>
      ) : <Empty>No sales in the selected range.</Empty>}
    </div>
  );
}

// ─── Payment mode pie (Account DSR) ────────────────────────────────────────

export function PaymentCard({ payments, grossSales }) {
  const slices = payments.modes.filter((m) => m.amount > 0);
  const gap = payments.total - grossSales;
  return (
    <div className="card">
      <div className="card-header">
        <CreditCard className="card-header-icon-svg" />
        <h3>Payment mode (Account DSR)</h3>
      </div>
      {payments.total > 0 ? (
        <>
          <div className="md-pay-layout">
            <div className="md-donut">
              <PieChart width={190} height={190}>
                <Pie data={slices} dataKey="amount" nameKey="label" innerRadius={62} outerRadius={88} paddingAngle={1} stroke="none" isAnimationActive={false}>
                  {slices.map((m) => <Cell key={m.key} fill={m.color} />)}
                </Pie>
                <Tooltip formatter={(value, name) => [formatINRFull(value), name]} contentStyle={{ borderRadius: 6, border: `1px solid ${CHART_COLORS.grid}`, fontSize: 12 }} />
              </PieChart>
              <div className="md-donut-center">
                <strong>{formatINR(payments.total)}</strong>
                <span>collected</span>
              </div>
            </div>
            <table className="md-table md-table-compact">
              <thead><tr><th>Mode</th><th>Amount</th><th>Share</th></tr></thead>
              <tbody>
                {slices.map((m) => (
                  <tr key={m.key}>
                    <td><i className="md-dot" style={{ background: m.color }} />{m.label}</td>
                    <td>{formatINRFull(m.amount)}</td>
                    <td>{formatPercent(m.pct)}</td>
                  </tr>
                ))}
                <tr className="md-total-row"><td>Total collected</td><td>{formatINRFull(payments.total)}</td><td>100.0%</td></tr>
              </tbody>
            </table>
          </div>
          <p className="md-note md-note-box">
            {payments.dayCount} day(s) of collections. Sales including GST for the same days: {formatINRFull(grossSales)}
            {' '}(difference {formatINRFull(gap)}; the DSR is in whole rupees).
          </p>
        </>
      ) : <Empty>No Account DSR data for this period.</Empty>}
    </div>
  );
}

// ─── Month on month (weekly NSV) ───────────────────────────────────────────

export function WeeklyCard({ weeks, hasComparison, compareLabel = 'last month', title = 'M2M' }) {
  const hasData = weeks.some((w) => w.cur > 0);
  return (
    <div className="card">
      <div className="card-header">
        <ChartColumn className="card-header-icon-svg" />
        <h3>{title}</h3>
      </div>
      <p className="md-note">
        NSV by week of the selected range{hasComparison ? `, against ${compareLabel === 'last month' ? 'the same weeks one month earlier' : compareLabel}.` : '. No comparison period is available for this selection.'}
      </p>
      {hasData ? (
        <>
          <div className="md-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeks} margin={{ top: 8, right: 12, bottom: 0, left: 4 }} barGap={4}>
                <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: CHART_COLORS.axis }} tickLine={false} axisLine={{ stroke: CHART_COLORS.grid }} />
                <YAxis tick={{ fontSize: 11, fill: CHART_COLORS.axis }} tickLine={false} axisLine={false} width={56} tickFormatter={(v) => formatINR(v)} />
                <Tooltip
                  formatter={(value, name) => [formatINRFull(value), name === 'cur' ? 'This period' : cap(compareLabel)]}
                  labelFormatter={(label, payload) => `${label} (${payload && payload[0] ? payload[0].payload.sub : ''})`}
                  contentStyle={{ borderRadius: 6, border: `1px solid ${CHART_COLORS.grid}`, fontSize: 12 }}
                  cursor={{ fill: 'var(--text-muted)', fillOpacity: 0.08 }}
                />
                {hasComparison && <Bar dataKey="prev" fill="var(--chart-previous)" radius={[3, 3, 0, 0]} isAnimationActive={false} />}
                <Bar dataKey="cur" fill={CHART_COLORS.green} radius={[3, 3, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="md-legend">
            <span><i className="md-dot" style={{ background: CHART_COLORS.green }} />This period</span>
            {hasComparison && <span><i className="md-dot" style={{ background: 'var(--chart-previous)' }} />{compareLabel === 'last month' ? 'Same days last month' : cap(compareLabel)}</span>}
          </div>
        </>
      ) : <Empty>No sales in the selected range.</Empty>}
    </div>
  );
}

// ─── Division performance table ────────────────────────────────────────────

/**
 * A value with its comparison underneath:   ₹41,52,513 ▼ 0.1%
 *                                             LM: ₹41,58,419
 * Triangle + % in green / red (goodWhen says which direction is good), a dash when there is
 * nothing to compare (no comparison period, or the comparison value was 0).
 */
function CompareCell({ value, prev, change: delta, kind = 'pct', format, goodWhen = 'up', prevLabel }) {
  const flat = delta === null || delta === undefined || Math.abs(delta) < 0.05;
  const up = delta > 0;
  const tone = flat ? 'flat' : (goodWhen === 'up' ? up : !up) ? 'good' : 'bad';
  const unit = kind === 'points' ? ' pts' : '%';
  return (
    <td className="md-cmp-cell">
      <div className="md-cmp">
        <span className="md-cmp-value">{format(value)}</span>
        {prev !== undefined && (
          flat
            ? <span className="md-cmp-delta flat" aria-label="no change">—</span>
            : <span className={`md-cmp-delta ${tone}`}>{up ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}{unit}</span>
        )}
      </div>
      {prev !== undefined && <div className="md-cmp-prev">{prevLabel}: {prev === null ? '—' : format(prev)}</div>}
    </td>
  );
}

function DivisionRow({ r, prevLabel, total = false }) {
  const p = r.prev;                       // null -> no comparison period: values only
  const cmp = (key) => (p ? p[key] : undefined);
  return (
    <tr className={total ? 'md-total-row' : r.warning ? 'md-warn-row' : ''}>
      <td>{r.name}{r.warning ? ' (no division in source data)' : ''}</td>
      <CompareCell value={r.nsv} prev={cmp('nsv')} change={r.nsvChange} format={formatINRFull} prevLabel={prevLabel} />
      <td>{formatPercent(r.contribution)}</td>
      <CompareCell value={r.qty} prev={cmp('qty')} change={r.qtyChange} format={formatNumber} prevLabel={prevLabel} />
      {r.bills === null
        ? <td>-</td>
        : <CompareCell value={r.bills} prev={cmp('bills')} change={r.billsChange} format={formatNumber} prevLabel={prevLabel} />}
      {/* MD % going up means deeper discounts, so up is shown red. */}
      <CompareCell value={r.mdPct} prev={cmp('mdPct')} change={r.mdPctChange} goodWhen="down" format={formatPercent} prevLabel={prevLabel} />
    </tr>
  );
}

export function DivisionTableCard({ table, compareLabel = 'last month' }) {
  // "LM" for the normal month-on-month view, the period's own name in Compare mode (e.g. "Aug 2026").
  const prevLabel = compareLabel === 'last month' ? 'LM' : compareLabel;
  return (
    <div className="card">
      <div className="card-header">
        <Table2 className="card-header-icon-svg" />
        <h3>Division performance</h3>
      </div>
      <p className="md-note">
        MD % = (MRP - NSV) / MRP. Ratios are recalculated from sums, never averaged.
        {table.total.prev ? ` ▲ / ▼ compare with ${compareLabel}; ${prevLabel} shows its value.` : ''}
      </p>
      <div className="md-table-wrap">
        <table className="md-table">
          <thead>
            <tr>
              <th>Division</th><th>NSV</th><th>Contribution</th><th>Qty</th><th>Bills</th><th>MD %</th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r) => <DivisionRow key={r.name} r={r} prevLabel={prevLabel} />)}
            <DivisionRow r={table.total} prevLabel={prevLabel} total />
          </tbody>
        </table>
      </div>
      <p className="md-note" style={{ marginTop: 10, marginBottom: 0 }}>
        A bill can contain several divisions, so division bills do not add up to total bills.
      </p>
    </div>
  );
}
