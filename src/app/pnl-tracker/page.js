'use client';

// P&L Tracker (Uppal Reebok), admin only. Originally built on the `pnl-tracker` branch (Deeksha,
// 01-Oct-2026); integrated here on the app's own dashboard styles and a locked-down data path:
// /api/pnl -> public.pnl_monthly() -> pnl_tracker schema. No sample numbers: an empty database
// shows an empty state with a link to the import.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  TrendingUp, RefreshCw, Upload, IndianRupee, Percent, Wallet, Building2, Landmark, Scale, ChartLine, ReceiptText, Table2,
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import RequireAuth from '@/components/RequireAuth';
import { apiFetch } from '@/lib/api';
import { formatINR, formatINRFull, formatPercent } from '@/lib/masterDashboardShared';

const METRICS = [
  { key: 'gross_sale', label: 'Sales (NSV)' },
  { key: 'income_margin', label: 'Income margin' },
  { key: 'opex_expenses', label: 'Operating expenses' },
  { key: 'operating_profit', label: 'Operating profit' },
  { key: 'net_profit_opex_dep', label: 'Net profit (after depreciation)' },
  { key: 'net_profit_all_costs', label: 'Net profit (after depreciation + funds cost)' },
  { key: 'roi', label: 'ROI %', pct: true },
];

