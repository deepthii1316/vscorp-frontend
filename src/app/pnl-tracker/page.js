'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Zap, Users, Building2, Calendar } from 'lucide-react';
import RequireAuth from '@/components/RequireAuth';

const PNL_DATA = {
  store: {
    name: 'REEBOK UPPAL',
    code: '323865',
    brand: 'Regular',
    carpetSqft: 1200,
  },
  months: {
    'Jul-2026': {
      month: 'July 2026',
      sale: 880354,
      rent: 525000,
      staffSalaries: 160519,
      electricity: 48454,
      telephone: 3536,
      pettyCash: 75244,
      houseKeeping: 5000,
      staffIncentives: 0,
      bankEDC: 3875,
      bankUPI: 542,
      incomeMargin: 369748,
      depreciation: 88842,
      fundsCost: 83905,
      netProfitOpex: -452422,
      roi: -5.39,
    },
    'Aug-2026': {
      month: 'August 2026',
      sale: 847984,
      rent: 210000,
      staffSalaries: 115906,
      electricity: 41724,
      telephone: 0,
      pettyCash: 28400,
      houseKeeping: 5000,
      staffIncentives: 20650,
      bankEDC: 6083,
      bankUPI: 0,
      incomeMargin: 356153,
      depreciation: 88842,
      fundsCost: 83905,
      netProfitOpex: -71610,
      roi: -0.85,
    },
    'Sep-2026': {
      month: 'September 2026',
      sale: 528254,
      rent: 210000,
      staffSalaries: 0,
      electricity: 0,
      telephone: 0,
      pettyCash: 0,
      houseKeeping: 5000,
      staffIncentives: 0,
      bankEDC: 0,
      bankUPI: 0,
      incomeMargin: 221867,
      depreciation: 88842,
      fundsCost: 83905,
      netProfitOpex: 6867,
      roi: 0.08,
    },
  },
};

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

