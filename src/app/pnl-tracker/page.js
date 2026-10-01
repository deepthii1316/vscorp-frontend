'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Zap, Users, Building2, Calendar, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart
} from 'recharts';
import RequireAuth from '@/components/RequireAuth';
import { apiFetch } from '@/lib/api';

// Static fallback data if database is empty
const FALLBACK_DATA = [
  {
    period_month: '2026-07-01',
    store_name: 'REEBOK UPPAL',
    store_code: '323865',
    gross_sale: 880354,
    income_margin: 369748,
    depreciation: 88842,
    funds_cost: 83905,
    opex_expenses: 822171,
    operating_profit: -452423,
    net_profit_opex_dep: -541265,
    roi: -5.39,
  },
  {
    period_month: '2026-08-01',
    store_name: 'REEBOK UPPAL',
    store_code: '323865',
    gross_sale: 847984,
    income_margin: 356153,
    depreciation: 88842,
    funds_cost: 83905,
    opex_expenses: 427763,
    operating_profit: -71610,
    net_profit_opex_dep: -160452,
    roi: -0.85,
  },
  {
    period_month: '2026-09-01',
    store_name: 'REEBOK UPPAL',
    store_code: '323865',
    gross_sale: 528254,
    income_margin: 221867,
    depreciation: 88842,
    funds_cost: 83905,
    opex_expenses: 215000,
    operating_profit: 6867,
    net_profit_opex_dep: -81975,
    roi: 0.08,
  },
];

