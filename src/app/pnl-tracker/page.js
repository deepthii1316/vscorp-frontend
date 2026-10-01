'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Zap, Users, Building2, Calendar, Upload } from 'lucide-react';
import Link from 'next/link';
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

function PNLTrackerInner() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonthIdx, setSelectedMonthIdx] = useState(0);

  useEffect(() => {
    fetchPnLData();
  }, []);

  const fetchPnLData = async () => {
    try {
      const res = await apiFetch('/api/pnl/ingest');
      if (!res.ok) throw new Error('Failed to fetch data');
      const json = await res.json();
      setData(json.data && json.data.length > 0 ? json.data : FALLBACK_DATA);
    } catch (err) {
      console.error('Error fetching P&L data:', err);
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
    sales: d.gross_sale,
    margin: d.income_margin,
    profit: d.net_profit_opex_dep,
    roi: d.roi,
  }));

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
          <div className="pnl-header-actions">
            <Link href="/pnl-import" className="pnl-btn-icon">
              <Upload style={{ width: 16, height: 16 }} />
              Import Data
            </Link>
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

        {/* Charts Section */}
        <div className="pnl-charts-section">
          <div className="pnl-chart-card">
            <h3>Revenue & Profit Trend</h3>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: `1px solid var(--border)` }} />
                <Legend />
                <Bar dataKey="sales" fill="var(--green)" name="Gross Sales" />
                <Line type="monotone" dataKey="profit" stroke="var(--blue)" name="Net Profit" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="pnl-chart-card">
            <h3>ROI Trend</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: `1px solid var(--border)` }} />
                <Line
                  type="monotone"
                  dataKey="roi"
                  stroke="var(--amber)"
                  name="ROI %"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
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
                label="Gross Sales"
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
                    <td>Gross Sales</td>
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
