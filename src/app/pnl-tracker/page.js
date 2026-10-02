'use client';

// P&L Tracker (Uppal Reebok), admin only. Layout and styles are Deeksha's design from the
// `pnl-tracker` branch (d2a72df): month buttons, Metric Trend chart, month breakdown cards,
// All Months Comparison. The data path is ours: /api/pnl -> public.pnl_monthly() -> pnl_tracker
// schema. There are no built-in numbers; an empty database shows an empty state with a link
// to the import (the branch showed hard-coded Jul-Sep figures whenever its API failed).

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { TrendingUp, IndianRupee, Zap, Upload } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import RequireAuth from '@/components/RequireAuth';
import { apiFetch } from '@/lib/api';
import { formatINRFull } from '@/lib/masterDashboardShared';

const METRIC_OPTIONS = [
  { value: 'gross_sale', label: 'Sales (NSV)' },
  { value: 'income_margin', label: 'Income Margin' },
  { value: 'opex_expenses', label: 'Operating Expense' },
  { value: 'operating_profit', label: 'Operating Profit' },
  { value: 'net_profit_opex_dep', label: 'Net Profit' },
  { value: 'roi', label: 'ROI (%)' },
  { value: 'depreciation', label: 'Depreciation' },
  { value: 'funds_cost', label: 'Funds Cost' },
];

