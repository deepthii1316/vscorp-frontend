'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, RefreshCw, AlertCircle, HelpCircle } from 'lucide-react';
import RequireAuth from '@/components/RequireAuth';
import { apiFetch } from '@/lib/api';
import {
  formatINRFull, formatNumber, formatPercent, MONTH_NAMES,
  sumDays, kpisFrom,
} from '@/lib/storeBoardShared';
import './store-board.css';

const DEFAULT_DATE_MODE = 'mtd';
const STORE_NAME = 'UPPAL';
const STORE_ID = 'R1157';

function getDateRangeForMode(mode, latestDate) {
  if (!latestDate) return null;
  const latest = new Date(latestDate + 'T00:00:00Z');
  const year = latest.getUTCFullYear();
  const month = latest.getUTCMonth();
  const date = latest.getUTCDate();

  switch (mode) {
    case 'today':
      return { start: latestDate, end: latestDate };
    case 'wtd': {
      const dayOfWeek = latest.getUTCDay();
      const daysBack = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const start = new Date(Date.UTC(year, month, date - daysBack));
      return { start: start.toISOString().split('T')[0], end: latestDate };
    }
    case 'mtd':
      return { start: `${year}-${String(month + 1).padStart(2, '0')}-01`, end: latestDate };
    case 'ytd':
      return { start: `${year}-01-01`, end: latestDate };
    default:
      return null;
  }
}

/**
 * Expandable row wrapper
 */
function ExpandableRow({ label, isExpanded, onToggle, children, level = 0 }) {
  const indent = level * 20;
  return (
    <>
      <tr className={`sb-expandable-row level-${level}`} style={{ paddingLeft: `${indent}px` }}>
        <td colSpan="100%" onClick={onToggle} style={{ cursor: 'pointer', paddingLeft: `${indent + 16}px` }}>
          <span className="sb-expand-icon">
            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </span>
          {label}
        </td>
      </tr>
      {isExpanded && children}
    </>
  );
}

/**
 * Target vs Achievement Panel
 */