function formatINR(value) {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPct(value) {
  if (value === null || value === undefined) return '—';
  return (value >= 0 ? '+' : '') + (typeof value === 'number' ? value.toFixed(2) : value) + '%';
}

function StatCard({ label, value, icon: Icon, trend, color = 'var(--green)' }) {
  return (
    <div className="pnl-stat-card" style={{ borderLeftColor: color }}>
      <div className="pnl-stat-header">
        <span className="pnl-stat-label">{label}</span>
        {Icon && <Icon style={{ width: 18, height: 18, color: 'var(--text-muted)' }} />}
      </div>
      <div className="pnl-stat-value">{value}</div>
      {trend !== undefined && (
        <div className="pnl-stat-trend" style={{ color: trend >= 0 ? 'var(--green)' : 'var(--rose)' }}>
          {trend >= 0 ? <TrendingUp style={{ width: 14, height: 14 }} /> : <TrendingDown style={{ width: 14, height: 14 }} />}
          <span>{formatPct(trend)}</span>
        </div>
      )}
    </div>
  );
}

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

function PNLTrackerInner() {
  const router = useRouter();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonthIdx, setSelectedMonthIdx] = useState(0);
  const [selectedMetric, setSelectedMetric] = useState('gross_sale');
  const [selectedMetric2, setSelectedMetric2] = useState('net_profit_opex_dep');

  useEffect(() => {
    fetchPnLData();
  }, []);

  const fetchPnLData = async () => {
    try {
      const res = await apiFetch('/api/pnl/ingest');
      if (res && res.ok) {
        const json = await res.json();
        if (json.data && json.data.length > 0) {
          setData(json.data);
        } else {
          setData(FALLBACK_DATA);
        }
      } else {
        setData(FALLBACK_DATA);
      }
    } catch (err) {
      // API not available yet, use fallback data
      setData(FALLBACK_DATA);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="pnl-page-wrapper">
        <div className="pnl-page-container">
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            Loading P&L data...
          </div>
        </div>
      </div>
    );
  }

  const currentData = data[selectedMonthIdx];
  const chartData = data.map((d) => ({
    month: new Date(d.period_month).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
    metric1: d[selectedMetric] || 0,
    metric2: d[selectedMetric2] || 0,
    roi: d.roi,
  }));

  const getMetricLabel = (key) => METRIC_OPTIONS.find(m => m.value === key)?.label || key;

  return (
    <div className="pnl-page-wrapper">
      <div className="pnl-page-container">
        {/* Header */}
        <div className="pnl-page-header">
          <div>
            <h1 className="pnl-page-title">P&L Tracker</h1>
            <p className="pnl-page-subtitle">
              {currentData?.store_name} • Store {data[0]?.store_code || '323865'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <button
              onClick={() => router.push('/pnl-import')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 20px',
                background: '#1F6B45',
                color: '#FAFAF7',
                border: 'none',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 150ms ease',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#16523A'}
              onMouseLeave={(e) => e.currentTarget.style.background = '#1F6B45'}
            >
              <Upload style={{ width: 16, height: 16 }} />
              Import Data
            </button>
          </div>
        </div>

        {/* Month Filter */}
        <div className="pnl-month-selector">
          {data.map((month, idx) => (
            <button
              key={idx}
              className={`pnl-month-btn ${selectedMonthIdx === idx ? 'active' : ''}`}
              onClick={() => setSelectedMonthIdx(idx)}
            >
              {new Date(month.period_month).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
            </button>
          ))}
        </div>

        {/* Chart Section */}
        <div style={{ marginTop: 'var(--space-8)', marginBottom: 'var(--space-8)' }}>
          <div style={{ padding: 'var(--space-6)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text)' }}>Metric Trend</h3>
              <select
                value={selectedMetric}
                onChange={(e) => setSelectedMetric(e.target.value)}
                style={{
                  padding: '8px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-md)',
                  fontSize: '13px',
                  fontWeight: 500,
                  background: 'var(--bg-elevated)',
                  cursor: 'pointer',
                }}
              >
                {METRIC_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div style={{ width: '100%', height: '420px', position: 'relative' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 30, left: 80, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" />
                  <YAxis width={70} />
                  <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: `1px solid var(--border)`, borderRadius: '4px', padding: '8px' }} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="metric1"
                    stroke="var(--green)"
                    name={getMetricLabel(selectedMetric)}
                    strokeWidth={3}
                    dot={{ fill: 'var(--green)', r: 6 }}
                    activeDot={{ r: 8 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Current Month Details */}
        {currentData && (
          <>
            <h2 style={{ marginTop: 'var(--space-8)', marginBottom: 'var(--space-5)', fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>
              {new Date(currentData.period_month).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })} Breakdown
            </h2>

            <div className="pnl-metrics-grid">
              <StatCard
                label="Sales (NSV)"
                value={formatINR(currentData.gross_sale)}
                icon={DollarSign}
                color="var(--green)"
              />
              <StatCard
                label="Income Margin"
                value={formatINR(currentData.income_margin)}
                icon={TrendingUp}
                color="var(--blue)"
              />
              <StatCard
                label="Total Opex"
                value={formatINR(currentData.opex_expenses)}
                icon={Zap}
                color="var(--amber)"
              />
              <StatCard
                label="Operating Profit"
                value={formatINR(currentData.operating_profit)}
                color={currentData.operating_profit >= 0 ? 'var(--green)' : 'var(--rose)'}
              />
              <StatCard
                label="Depreciation"
                value={formatINR(currentData.depreciation)}
                color="var(--text-muted)"
              />
              <StatCard
                label="Funds Cost"
                value={formatINR(currentData.funds_cost)}
                color="var(--text-muted)"
              />
              <StatCard
                label="Net Profit"
                value={formatINR(currentData.net_profit_opex_dep)}
                color={currentData.net_profit_opex_dep >= 0 ? 'var(--green)' : 'var(--rose)'}
              />
              <StatCard
                label="ROI"
                value={formatPct(currentData.roi)}
                color="var(--text-muted)"
              />
            </div>
          </>
        )}

        {/* Comparison Table */}
        {data.length > 0 && (
          <div className="pnl-comparison-section">
            <h2>All Months Comparison</h2>
            <div className="pnl-comparison-table">
              <table>
                <thead>
                  <tr>
                    <th>Metric</th>
                    {data.map((d, idx) => (
                      <th key={idx}>
                        {new Date(d.period_month).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Sales (NSV)</td>
                    {data.map((d, idx) => (
                      <td key={idx} className="pnl-table-value">{formatINR(d.gross_sale)}</td>
                    ))}
                  </tr>
                  <tr>
                    <td>Total Opex</td>
                    {data.map((d, idx) => (
                      <td key={idx} className="pnl-table-value">{formatINR(d.opex_expenses)}</td>
                    ))}
                  </tr>
                  <tr>
                    <td>Income Margin</td>
                    {data.map((d, idx) => (
                      <td key={idx} className="pnl-table-value">{formatINR(d.income_margin)}</td>
                    ))}
                  </tr>
                  <tr className="pnl-table-highlight">
                    <td>Operating Profit</td>
                    {data.map((d, idx) => (
                      <td key={idx} className={`pnl-table-value ${d.operating_profit >= 0 ? 'positive' : 'negative'}`}>
                        {formatINR(d.operating_profit)}
                      </td>
                    ))}
                  </tr>
                  <tr className="pnl-table-highlight">
                    <td>Net Profit (with Dep)</td>
                    {data.map((d, idx) => (
                      <td key={idx} className={`pnl-table-value ${d.net_profit_opex_dep >= 0 ? 'positive' : 'negative'}`}>
                        {formatINR(d.net_profit_opex_dep)}
                      </td>
                    ))}
                  </tr>
                  <tr className="pnl-table-highlight">
                    <td>ROI (%)</td>
                    {data.map((d, idx) => (
                      <td key={idx} className={`pnl-table-value ${d.roi >= 0 ? 'positive' : 'negative'}`}>
                        {formatPct(d.roi)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PNLTrackerPage() {
  return (
    <RequireAuth roles={['admin', 'store_manager']}>
      <PNLTrackerInner />
    </RequireAuth>
  );
}