const monthLong = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthShort = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' });
const signCls = (v) => (v == null ? '' : v >= 0 ? 'pn-pos' : 'pn-neg');
const roiStr = (v) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(2)}%`);

function Tile({ label, icon: Icon, value, foot, cls = '' }) {
  return (
    <div className="card md-kpi">
      <div className="md-kpi-top"><span className="md-label">{label}</span>{Icon && <Icon />}</div>
      <div className={`md-kpi-value ${cls}`}>{value}</div>
      {foot && <div className="md-kpi-foot">{foot}</div>}
    </div>
  );
}

function ChartTip({ active, payload, label, metric }) {
  if (!active || !payload?.length) return null;
  const v = payload[0].value;
  return (
    <div className="pn-tip">
      <strong>{label}</strong>
      <span>{metric.label}: {metric.pct ? roiStr(v) : formatINRFull(v)}</span>
    </div>
  );
}

function PnLTracker() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState(null);           // selected period_month
  const [metricKey, setMetricKey] = useState('gross_sale');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch('/api/pnl');
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json);
      setSel((s) => (s && json.months.some((m) => m.period_month === s) ? s : json.months.at(-1)?.period_month || null));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const months = data?.months || [];
  const cur = months.find((m) => m.period_month === sel) || null;
  const metric = METRICS.find((m) => m.key === metricKey);
  const series = useMemo(() => months.map((m) => ({ label: monthShort(m.period_month), value: m[metricKey] })), [months, metricKey]);
  const anyNegative = series.some((p) => p.value < 0);
  const expenseMax = cur ? Math.max(1, ...cur.expenses.map((e) => e.amount)) : 1;

  return (
    <div className="md-page">
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="page-header-icon-box"><IndianRupee className="page-header-icon-svg" /></div>
        <div className="page-header-text">
          <h1>P&amp;L Tracker</h1>
          <p>
            {cur ? `${cur.store_name} · store ${cur.store_code}` : 'Uppal Reebok'}
            {months.length ? ` · ${monthLong(months[0].period_month)} to ${monthLong(months.at(-1).period_month)}` : ''}
          </p>
        </div>
        <div className="md-header-actions mx-header-actions">
          <Link href="/pnl-import" className="reebok-btn"><Upload />Import P&amp;L</Link>
          <button type="button" className="reebok-btn secondary" onClick={load} disabled={loading}><RefreshCw />{loading ? 'Loading...' : 'Refresh'}</button>
        </div>
      </div>

      {error && <div className="reebok-error">Could not load the P&amp;L: {error}</div>}
      {loading && !data && <div className="md-empty card">Loading...</div>}

      {data && months.length === 0 && (
        <div className="md-empty card">
          No P&amp;L months have been imported yet. <Link href="/pnl-import" className="mx-link">Import the P&amp;L Excel</Link> to fill this page.
        </div>
      )}

      {cur && (
        <>
          <div className="card md-filters">
            <div className="md-filter-group">
              <span className="md-label">Month</span>
              <div className="md-seg pn-months" role="group" aria-label="Month">
                {months.map((m) => (
                  <button key={m.period_month} type="button" className={m.period_month === sel ? 'active' : ''} onClick={() => setSel(m.period_month)}>
                    {monthShort(m.period_month)}
                  </button>
                ))}
              </div>
            </div>
            {cur.updated_at && <span className="md-note pn-updated">Imported {new Date(cur.updated_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>}
          </div>

          <div className="md-kpis">
            <Tile label="Sales (NSV)" icon={IndianRupee} value={formatINRFull(cur.gross_sale)}
              foot={cur.carpet_sqft ? `${formatINRFull(cur.gross_sale / cur.carpet_sqft)} per sq ft` : null} />
            <Tile label="Income margin" icon={Percent} value={formatINRFull(cur.income_margin)}
              foot={cur.gross_sale ? `${formatPercent((cur.income_margin / cur.gross_sale) * 100)} of sales` : null} />
            <Tile label="Operating expenses" icon={Wallet} value={formatINRFull(cur.opex_expenses)}
              foot={cur.gross_sale ? `${formatPercent((cur.opex_expenses / cur.gross_sale) * 100)} of sales` : null} />
            <Tile label="Operating profit" icon={Scale} value={formatINRFull(cur.operating_profit)} cls={signCls(cur.operating_profit)} foot="Margin − opex" />
            <Tile label="Depreciation" icon={Building2} value={formatINRFull(cur.depreciation)} />
            <Tile label="Funds cost" icon={Landmark} value={formatINRFull(cur.funds_cost)} />
            <Tile label="Net profit" icon={TrendingUp} value={formatINRFull(cur.net_profit_opex_dep)} cls={signCls(cur.net_profit_opex_dep)}
              foot={`After funds cost: ${formatINRFull(cur.net_profit_all_costs)}`} />
            <Tile label="ROI" icon={Percent} value={roiStr(cur.roi)} cls={signCls(cur.roi)} foot="As reported in the P&L file" />
          </div>

          <div className="md-row md-row-trend">
            <div className="card">
              <div className="card-header mx-card-head">
                <ChartLine className="card-header-icon-svg" />
                <h3>{metric.label} by month</h3>
                <div className="mx-card-actions">
                  <select className="md-select-plain" value={metricKey} onChange={(e) => setMetricKey(e.target.value)} aria-label="Metric">
                    {METRICS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                  </select>
                </div>
              </div>
              {months.length < 2 ? <div className="md-empty">A trend needs at least two months.</div> : (
                <div className="md-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={series} margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
                      <CartesianGrid stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} width={64}
                        tickFormatter={(v) => (metric.pct ? `${v}%` : formatINR(v))} />
                      {anyNegative && <ReferenceLine y={0} stroke="var(--border-strong)" />}
                      <Tooltip content={<ChartTip metric={metric} />} cursor={{ stroke: 'var(--border-strong)' }} />
                      <Line type="monotone" dataKey="value" stroke="var(--green)" strokeWidth={2} isAnimationActive={false}
                        dot={{ r: 4, fill: 'var(--green)', stroke: 'var(--bg-elevated)', strokeWidth: 2 }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="card">
              <div className="card-header"><ReceiptText className="card-header-icon-svg" /><h3>Expenses · {monthLong(cur.period_month)}</h3></div>
              {cur.expenses.length === 0 ? <div className="md-empty">No expense lines for this month.</div> : (
                <div className="mx-hbars">
                  {cur.expenses.map((e) => (
                    <div key={e.category} className="mx-hbar-row pn-exp-row" title={`${e.category}: ${formatINRFull(e.amount)}`}>
                      <span>{e.category}</span>
                      <div><i style={{ width: `${Math.max(0, (e.amount / expenseMax) * 100)}%` }} /></div>
                      <strong>{formatINRFull(e.amount)}</strong>
                    </div>
                  ))}
                  <div className="mx-hbar-row pn-exp-row pn-exp-total"><span>Total opex</span><div /><strong>{formatINRFull(cur.opex_expenses)}</strong></div>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header"><Table2 className="card-header-icon-svg" /><h3>All months</h3></div>
            <p className="md-note">Operating profit = income margin − operating expenses. Net profit subtracts depreciation, then funds cost.</p>
            <div className="md-table-wrap">
              <table className="md-table">
                <thead>
                  <tr><th>Metric</th>{months.map((m) => <th key={m.period_month} className={m.period_month === sel ? 'pn-col-sel' : ''}>{monthShort(m.period_month)}</th>)}</tr>
                </thead>
                <tbody>
                  {[
                    ['Sales (NSV)', 'gross_sale'], ['Income margin', 'income_margin'], ['Operating expenses', 'opex_expenses'],
                    ['Operating profit', 'operating_profit', true], ['Depreciation', 'depreciation'],
                    ['Net profit (after depreciation)', 'net_profit_opex_dep', true], ['Funds cost', 'funds_cost'],
                    ['Net profit (all costs)', 'net_profit_all_costs', true],
                  ].map(([label, key, signed]) => (
                    <tr key={key} className={signed ? 'pn-row-strong' : ''}>
                      <td>{label}</td>
                      {months.map((m) => <td key={m.period_month} className={signed ? signCls(m[key]) : ''}>{formatINRFull(m[key])}</td>)}
                    </tr>
                  ))}
                  <tr className="pn-row-strong">
                    <td>ROI</td>
                    {months.map((m) => <td key={m.period_month} className={signCls(m.roi)}>{roiStr(m.roi)}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
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