function TargetVsAchievementPanel({ days, prevDays, latestDate }) {
  const current = kpisFrom(days);
  const previous = kpisFrom(prevDays);

  // October 2026: ₹10,00,000 store monthly target
  const STORE_MONTHLY_TARGET = 1000000;

  const periods = [
    {
      label: 'WTD',
      target: 0, // Calculated from date range
      actual: current.revenue,
      qtyTarget: 0,
      qtyActual: current.units,
    },
    {
      label: 'MTD',
      target: STORE_MONTHLY_TARGET,
      actual: current.revenue,
      qtyTarget: 0,
      qtyActual: current.units,
    },
    {
      label: 'YTD',
      target: 0, // Calculated from July
      actual: current.revenue,
      qtyTarget: 0,
      qtyActual: current.units,
    },
  ];

  return (
    <div className="sb-panel">
      <h3 className="sb-panel-title">TARGET VS ACHIEVEMENT</h3>
      <table className="sb-table">
        <thead>
          <tr>
            <th>Period</th>
            <th>Target</th>
            <th>Actual</th>
            <th>Gap</th>
            <th>Qty Target</th>
            <th>Actual Qty</th>
            <th>Achievement</th>
            <th>L2L %</th>
          </tr>
        </thead>
        <tbody>
          {periods.map((p) => {
            const gap = p.actual - p.target;
            const achievement = (p.actual / p.target) * 100;
            const l2l = previous.revenue > 0 ? ((current.revenue - previous.revenue) / previous.revenue) * 100 : null;
            const achievementClass = achievement >= 100 ? 'positive' : achievement >= 75 ? 'warning' : 'negative';

            return (
              <tr key={p.label}>
                <td className="sb-label">{p.label}</td>
                <td className="sb-currency">{formatINRFull(p.target)}</td>
                <td className="sb-currency">{formatINRFull(p.actual)}</td>
                <td className={`sb-currency ${gap >= 0 ? 'positive' : 'negative'}`}>
                  {formatINRFull(gap)}
                </td>
                <td className="sb-number">{formatNumber(p.qtyTarget)}</td>
                <td className="sb-number">{formatNumber(p.qtyActual)}</td>
                <td className={`sb-percent ${achievementClass}`}>
                  {formatPercent(achievement, 1)}
                </td>
                <td className="sb-percent">
                  {l2l !== null ? formatPercent(l2l, 1) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Weekly Business Plan Panel
 */
function WeeklyBusinessPlanPanel({ days, latestDate }) {
  const current = kpisFrom(days);
  // October 2026: ₹10,00,000 store monthly target
  const STORE_MONTHLY_TARGET = 1000000;

  const weeks = [
    { label: 'Week 1', dateRange: '01 Oct - 07 Oct', target: STORE_MONTHLY_TARGET * 0.25 },
    { label: 'Week 2', dateRange: '08 Oct - 14 Oct', target: STORE_MONTHLY_TARGET * 0.20 },
    { label: 'Week 3', dateRange: '15 Oct - 21 Oct', target: STORE_MONTHLY_TARGET * 0.20 },
    { label: 'Week 4', dateRange: '22 Oct - 28 Oct', target: STORE_MONTHLY_TARGET * 0.20 },
    { label: 'Week 5', dateRange: '29 Oct - 31 Oct', target: STORE_MONTHLY_TARGET * 0.15 },
  ];

  const [expanded, setExpanded] = useState({ 'Week 1': true });

  return (
    <div className="sb-panel">
      <div className="sb-panel-header">
        <h3 className="sb-panel-title">WEEKLY BUSINESS PLAN</h3>
        <span className="sb-panel-date">October 2026</span>
      </div>
      <table className="sb-table">
        <thead>
          <tr>
            <th>Week</th>
            <th>Period</th>
            <th>Target</th>
            <th>Actual</th>
            <th>%</th>
            <th>Gap</th>
            <th>Ach %</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => {
            const isExpanded = expanded[week.label];
            return (
              <tr key={week.label} className="sb-week-row">
                <td className="sb-week-label">
                  <span
                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                    onClick={() => setExpanded({ ...expanded, [week.label]: !isExpanded })}
                  >
                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    {week.label}
                  </span>
                </td>
                <td className="sb-date-range">{week.dateRange}</td>
                <td className="sb-currency">{formatINRFull(week.target)}</td>
                <td className="sb-currency">₹—</td>
                <td className="sb-percent">—</td>
                <td className="sb-currency">₹—</td>
                <td className="sb-percent">—</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Individual Performance Panel
 */
function IndividualPerformancePanel({ days, latestDate }) {
  const salespeople = [
    { name: 'A Nagesh Babu', actual: 57150.7, qty: 29 },
    { name: 'Yusuf Ahamad', actual: 44444.3, qty: 15 },
    { name: 'Manne Nilish Kumar', actual: 18797, qty: 4 },
    { name: 'Vibha Kumari', actual: 17997.2, qty: 3 },
    { name: 'Priyanka Ray', actual: 5249.3, qty: 1 },
  ];

  // October 2026: ₹4,00,000 per individual salesperson
  const PER_PERSON_TARGET = 400000;

  return (
    <div className="sb-panel">
      <div className="sb-panel-header">
        <h3 className="sb-panel-title">INDIVIDUAL PERFORMANCE</h3>
        <span className="sb-panel-date">October 2026 | Edit History</span>
      </div>
      <table className="sb-table">
        <thead>
          <tr>
            <th>Salesperson</th>
            <th>Target</th>
            <th>Actual</th>
            <th>Gap</th>
            <th>Qty Target</th>
            <th>Actual Qty</th>
            <th>Achievement</th>
          </tr>
        </thead>
        <tbody>
          {salespeople.map((person) => (
            <tr key={person.name}>
              <td className="sb-name">{person.name}</td>
              <td className="sb-currency">—</td>
              <td className="sb-currency">{formatINRFull(person.actual)}</td>
              <td className="sb-currency">—</td>
              <td className="sb-number">—</td>
              <td className="sb-number">{person.qty}</td>
              <td className="sb-percent">—</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Merchandise Mix Panel
 */
function MerchandiseMixPanel({ days, prevDays }) {
  const current = kpisFrom(days);
  const previous = kpisFrom(prevDays);
  const [expanded, setExpanded] = useState({ Footwear: true, Apparel: true, Accessories: true });

  const categories = [
    {
      name: 'Footwear',
      qty: current.footwear_qty,
      lyQty: 39,
      rsv: 113334,
      lyRsv: 226412.71,
      contribution: 78.9,
    },
    {
      name: 'Apparel',
      qty: current.apparel_qty,
      lyQty: 1,
      rsv: 20159.7,
      lyRsv: 1888.53,
      contribution: 14.0,
    },
    {
      name: 'Accessories',
      qty: current.accessories_qty,
      lyQty: 19,
      rsv: 10144.8,
      lyRsv: 11492,
      contribution: 7.1,
    },
  ];

  return (
    <div className="sb-panel">
      <div className="sb-panel-header">
        <h3 className="sb-panel-title">MERCHANDISE MIX</h3>
        <span className="sb-mix-note">Division · Section · Article (Footwear: Open/Closed · Article · Section)</span>
      </div>
      <table className="sb-table">
        <thead>
          <tr>
            <th>Category</th>
            <th>Qty</th>
            <th>LY Qty</th>
            <th>Qty L2L</th>
            <th>RSV</th>
            <th>LY RSV</th>
            <th>L2L</th>
            <th>Contribution</th>
          </tr>
        </thead>
        <tbody>
          {categories.map((cat) => {
            const l2l = previous.footwear_qty > 0 ? ((cat.qty - cat.lyQty) / cat.lyQty) * 100 : 0;
            const rsv_l2l = cat.lyRsv > 0 ? ((cat.rsv - cat.lyRsv) / cat.lyRsv) * 100 : 0;
            return (
              <tr key={cat.name}>
                <td className="sb-category">
                  <span
                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                    onClick={() => setExpanded({ ...expanded, [cat.name]: !expanded[cat.name] })}
                  >
                    {expanded[cat.name] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    {cat.name}
                  </span>
                </td>
                <td className="sb-number">{formatNumber(cat.qty)}</td>
                <td className="sb-number">{formatNumber(cat.lyQty)}</td>
                <td className={`sb-percent ${l2l >= 0 ? 'positive' : 'negative'}`}>
                  {formatPercent(l2l, 1)}
                </td>
                <td className="sb-currency">{formatINRFull(cat.rsv)}</td>
                <td className="sb-currency">{formatINRFull(cat.lyRsv)}</td>
                <td className={`sb-percent ${rsv_l2l >= 0 ? 'positive' : 'negative'}`}>
                  {formatPercent(rsv_l2l, 1)}
                </td>
                <td className="sb-percent">{formatPercent(cat.contribution, 1)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Footwear by Department Panel
 */
function FootwearByDepartmentPanel({ days, prevDays }) {
  const current = kpisFrom(days);

  return (
    <div className="sb-panel">
      <div className="sb-panel-header">
        <h3 className="sb-panel-title">FOOTWEAR — BY DEPARTMENT</h3>
        <span className="sb-mix-note">Open/Closed · Department · Section</span>
      </div>
      <table className="sb-table">
        <thead>
          <tr>
            <th>Category</th>
            <th>Qty</th>
            <th>LY Qty</th>
            <th>Qty L2L</th>
            <th>RSV</th>
            <th>LY RSV</th>
            <th>L2L</th>
            <th>Contribution</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="sb-category">
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ChevronDown size={16} /> Closed Footwear
              </span>
            </td>
            <td className="sb-number">22</td>
            <td className="sb-number">36</td>
            <td className="sb-percent negative">-39.9%</td>
            <td className="sb-currency">₹1,13,334</td>
            <td className="sb-currency">₹2,26,412.71</td>
            <td className="sb-percent negative">-49.9%</td>
            <td className="sb-percent">100.0%</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/**
 * Annual Business Plan Panel
 */
function AnnualBusinessPlanPanel({ days, latestDate }) {
  const current = kpisFrom(days);
  // Real data from database will be populated here
  // For now using placeholder structure - will be replaced with actual data
  const months = [
    { name: 'Jan', ly: 0, target: 0, actual: 0 },
    { name: 'Feb', ly: 0, target: 0, actual: 0 },
    { name: 'Mar', ly: 0, target: 0, actual: 0 },
    { name: 'Apr', ly: 0, target: 0, actual: 0 },
    { name: 'May', ly: 0, target: 0, actual: 0 },
    { name: 'Jun', ly: 0, target: 0, actual: 0 },
    { name: 'Jul', ly: 0, target: 0, actual: 0 },
    { name: 'Aug', ly: 0, target: 0, actual: 0 },
    { name: 'Sep', ly: 0, target: 0, actual: 0 },
    { name: 'Oct', ly: 0, target: 1000000, actual: current.revenue, isCurrent: true },
  ];

  return (
    <div className="sb-panel">
      <div className="sb-panel-header">
        <h3 className="sb-panel-title">ANNUAL BUSINESS PLAN</h3>
        <span className="sb-panel-date">2026</span>
      </div>
      <table className="sb-table">
        <thead>
          <tr>
            <th>Month</th>
            <th>LY Revenue</th>
            <th>LY Target</th>
            <th>Target</th>
            <th>Actual</th>
            <th>Ach %</th>
            <th>L2L %</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => {
            const ach = (m.actual / m.target) * 100;
            const l2l = (m.actual / m.ly - 1) * 100;
            return (
              <tr key={m.name} className={m.isCurrent ? 'sb-current-month' : ''}>
                <td className={`sb-label ${m.isCurrent ? 'current' : ''}`}>{m.isCurrent && '● '}{m.name}</td>
                <td className="sb-currency">{formatINRFull(m.ly)}</td>
                <td className="sb-currency sb-muted">{formatINRFull(m.target)}</td>
                <td className="sb-currency">{formatINRFull(m.target)}</td>
                <td className="sb-currency">{formatINRFull(m.actual)}</td>
                <td className={`sb-percent ${ach >= 100 ? 'positive' : ach >= 75 ? 'warning' : 'negative'}`}>
                  {formatPercent(ach, 1)}
                </td>
                <td className={`sb-percent ${l2l >= 0 ? 'positive' : 'negative'}`}>
                  {formatPercent(l2l, 1)}
                </td>
              </tr>
            );
          })}
          <tr className="sb-ytd-row">
            <td className="sb-label sb-bold">YTD</td>
            <td className="sb-currency sb-bold">₹2,2Cr</td>
            <td className="sb-currency sb-bold sb-muted">₹3,7Cr</td>
            <td className="sb-currency sb-bold">₹2,8Cr</td>
            <td className="sb-currency sb-bold">₹1,9Cr</td>
            <td className="sb-percent sb-bold negative">65.7%</td>
            <td className="sb-percent sb-bold negative">-19.3%</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/**
 * Store KPIs Panel
 */
function StoreKPIsPanel({ days }) {
  const kpis = kpisFrom(days);

  const kpiDefinitions = {
    Revenue: 'Total net sales',
    ATV: 'Revenue ÷ Distinct Bills',
    UPT: 'Units ÷ Distinct Bills',
    ASP: 'Revenue ÷ Total Units',
    SFR: 'Bills ÷ Footfall Sales-to-Footfall Rate',
    'Conv%': 'Bills ÷ Walkins',
    FUPT: 'Footwear Qty ÷ Distinct Bills',
    'Sock%': 'Socks Qty ÷ Footwear Qty (KPI Dashboard\'s "SFR")',
    SSR: 'Socks Qty ÷ Shoes Qty',
    AFR: 'Apparel Qty ÷ Footwear Qty',
    'MD%': '(MRP - Revenue) ÷ MRP',
  };

  return (
    <div className="sb-panel">
      <h3 className="sb-panel-title">STORE KPIS (MTD)</h3>
      <table className="sb-kpis-table">
        <tbody>
          <tr>
            <td className="sb-kpi-label">Revenue MTD</td>
            <td className="sb-kpi-value">{formatINRFull(kpis.revenue)}</td>
            <td className="sb-kpi-def">
              <HelpCircle size={14} title={kpiDefinitions.Revenue} />
            </td>
          </tr>
          <tr>
            <td className="sb-kpi-label">ATV</td>
            <td className="sb-kpi-value">{formatINRFull(kpis.atv)}</td>
            <td className="sb-kpi-def">
              <HelpCircle size={14} title={kpiDefinitions.ATV} />
            </td>
          </tr>
          <tr>
            <td className="sb-kpi-label">UPT</td>
            <td className="sb-kpi-value">{formatNumber(kpis.upt, 2)}</td>
            <td className="sb-kpi-def">
              <HelpCircle size={14} title={kpiDefinitions.UPT} />
            </td>
          </tr>
          <tr>
            <td className="sb-kpi-label">ASP</td>
            <td className="sb-kpi-value">{formatINRFull(kpis.asp)}</td>
            <td className="sb-kpi-def">
              <HelpCircle size={14} title={kpiDefinitions.ASP} />
            </td>
          </tr>
          <tr>
            <td className="sb-kpi-label">SFR</td>
            <td className="sb-kpi-value">{formatPercent(kpis.sfr, 1)}</td>
            <td className="sb-kpi-def">
              <HelpCircle size={14} title={kpiDefinitions.SFR} />
            </td>
          </tr>
          <tr>
            <td className="sb-kpi-label">Conv%</td>
            <td className="sb-kpi-value">{formatPercent(kpis.sfr, 1)}</td>
            <td className="sb-kpi-def">
              <HelpCircle size={14} title={kpiDefinitions['Conv%']} />
            </td>
          </tr>
          <tr>
            <td className="sb-kpi-label">FUPT</td>
            <td className="sb-kpi-value">{formatNumber(kpis.fupt, 2)}</td>
            <td className="sb-kpi-def">
              <HelpCircle size={14} title={kpiDefinitions.FUPT} />
            </td>
          </tr>
          <tr>
            <td className="sb-kpi-label">Sock%</td>
            <td className="sb-kpi-value">{formatPercent(kpis.sockPercent, 1)}</td>
            <td className="sb-kpi-def">
              <HelpCircle size={14} title={kpiDefinitions['Sock%']} />
            </td>
          </tr>
          <tr>
            <td className="sb-kpi-label">SSR</td>
            <td className="sb-kpi-value">{formatPercent(kpis.ssr, 1)}</td>
            <td className="sb-kpi-def">
              <HelpCircle size={14} title={kpiDefinitions.SSR} />
            </td>
          </tr>
          <tr>
            <td className="sb-kpi-label">AFR</td>
            <td className="sb-kpi-value">{formatPercent(kpis.afr, 1)}</td>
            <td className="sb-kpi-def">
              <HelpCircle size={14} title={kpiDefinitions.AFR} />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/**
 * Footfall Analytics Panel
 */
function FootfallAnalyticsPanel({ days }) {
  const current = kpisFrom(days);
  const conv = current.walkins > 0 ? (current.bills / current.walkins) * 100 : 0;

  return (
    <div className="sb-panel">
      <h3 className="sb-panel-title">FOOTFALL ANALYTICS</h3>
      <table className="sb-kpis-table">
        <tbody>
          <tr>
            <td className="sb-kpi-label">Footfall</td>
            <td className="sb-kpi-value">{formatNumber(current.walkins)}</td>
          </tr>
          <tr>
            <td className="sb-kpi-label">Conversion %</td>
            <td className="sb-kpi-value">{formatPercent(conv, 2)}</td>
          </tr>
          <tr>
            <td className="sb-kpi-label">Gender Split (M/F)</td>
            <td className="sb-kpi-value">—</td>
          </tr>
          <tr>
            <td className="sb-kpi-label">Age Groups</td>
            <td className="sb-kpi-value" style={{ color: 'var(--text-muted)' }}>No data source available</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/**
 * Filter Bar
 */
function FilterBar({ dateMode, onDateModeChange, latestDate, isLoading }) {
  return (
    <div className="sb-top-bar">
      <div className="sb-top-left">
        <div className="sb-title-section">
          <h1>Store Board</h1>
          <span className="sb-store-path">{STORE_NAME}</span>
        </div>
      </div>
      <div className="sb-top-right">
        <div className="sb-date-info">
          <span>Refresh</span>
          <span>Print</span>
        </div>
      </div>
    </div>
  );
}

function StoreBoardContent() {
  const [dateMode, setDateMode] = useState(DEFAULT_DATE_MODE);
  const [bounds, setBounds] = useState({ firstDate: null, latestDate: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  const { firstDate, latestDate } = bounds;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch('/api/store-board?meta=1');
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
        if (cancelled) return;
        if (!json.latestDate) {
          setError('No sales data available for Uppal store.');
          setLoading(false);
          return;
        }
        setBounds({ firstDate: json.firstDate, latestDate: json.latestDate });
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!latestDate) return;

    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const range = getDateRangeForMode(dateMode, latestDate);
        if (!range) return;

        const params = new URLSearchParams({
          startDate: range.start,
          endDate: range.end,
        });
        const res = await apiFetch(`/api/store-board?${params}`);
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
        if (cancelled) return;
        setData(json);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [dateMode, latestDate]);

  if (error) {
    return (
      <div className="sb-error">
        <AlertCircle style={{ width: '32px', height: '32px' }} />
        <h2>Unable to load Store Board</h2>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="store-board-container">
      <FilterBar dateMode={dateMode} onDateModeChange={setDateMode} latestDate={latestDate} isLoading={loading} />

      <div className="sb-mode-bar">
        {['TODAY', 'WTD', 'MTD', 'YTD'].map((mode) => (
          <button
            key={mode}
            className={`sb-mode-btn ${dateMode === mode.toLowerCase() ? 'active' : ''}`}
            onClick={() => setDateMode(mode.toLowerCase())}
          >
            {mode}
          </button>
        ))}
        {latestDate && (
          <span className="sb-data-badge">
            📅 Data through: {new Date(latestDate + 'T00:00:00Z').toLocaleDateString('en-IN')} | Mix & KPIs: MTD · Achievement always: WTD / MTD / YTD
          </span>
        )}
      </div>

      {loading ? (
        <div className="sb-loading">
          <div className="sb-spinner"></div>
          <p>Loading Store Board...</p>
        </div>
      ) : (
        data && (
          <div className="sb-content">
            <TargetVsAchievementPanel days={data.days} prevDays={data.prevDays} latestDate={latestDate} />
            <WeeklyBusinessPlanPanel days={data.days} latestDate={latestDate} />
            <IndividualPerformancePanel days={data.days} latestDate={latestDate} />
            <MerchandiseMixPanel days={data.days} prevDays={data.prevDays} />
            <FootwearByDepartmentPanel days={data.days} prevDays={data.prevDays} />
            <AnnualBusinessPlanPanel days={data.days} latestDate={latestDate} />
            <div className="sb-bottom-panels">
              <StoreKPIsPanel days={data.days} />
              <FootfallAnalyticsPanel days={data.days} />
            </div>
          </div>
        )
      )}
    </div>
  );
}

export default function StoreBoardPage() {
  return (
    <RequireAuth roles={['admin']}>
      <StoreBoardContent />
    </RequireAuth>
  );
}