const monthLong = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthShort = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' });
const formatPct = (v) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`);
const signColor = (v) => (v == null ? 'var(--text-muted)' : v >= 0 ? 'var(--green)' : 'var(--rose)');
const signCls = (v) => (v == null ? '' : v >= 0 ? 'positive' : 'negative');

function StatCard({ label, value, icon: Icon, color = 'var(--green)' }) {
  return (
    <div className="pnl-stat-card" style={{ borderLeftColor: color }}>
      <div className="pnl-stat-header">
        <span className="pnl-stat-label">{label}</span>
        {Icon && <Icon style={{ width: 18, height: 18, color: 'var(--text-muted)' }} />}
      </div>
      <div className="pnl-stat-value">{value}</div>
    </div>
  );
}

function PnLTracker() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState(0);
  const [metricKey, setMetricKey] = useState('gross_sale');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch('/api/pnl');
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json.months);
      setSel((i) => (i < json.months.length ? i : 0));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const months = data || [];
  const cur = months[sel] || null;
  const metric = METRIC_OPTIONS.find((m) => m.value === metricKey);
  const isPct = metricKey === 'roi';
  const chartData = useMemo(() => months.map((d) => ({ month: monthShort(d.period_month), value: d[metricKey] ?? 0 })), [months, metricKey]);
  const fmt = (v) => (isPct ? formatPct(v) : formatINRFull(v));

  return (
    <div className="pnl-page-wrapper">
      <div className="pnl-page-container">
        <div className="pnl-page-header">
          <div>
            <h1 className="pnl-page-title">P&amp;L Tracker</h1>
            <p className="pnl-page-subtitle">{cur ? `${cur.store_name} • Store ${cur.store_code}` : 'REEBOK UPPAL • Store 323865'}</p>
          </div>
          <Link href="/pnl-import" className="pnl-import-btn"><Upload />Import Data</Link>
        </div>

        {error && <div className="reebok-error">Could not load the P&amp;L: {error}</div>}
        {loading && !data && <div className="md-empty card">Loading P&amp;L data...</div>}
        {data && months.length === 0 && (
          <div className="md-empty card">
            No P&amp;L months have been imported yet. <Link href="/pnl-import" className="mx-link">Import the P&amp;L Excel</Link> to fill this page.
          </div>
        )}

        {cur && (
          <>
            <div className="pnl-month-selector">
              {months.map((m, idx) => (
                <button key={m.period_month} type="button" className={`pnl-month-btn ${sel === idx ? 'active' : ''}`} onClick={() => setSel(idx)}>
                  {monthLong(m.period_month)}
                </button>
              ))}
            </div>

            <div className="pnl-chart-card">
              <div className="pnl-chart-head">
                <h3>Metric Trend</h3>
                <select className="pnl-select" value={metricKey} onChange={(e) => setMetricKey(e.target.value)} aria-label="Metric">
                  {METRIC_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div className="pnl-chart-body">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} stroke="var(--border-strong)" />
                    <YAxis width={80} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} stroke="var(--border-strong)"
                      tickFormatter={(v) => (isPct ? `${v}%` : Number(v).toLocaleString('en-IN'))} />
                    <Tooltip formatter={(v) => [fmt(v), metric.label]}
                      contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 4, padding: 8, color: 'var(--text)' }} />
                    <Legend />
                    <Line type="monotone" dataKey="value" name={metric.label} stroke="var(--green)" strokeWidth={3}
                      dot={{ fill: 'var(--green)', r: 6 }} activeDot={{ r: 8 }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <h2 className="pnl-section-title">{monthLong(cur.period_month)} Breakdown</h2>
            <div className="pnl-metrics-grid">
              <StatCard label="Sales (NSV)" value={formatINRFull(cur.gross_sale)} icon={IndianRupee} color="var(--green)" />
              <StatCard label="Income Margin" value={formatINRFull(cur.income_margin)} icon={TrendingUp} color="var(--blue)" />
              <StatCard label="Total Opex" value={formatINRFull(cur.opex_expenses)} icon={Zap} color="var(--amber)" />
              <StatCard label="Operating Profit" value={formatINRFull(cur.operating_profit)} color={signColor(cur.operating_profit)} />
              <StatCard label="Depreciation" value={formatINRFull(cur.depreciation)} color="var(--text-muted)" />
              <StatCard label="Funds Cost" value={formatINRFull(cur.funds_cost)} color="var(--text-muted)" />
              <StatCard label="Net Profit" value={formatINRFull(cur.net_profit_opex_dep)} color={signColor(cur.net_profit_opex_dep)} />
              <StatCard label="ROI" value={formatPct(cur.roi)} color="var(--text-muted)" />
            </div>

            {cur.expenses.length > 0 && (
              <div className="pnl-expense-breakdown">
                <h4>Operating expenses · {monthLong(cur.period_month)}</h4>
                <div className="pnl-expense-list">
                  {cur.expenses.map((e) => (
                    <div key={e.category} className="pnl-expense-row">
                      <span className="pnl-expense-label">{e.category}</span>
                      <span className="pnl-expense-value">{formatINRFull(e.amount)}</span>
                    </div>
                  ))}
                  <div className="pnl-expense-row pnl-expense-total">
                    <span>Total Opex</span><span>{formatINRFull(cur.opex_expenses)}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="pnl-comparison-section">
              <h2>All Months Comparison</h2>
              <div className="pnl-comparison-table">
                <table>
                  <thead>
                    <tr><th>Metric</th>{months.map((d) => <th key={d.period_month}>{monthShort(d.period_month)}</th>)}</tr>
                  </thead>
                  <tbody>
                    <tr><td>Sales (NSV)</td>{months.map((d) => <td key={d.period_month} className="pnl-table-value">{formatINRFull(d.gross_sale)}</td>)}</tr>
                    <tr><td>Total Opex</td>{months.map((d) => <td key={d.period_month} className="pnl-table-value">{formatINRFull(d.opex_expenses)}</td>)}</tr>
                    <tr><td>Income Margin</td>{months.map((d) => <td key={d.period_month} className="pnl-table-value">{formatINRFull(d.income_margin)}</td>)}</tr>
                    <tr className="pnl-table-highlight">
                      <td>Operating Profit</td>
                      {months.map((d) => <td key={d.period_month} className={`pnl-table-value ${signCls(d.operating_profit)}`}>{formatINRFull(d.operating_profit)}</td>)}
                    </tr>
                    <tr className="pnl-table-highlight">
                      <td>Net Profit (with Dep)</td>
                      {months.map((d) => <td key={d.period_month} className={`pnl-table-value ${signCls(d.net_profit_opex_dep)}`}>{formatINRFull(d.net_profit_opex_dep)}</td>)}
                    </tr>
                    <tr className="pnl-table-highlight">
                      <td>ROI (%)</td>
                      {months.map((d) => <td key={d.period_month} className={`pnl-table-value ${signCls(d.roi)}`}>{formatPct(d.roi)}</td>)}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function PnLTrackerPage() {
  return (
    <RequireAuth roles={['admin']}>
      <PnLTracker />
    </RequireAuth>
  );
}
