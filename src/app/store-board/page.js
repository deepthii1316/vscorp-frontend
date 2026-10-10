'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, RefreshCw, AlertCircle, HelpCircle } from 'lucide-react';
import RequireAuth from '@/components/RequireAuth';
import { apiFetch } from '@/lib/api';
import {
  formatINRFull, formatNumber, formatPercent, MONTH_NAMES,
  sumDays, kpisFrom,
} from '@/lib/storeBoardShared';
import { monthlyTarget, monthlyStaffTarget, MTD_TARGET, YTD_TARGET } from '@/lib/email/reebokHelpers';
import './store-board.css';

const DEFAULT_DATE_MODE = 'ytd';
const STORE_NAME = 'UPPAL';
const STORE_ID = 'R1157';

function getDateRangeForMode(mode, latestDate, customStart, customEnd) {
  if (!latestDate) return null;

  if (mode === 'custom' && customStart && customEnd) {
    return { start: customStart, end: customEnd };
  }

  const latest = new Date(latestDate + 'T00:00:00Z');
  const year = latest.getUTCFullYear();
  const month = latest.getUTCMonth(); // 0-11
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
    case 'ytd': {
      // Fiscal year starts July 1 (month 6)
      // If current month >= July (6), YTD start is July of current year
      // If current month < July, YTD start is July of previous year
      const ytdYear = month >= 6 ? year : year - 1;
      return { start: `${ytdYear}-07-01`, end: latestDate };
    }
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
            // Handle zero/missing target safely
            const hasTarget = p.target && p.target > 0;
            const hasActual = p.actual && p.actual > 0;

            const gap = hasTarget ? p.actual - p.target : 0;
            const achievement = hasTarget && hasActual ? (p.actual / p.target) * 100 : 0;
            const hasPrevious = previous.revenue && previous.revenue > 0;
            const l2l = hasPrevious && hasActual ? ((current.revenue - previous.revenue) / previous.revenue) * 100 : null;

            const achievementClass = !hasTarget ? 'neutral' : achievement >= 100 ? 'positive' : achievement >= 75 ? 'warning' : 'negative';

            return (
              <tr key={p.label}>
                <td className="sb-label">{p.label}</td>
                <td className="sb-currency">{hasTarget ? formatINRFull(p.target) : '—'}</td>
                <td className="sb-currency">{hasActual ? formatINRFull(p.actual) : '—'}</td>
                <td className={`sb-currency ${gap >= 0 ? 'positive' : 'negative'}`}>
                  {hasTarget && hasActual ? formatINRFull(gap) : '—'}
                </td>
                <td className="sb-number">{p.qtyTarget ? formatNumber(p.qtyTarget) : '—'}</td>
                <td className="sb-number">{p.qtyActual ? formatNumber(p.qtyActual) : '—'}</td>
                <td className={`sb-percent ${achievementClass}`}>
                  {hasTarget && hasActual ? formatPercent(achievement, 1) : '—'}
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
            const dayCount = week.dateRange.includes('-') ? 7 : 3; // Approx days in week
            const dayTarget = week.target / dayCount;

            return (
              <>
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
                {isExpanded && (
                  <tr style={{ backgroundColor: '#f9f9f9' }}>
                    <td colSpan="7" style={{ padding: '0' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <tbody>
                          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].slice(0, dayCount).map((day, idx) => (
                            <tr key={`${week.label}-${day}`} style={{ borderTop: '1px solid #e5e7eb' }}>
                              <td style={{ padding: '8px 12px', paddingLeft: '40px', fontSize: '12px', color: '#666' }}>{day}</td>
                              <td style={{ padding: '8px 12px' }}></td>
                              <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: '13px' }}>{formatINRFull(dayTarget)}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: '13px' }}>₹—</td>
                              <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: '12px' }}>—</td>
                              <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: '13px' }}>₹—</td>
                              <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: '12px' }}>—</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Individual Performance Panel - Real salesperson data
 */