function MonthPanel({ month, data }) {
  const totalOpex = data.rent + data.staffSalaries + data.electricity + data.telephone +
                   data.pettyCash + data.houseKeeping + data.staffIncentives +
                   data.bankEDC + data.bankUPI;
  const netProfitWithDep = data.netProfitOpex - data.depreciation;
  const netProfitWithDepFunds = netProfitWithDep - data.fundsCost;

  return (
    <div className="pnl-month-panel">
      <div className="pnl-month-header">
        <Calendar style={{ width: 18, height: 18 }} />
        <h3>{data.month}</h3>
      </div>

      <div className="pnl-metrics-grid">
        <StatCard
          label="Gross Sales"
          value={formatINR(data.sale)}
          icon={DollarSign}
          color="var(--green)"
        />
        <StatCard
          label="Income Margin"
          value={formatINR(data.incomeMargin)}
          icon={TrendingUp}
          color="var(--blue)"
        />
        <StatCard
          label="Total Opex"
          value={formatINR(totalOpex)}
          icon={Zap}
          color="var(--amber)"
        />
        <StatCard
          label="Operating Profit"
          value={formatINR(data.incomeMargin - totalOpex)}
          icon={DollarSign}
          color={data.incomeMargin - totalOpex >= 0 ? 'var(--green)' : 'var(--rose)'}
        />
        <StatCard
          label="Depreciation"
          value={formatINR(data.depreciation)}
          color="var(--text-muted)"
        />
        <StatCard
          label="Funds Cost"
          value={formatINR(data.fundsCost)}
          color="var(--text-muted)"
        />
        <StatCard
          label="Net Profit (Opex + Dep)"
          value={formatINR(netProfitWithDep)}
          color={netProfitWithDep >= 0 ? 'var(--green)' : 'var(--rose)'}
        />
        <StatCard
          label="Net Profit (All Costs)"
          value={formatINR(netProfitWithDepFunds)}
          color={netProfitWithDepFunds >= 0 ? 'var(--green)' : 'var(--rose)'}
        />
        <StatCard
          label="ROI"
          value={formatPct(data.roi)}
          trend={data.roi}
          color="var(--text-muted)"
        />
      </div>

      <div className="pnl-expense-breakdown">
        <h4>Operating Expense Breakdown</h4>
        <div className="pnl-expense-list">
          {[
            { label: 'Rent + CAM', value: data.rent },
            { label: 'Staff Salaries', value: data.staffSalaries },
            { label: 'Electricity Bill', value: data.electricity },
            { label: 'Telephone & Internet', value: data.telephone },
            { label: 'Petty Cash', value: data.pettyCash },
            { label: 'House Keeping', value: data.houseKeeping },
            { label: 'Staff Incentives', value: data.staffIncentives },
            { label: 'Bank EDC Charges', value: data.bankEDC },
            { label: 'Bank UPI Charges', value: data.bankUPI },
          ].map((item, idx) => (
            <div key={idx} className="pnl-expense-row">
              <span className="pnl-expense-label">{item.label}</span>
              <span className="pnl-expense-value">{formatINR(item.value)}</span>
            </div>
          ))}
          <div className="pnl-expense-total">
            <span>Total Operating Expenditure</span>
            <span>{formatINR(totalOpex)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PNLTrackerInner() {
  const [selectedMonth, setSelectedMonth] = useState('Jul-2026');
  const months = Object.keys(PNL_DATA.months);
  const currentData = PNL_DATA.months[selectedMonth];

  return (
    <div className="pnl-page-wrapper">
      <div className="pnl-page-container">
        {/* Header */}
        <div className="pnl-page-header">
          <div>
            <h1 className="pnl-page-title">P&L Tracker</h1>
            <p className="pnl-page-subtitle">
              {PNL_DATA.store.name} • Store {PNL_DATA.store.code}
            </p>
          </div>
          <div className="pnl-store-info">
            <div className="pnl-info-item">
              <Building2 style={{ width: 16, height: 16 }} />
              <span>1,200 sq.ft</span>
            </div>
            <div className="pnl-info-item">
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Regular Store</span>
            </div>
          </div>
        </div>

        {/* Month Selector */}
        <div className="pnl-month-selector">
          {months.map((m) => (
            <button
              key={m}
              className={`pnl-month-btn ${selectedMonth === m ? 'active' : ''}`}
              onClick={() => setSelectedMonth(m)}
            >
              {PNL_DATA.months[m].month}
            </button>
          ))}
        </div>

        {/* Current Month Panel */}
        {currentData && <MonthPanel month={selectedMonth} data={currentData} />}

        {/* Comparison Summary */}
        <div className="pnl-comparison-section">
          <h2>Monthly Comparison</h2>
          <div className="pnl-comparison-table">
            <table>
              <thead>
                <tr>
                  <th>Metric</th>
                  {months.map((m) => (
                    <th key={m}>{PNL_DATA.months[m].month}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Gross Sales</td>
                  {months.map((m) => (
                    <td key={m} className="pnl-table-value">{formatINR(PNL_DATA.months[m].sale)}</td>
                  ))}
                </tr>
                <tr>
                  <td>Total Opex</td>
                  {months.map((m) => {
                    const data = PNL_DATA.months[m];
                    const total = data.rent + data.staffSalaries + data.electricity + data.telephone +
                                data.pettyCash + data.houseKeeping + data.staffIncentives +
                                data.bankEDC + data.bankUPI;
                    return <td key={m} className="pnl-table-value">{formatINR(total)}</td>;
                  })}
                </tr>
                <tr>
                  <td>Income Margin</td>
                  {months.map((m) => (
                    <td key={m} className="pnl-table-value">{formatINR(PNL_DATA.months[m].incomeMargin)}</td>
                  ))}
                </tr>
                <tr className="pnl-table-highlight">
                  <td>Net Profit (Opex Only)</td>
                  {months.map((m) => (
                    <td key={m} className={`pnl-table-value ${PNL_DATA.months[m].netProfitOpex >= 0 ? 'positive' : 'negative'}`}>
                      {formatINR(PNL_DATA.months[m].netProfitOpex)}
                    </td>
                  ))}
                </tr>
                <tr className="pnl-table-highlight">
                  <td>ROI (%)</td>
                  {months.map((m) => (
                    <td key={m} className={`pnl-table-value ${PNL_DATA.months[m].roi >= 0 ? 'positive' : 'negative'}`}>
                      {formatPct(PNL_DATA.months[m].roi)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
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
