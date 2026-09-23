'use client';

import { useState } from 'react';
import { Gauge, IndianRupee, Percent, TrendingUp, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { formatINRFull, formatNumber, formatPercent } from '@/lib/masterDashboardShared';
import { Sparkline } from '@/components/MasterDashboardCharts';

const METRICS = [
  { key: 'upt', label: 'UPT', format: (value) => value == null ? '-' : Number(value).toFixed(2), icon: Gauge, kind: 'number' },
  { key: 'atv', label: 'ATV', format: formatINRFull, icon: IndianRupee, kind: 'number' },
  { key: 'asp', label: 'ASP', format: formatINRFull, icon: IndianRupee, kind: 'number' },
  { key: 'ssr', label: 'SSR', format: (value) => value == null ? '—' : `${Number(value).toFixed(1)}%`, icon: Percent, kind: 'points' },
  { key: 'fupt', label: 'FUPT', format: (value) => value == null ? '-' : Number(value).toFixed(2), icon: Gauge, kind: 'number' },
  { key: 'sfr', label: 'SFR', format: formatPercent, icon: Percent, kind: 'points' },
  { key: 'afr', label: 'AFR', format: formatPercent, icon: Percent, kind: 'points' },
];

const num = (value) => Number(value || 0);

function aggregate(rows) {
  const totals = (rows || []).reduce((result, row) => ({
    bills: result.bills + num(row.bills),
    qty: result.qty + num(row.qty ?? row.qty_sold),
    nsv: result.nsv + num(row.nsv),
    footwear: result.footwear + num(row.footwear_qty),
    apparel: result.apparel + num(row.apparel_qty),
    socks: result.socks + num(row.socks_qty),
  }), { bills: 0, qty: 0, nsv: 0, footwear: 0, apparel: 0, socks: 0 });

  return {
    upt: totals.bills ? totals.qty / totals.bills : null,
    atv: totals.bills ? totals.nsv / totals.bills : null,
    asp: totals.qty ? totals.nsv / totals.qty : null,
    // ssr is not computed here: these rows are gold.reebok_daily_metrics, which has no
    // shoes_qty column. It needs gold.reebok_master_dashboard's rows instead — see
    // aggregateSsr()/perRowSsr(), fed by the separate ssrDays/ssrPrevDays props.
    ssr: null,
    fupt: totals.bills ? totals.footwear / totals.bills : null,
    sfr: totals.footwear ? (totals.socks / totals.footwear) * 100 : null,
    afr: totals.footwear ? (totals.apparel / totals.footwear) * 100 : null,
  };
}

function aggregateSsr(rows) {
  const totals = (rows || []).reduce((result, row) => ({
    socks: result.socks + num(row.socks_qty),
    shoes: result.shoes + num(row.shoes_qty),
  }), { socks: 0, shoes: 0 });
  return totals.shoes ? (totals.socks / totals.shoes) * 100 : null;
}

/** Single-day SSR, for the sparkline (aggregateSsr does the same over a range). */
function perRowSsr(row) {
  const shoes = num(row?.shoes_qty);
  return shoes ? (num(row?.socks_qty) / shoes) * 100 : null;
}

function metricValue(row, key) {
  return aggregate(row ? [row] : [])[key];
}

function delta(current, previous) {
  if (current == null || previous == null || previous === 0) return null;
  return ((current / previous) - 1) * 100;
}

function relativeColor(value, dataset) {
  const values = dataset.filter((item) => item != null && Number.isFinite(item));
  if (value == null || values.length === 0) return 'transparent';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const ratio = max === min ? 0.5 : (value - min) / (max - min);
  const lightGreen = [218, 242, 227];
  const green = [31, 107, 69];
  const rgb = lightGreen.map((channel, index) => Math.round(channel + (green[index] - channel) * ratio));
  return `rgb(${rgb.join(', ')})`;
}

function Delta({ value, unavailableText, compareLabel = 'M2M' }) {
  if (value == null) return <span className="md-metric-delta flat"><Minus />{unavailableText ?? `${compareLabel} unavailable`}</span>;
  const Icon = Math.abs(value) < 0.05 ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight;
  const tone = Math.abs(value) < 0.05 ? 'flat' : value > 0 ? 'good' : 'bad';
  return <span className={`md-metric-delta ${tone}`}><Icon />{Math.abs(value).toFixed(1)}% vs {compareLabel}</span>;
}

function MetricBar({ metric, current, previous, compareLabel = 'M2M' }) {
  const values = [current, previous].filter((value) => value != null && Number.isFinite(value));
  const max = Math.max(...values, 1);
  const currentWidth = current == null ? 0 : (current / max) * 100;
  const previousWidth = previous == null ? 0 : (previous / max) * 100;
  return (
    <div className="md-metric-bars">
      <div className="md-metric-bar-row">
        <span>Current</span><div><i className="current" style={{ width: `${currentWidth}%` }} /></div><strong>{metric.format(current)}</strong>
      </div>
      <div className="md-metric-bar-row">
        <span>{compareLabel}</span><div><i className="previous" style={{ width: `${previousWidth}%` }} /></div><strong>{metric.format(previous)}</strong>
      </div>
    </div>
  );
}

export default function MasterDashboardMetrics({ days, prevDays, ssrDays, ssrPrevDays, rangeText, compareLabel = 'M2M' }) {
  const [selectedMetric, setSelectedMetric] = useState('upt');
  const current = aggregate(days);
  const previous = aggregate(prevDays);
  current.ssr = aggregateSsr(ssrDays);
  previous.ssr = aggregateSsr(ssrPrevDays);
  const metric = METRICS.find((item) => item.key === selectedMetric) || METRICS[0];
  const Icon = metric.icon;

  return (
    <div className="md-metrics-view">
      <div className="md-metric-kpis">
        {METRICS.map((item) => {
          const ItemIcon = item.icon;
          return (
            <button key={item.key} type="button" className={`card md-kpi md-metric-kpi ${selectedMetric === item.key ? 'selected' : ''}`} onClick={() => setSelectedMetric(item.key)}>
              <span className="md-kpi-top"><span className="md-label">{item.label}</span><ItemIcon /></span>
              <strong className="md-kpi-value">{item.format(current[item.key])}</strong>
              <span className="md-kpi-foot">Current period</span>
              <Delta value={delta(current[item.key], previous[item.key])} unavailableText={item.key === 'ssr' ? '—' : undefined} compareLabel={compareLabel} />
              <Sparkline values={item.key === 'ssr' ? (ssrDays || []).map(perRowSsr) : (days || []).map((row) => metricValue(row, item.key))} />
            </button>
          );
        })}
      </div>

      <div className="card md-metric-chart-card">
        <div className="card-header">
          <Icon className="card-header-icon-svg" />
          <h3>Metric by store</h3>
          <select className="md-select" value={selectedMetric} onChange={(event) => setSelectedMetric(event.target.value)} aria-label="Retail metric">
            {METRICS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
        </div>
        <p className="md-note">Current period vs {compareLabel} for the single Virata Retail store{rangeText ? `, ${rangeText}` : ''}.</p>
        <div className="md-metric-legend"><span><i className="current" />Current period</span><span><i className="previous" />{compareLabel}</span></div>
        <div className="md-metric-store-row"><span>Uppal Reebok</span><MetricBar metric={metric} current={current[selectedMetric]} previous={previous[selectedMetric]} compareLabel={compareLabel} /></div>
      </div>

      <div className="card">
        <div className="card-header"><TrendingUp className="card-header-icon-svg" /><h3>Store performance</h3></div>
        <p className="md-note">All seven retail metrics vs {compareLabel}. Virata currently has one uploaded store.</p>
        <div className="md-table-wrap">
          <table className="md-table md-metric-table">
            <thead><tr><th>Store</th>{METRICS.map((item) => <th key={item.key}>{item.label}</th>)}</tr></thead>
            <tbody><tr><td>Uppal Reebok</td>{METRICS.map((item) => {
              const values = [current[item.key], previous[item.key]];
              return <td key={item.key}><strong className="md-metric-value-chip" style={{ borderBottomColor: relativeColor(current[item.key], values) }}>{item.format(current[item.key])}</strong><Delta value={delta(current[item.key], previous[item.key])} unavailableText={item.key === 'ssr' ? '—' : undefined} compareLabel={compareLabel} /></td>;
            })}</tr></tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