function IndividualPerformancePanel({ days, latestDate, salespersonData }) {
  // Real salespeople: BALRAJ GADDAM, RAMBABU DHARAVATH, ERRI SRIJA
  const SALESPERSON_NAMES = ['BALRAJ GADDAM', 'RAMBABU DHARAVATH', 'ERRI SRIJA'];

  // Map RPC data to salesperson list
  const salespeople = SALESPERSON_NAMES.map((name) => {
    const rpData = (salespersonData || []).find(row => row.salesperson_name === name && row.period_type === 'mtd');
    return {
      name,
      actual: rpData?.nsv || 0,
      qty: rpData?.qty_sold || 0,
    };
  });

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
          {salespeople.map((person) => {
            const hasActual = person.actual && person.actual > 0;
            const hasQty = person.qty && person.qty > 0;
            const achievement = PER_PERSON_TARGET && hasActual ? (person.actual / PER_PERSON_TARGET) * 100 : 0;

            return (
              <tr key={person.name}>
                <td className="sb-name">{person.name}</td>
                <td className="sb-currency">{formatINRFull(PER_PERSON_TARGET)}</td>
                <td className="sb-currency">{hasActual ? formatINRFull(person.actual) : '—'}</td>
                <td className="sb-currency">{hasActual ? formatINRFull(person.actual - PER_PERSON_TARGET) : '—'}</td>
                <td className="sb-number">—</td>
                <td className="sb-number">{hasQty ? formatNumber(person.qty) : '—'}</td>
                <td className={`sb-percent ${achievement >= 100 ? 'positive' : achievement >= 75 ? 'warning' : 'negative'}`}>
                  {hasActual ? formatPercent(achievement, 1) : '—'}
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
            <th>Prev Qty</th>
            <th>Qty M2M</th>
            <th>RSV</th>
            <th>Prev RSV</th>
            <th>M2M</th>
            <th>Contribution</th>
          </tr>
        </thead>
        <tbody>
          {categories.map((cat) => {
            const m2m = previous.footwear_qty > 0 ? ((cat.qty - cat.lyQty) / cat.lyQty) * 100 : 0;
            const rsv_m2m = cat.lyRsv > 0 ? ((cat.rsv - cat.lyRsv) / cat.lyRsv) * 100 : 0;
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
                <td className={`sb-percent ${m2m >= 0 ? 'positive' : 'negative'}`}>
                  {formatPercent(m2m, 1)}
                </td>
                <td className="sb-currency">{formatINRFull(cat.rsv)}</td>
                <td className="sb-currency">{formatINRFull(cat.lyRsv)}</td>
                <td className={`sb-percent ${rsv_m2m >= 0 ? 'positive' : 'negative'}`}>
                  {formatPercent(rsv_m2m, 1)}
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
            <th>Prev Qty</th>
            <th>Qty M2M</th>
            <th>RSV</th>
            <th>Prev RSV</th>
            <th>M2M</th>
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
 * Annual Business Plan Panel - Store started July 2026
 */
function AnnualBusinessPlanPanel({ days, latestDate }) {
  const current = kpisFrom(days);

  // Group days by month and sum revenue
  const monthlyRevenue = {};
  days.forEach(day => {
    if (day.full_date) {
      const monthKey = day.full_date.slice(0, 7); // 'YYYY-MM'
      monthlyRevenue[monthKey] = (monthlyRevenue[monthKey] || 0) + (day.nsv || 0);
    }
  });

  // Store started July 2026, so only show Jul-Oct 2026
  // Use reebokHelpers to get actual targets for each month
  const months = [
    { name: 'Jul', date: '2026-07-01', target: monthlyTarget('2026-07-01'), actual: monthlyRevenue['2026-07'] || 0 },
    { name: 'Aug', date: '2026-08-01', target: monthlyTarget('2026-08-01'), actual: monthlyRevenue['2026-08'] || 0 },
    { name: 'Sep', date: '2026-09-01', target: monthlyTarget('2026-09-01'), actual: monthlyRevenue['2026-09'] || 0 },
    { name: 'Oct', date: '2026-10-01', target: monthlyTarget('2026-10-01'), actual: monthlyRevenue['2026-10'] || 0, isCurrent: true },
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
            <th>Target</th>
            <th>Actual</th>
            <th>Ach %</th>
            <th>M2M %</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m, idx) => {
            const ach = m.target > 0 ? (m.actual / m.target) * 100 : 0;
            const prevMonth = idx > 0 ? months[idx - 1] : null;
            const m2m = prevMonth && prevMonth.actual > 0 ? ((m.actual / prevMonth.actual) - 1) * 100 : 0;
            return (
              <tr key={m.name} className={m.isCurrent ? 'sb-current-month' : ''}>
                <td className={`sb-label ${m.isCurrent ? 'current' : ''}`}>{m.isCurrent && '● '}{m.name}</td>
                <td className="sb-currency">{formatINRFull(m.target)}</td>
                <td className="sb-currency">{formatINRFull(m.actual)}</td>
                <td className={`sb-percent ${m.target === 0 ? '' : ach >= 100 ? 'positive' : ach >= 75 ? 'warning' : 'negative'}`}>
                  {m.target === 0 ? '—' : formatPercent(ach, 1)}
                </td>
                <td className={`sb-percent ${prevMonth === null ? '' : m2m >= 0 ? 'positive' : 'negative'}`}>
                  {prevMonth === null ? '—' : formatPercent(m2m, 1)}
                </td>
              </tr>
            );
          })}
          <tr className="sb-ytd-row">
            <td className="sb-label sb-bold">YTD</td>
            <td className="sb-currency sb-bold">{formatINRFull(months.reduce((sum, m) => sum + m.target, 0))}</td>
            <td className="sb-currency sb-bold">{formatINRFull(months.reduce((sum, m) => sum + m.actual, 0))}</td>
            <td className="sb-percent sb-bold">
              {(() => {
                const ytdTarget = months.reduce((sum, m) => sum + m.target, 0);
                const ytdActual = months.reduce((sum, m) => sum + m.actual, 0);
                const ytdAch = ytdTarget > 0 ? (ytdActual / ytdTarget) * 100 : 0;
                return ytdTarget === 0 ? '—' : formatPercent(ytdAch, 1);
              })()}
            </td>
            <td className="sb-percent sb-bold">—</td>
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
          <tr>
            <td className="sb-kpi-label">MD%</td>
            <td className="sb-kpi-value">{kpis.mdPercent !== null && kpis.mdPercent !== undefined ? formatPercent(kpis.mdPercent, 1) : '—'}</td>
            <td className="sb-kpi-def">
              <HelpCircle size={14} title={kpiDefinitions['MD%']} />
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
function FootfallAnalyticsPanel({ days, footfall, latestDate, salespersonData }) {
  const SALESPERSON_NAMES = ['BALRAJ GADDAM', 'RAMBABU DHARAVATH', 'ERRI SRIJA'];

  // Calculate total footfall for the period
  const totalFootfall = footfall && footfall.length > 0
    ? footfall.reduce((sum, row) => sum + (row.footfall || 0), 0)
    : 0;

  // Group footfall by salesperson
  const footfallBySalesperson = {};
  SALESPERSON_NAMES.forEach(name => {
    footfallBySalesperson[name] = footfall && footfall.length > 0
      ? footfall
          .filter(row => row.salesperson_name === name)
          .reduce((sum, row) => sum + (row.footfall || 0), 0)
      : 0;
  });

  // Calculate conversion rate if we have both footfall and sales data
  const current = kpisFrom(days);
  const conv = totalFootfall > 0 ? (current.bills / totalFootfall) * 100 : 0;

  return (
    <div className="sb-panel">
      <div className="sb-panel-header">
        <h3 className="sb-panel-title">FOOTFALL ANALYTICS</h3>
        <span className="sb-panel-date">{latestDate ? new Date(latestDate + 'T00:00:00Z').toLocaleDateString('en-IN') : 'N/A'}</span>
      </div>
      <table className="sb-table">
        <thead>
          <tr>
            <th>Salesperson</th>
            <th>Footfall</th>
            <th>% of Total</th>
          </tr>
        </thead>
        <tbody>
          {SALESPERSON_NAMES.map((name) => {
            const count = footfallBySalesperson[name] || 0;
            const pct = totalFootfall > 0 ? (count / totalFootfall) * 100 : 0;
            return (
              <tr key={name}>
                <td style={{ paddingLeft: '12px' }}>{name}</td>
                <td style={{ textAlign: 'right', paddingRight: '24px' }}>{formatNumber(count)}</td>
                <td style={{ textAlign: 'right', paddingRight: '24px' }}>{formatPercent(pct, 1)}</td>
              </tr>
            );
          })}
          <tr style={{ borderTop: '2px solid var(--border-color)', fontWeight: 'bold', backgroundColor: 'var(--bg-muted)' }}>
            <td style={{ paddingLeft: '12px' }}>STORE TOTAL</td>
            <td style={{ textAlign: 'right', paddingRight: '24px' }}>{formatNumber(totalFootfall)}</td>
            <td style={{ textAlign: 'right', paddingRight: '24px' }}>100.0%</td>
          </tr>
        </tbody>
      </table>
      <div style={{ marginTop: '16px', padding: '12px', backgroundColor: 'var(--bg-muted)', borderRadius: '4px' }}>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Conversion Rate</div>
        <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--primary-color)' }}>
          {totalFootfall > 0 ? formatPercent(conv, 2) : '—'}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
          {totalFootfall > 0 ? `${current.bills || 0} transactions / ${totalFootfall} visitors` : 'No footfall data'}
        </div>
      </div>
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
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
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
        const range = getDateRangeForMode(dateMode, latestDate, customStart, customEnd);
        if (!range) return;

        const params = new URLSearchParams({
          startDate: range.start,
          endDate: range.end,
        });
        const res = await apiFetch(`/api/store-board?${params}`);
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
        if (cancelled) return;
        // Store latestDate with data for target calculation
        setData({ ...json, latestDate });
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [dateMode, latestDate, customStart, customEnd]);

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
        {['TODAY', 'WTD', 'MTD', 'YTD', 'CUSTOM'].map((mode) => (
          <button
            key={mode}
            className={`sb-mode-btn ${dateMode === mode.toLowerCase() ? 'active' : ''}`}
            onClick={() => setDateMode(mode.toLowerCase())}
          >
            {mode}
          </button>
        ))}

        {dateMode === 'custom' && (
          <div className="sb-custom-dates">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              placeholder="Start date"
              className="sb-date-input"
            />
            <span>to</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              placeholder="End date"
              className="sb-date-input"
            />
          </div>
        )}

        {latestDate && (() => {
          const range = getDateRangeForMode(dateMode, latestDate, customStart, customEnd);
          const formatDateRange = (date) => {
            const d = new Date(date + 'T00:00:00Z');
            const opts = { year: 'numeric', month: 'short', day: 'numeric' };
            return d.toLocaleDateString('en-IN', opts);
          };
          return (
            <span className="sb-data-badge">
              {range ? `📊 ${dateMode.toUpperCase()}: ${formatDateRange(range.start)} to ${formatDateRange(range.end)}` : '📅 Select date range'}
            </span>
          );
        })()}
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
            <IndividualPerformancePanel days={data.days} latestDate={latestDate} salespersonData={data.salespersonData} />
            <MerchandiseMixPanel days={data.days} prevDays={data.prevDays} />
            <FootwearByDepartmentPanel days={data.days} prevDays={data.prevDays} />
            <AnnualBusinessPlanPanel days={data.days} latestDate={latestDate} />
            <div className="sb-bottom-panels">
              <StoreKPIsPanel days={data.days} />
              <FootfallAnalyticsPanel days={data.days} footfall={data.footfall} latestDate={latestDate} salespersonData={data.salespersonData} />
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
