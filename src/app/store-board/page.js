'use client';

import { useState, useEffect, useMemo } from 'react';
import { Calendar, RefreshCw, AlertCircle } from 'lucide-react';
import RequireAuth from '@/components/RequireAuth';
import { apiFetch } from '@/lib/api';
import {
  formatINRFull, formatNumber, formatPercent, MONTH_NAMES,
  sumDays, kpisFrom, getWeekRange, getDayWeight,
} from '@/lib/storeBoardShared';
import './store-board.css';

const DEFAULT_DATE_MODE = 'mtd';
const STORE_NAME = 'UPPAL';

/**
 * Date mode utilities
 */
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
      const daysBack = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday = 0
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
 * Target vs Achievement Panel
 */
function TargetVsAchievementPanel({ days, prevDays, latestDate, dateMode }) {
  const current = kpisFrom(days);
  const previous = kpisFrom(prevDays);

  // For demo, using placeholder targets. TODO: Fetch from fact_targets
  const monthTarget = 10000000; // ₹1 Cr for demo
  const monthQtyTarget = 5000;

  const achievementPercent = monthTarget > 0 ? (current.revenue / monthTarget) * 100 : 0;
  const l2lPercent = previous.revenue > 0 ? ((current.revenue - previous.revenue) / previous.revenue) * 100 : null;

  return (
    <div className="sb-panel sb-achievement">
      <h3 className="sb-panel-title">Target vs Achievement</h3>
      <div className="sb-metrics-grid">
        <div className="sb-metric-card">
          <div className="sb-metric-label">Target</div>
          <div className="sb-metric-value">{formatINRFull(monthTarget)}</div>
        </div>
        <div className="sb-metric-card">
          <div className="sb-metric-label">Achievement</div>
          <div className="sb-metric-value">{formatINRFull(current.revenue)}</div>
        </div>
        <div className="sb-metric-card">
          <div className="sb-metric-label">Gap</div>
          <div className={`sb-metric-value ${current.revenue >= monthTarget ? 'positive' : 'negative'}`}>
            {formatINRFull(current.revenue - monthTarget)}
          </div>
        </div>
        <div className={`sb-metric-card ${achievementPercent >= 100 ? 'achievement-green' : achievementPercent >= 75 ? 'achievement-amber' : 'achievement-red'}`}>
          <div className="sb-metric-label">Achievement %</div>
          <div className="sb-metric-value">{formatPercent(achievementPercent, 1)}</div>
        </div>
        <div className="sb-metric-card">
          <div className="sb-metric-label">L2L %</div>
          <div className="sb-metric-value">
            {l2lPercent !== null ? formatPercent(l2lPercent, 1) : '—'}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Store KPIs Panel (MTD)
 */
function StoreKPIsPanel({ days }) {
  const kpis = kpisFrom(days);

  return (
    <div className="sb-panel sb-kpis">
      <h3 className="sb-panel-title">Store KPIs (MTD)</h3>
      <div className="sb-kpis-grid">
        <div className="sb-kpi-item">
          <div className="sb-kpi-label">ATV</div>
          <div className="sb-kpi-value">{formatINRFull(kpis.atv)}</div>
        </div>
        <div className="sb-kpi-item">
          <div className="sb-kpi-label">UPT</div>
          <div className="sb-kpi-value">{formatNumber(kpis.upt, 2)}</div>
        </div>
        <div className="sb-kpi-item">
          <div className="sb-kpi-label">ASP</div>
          <div className="sb-kpi-value">{formatINRFull(kpis.asp)}</div>
        </div>
        <div className="sb-kpi-item">
          <div className="sb-kpi-label">SFR</div>
          <div className="sb-kpi-value">{formatPercent(kpis.sfr, 1)}</div>
        </div>
        <div className="sb-kpi-item">
          <div className="sb-kpi-label">FUPT</div>
          <div className="sb-kpi-value">{formatNumber(kpis.fupt, 2)}</div>
        </div>
        <div className="sb-kpi-item">
          <div className="sb-kpi-label">Sock%</div>
          <div className="sb-kpi-value">{formatPercent(kpis.sockPercent, 1)}</div>
        </div>
        <div className="sb-kpi-item">
          <div className="sb-kpi-label">SSR</div>
          <div className="sb-kpi-value">{formatPercent(kpis.ssr, 1)}</div>
        </div>
        <div className="sb-kpi-item">
          <div className="sb-kpi-label">AFR</div>
          <div className="sb-kpi-value">{formatPercent(kpis.afr, 1)}</div>
        </div>
        <div className="sb-kpi-item">
          <div className="sb-kpi-label">MD%</div>
          <div className="sb-kpi-value">{formatPercent(kpis.mdPercent, 1)}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * Merchandise Mix Panel
 */
function MerchandiseMixPanel({ days, prevDays }) {
  const current = kpisFrom(days);
  const previous = kpisFrom(prevDays);

  return (
    <div className="sb-panel sb-merchandise-mix">
      <h3 className="sb-panel-title">Merchandise Mix</h3>
      <div className="sb-mix-summary">
        <div className="sb-mix-item">
          <span>Footwear</span>
          <span>{formatNumber(current.footwear_qty)} units</span>
        </div>
        <div className="sb-mix-item">
          <span>Apparel</span>
          <span>{formatNumber(current.apparel_qty)} units</span>
        </div>
        <div className="sb-mix-item">
          <span>Accessories</span>
          <span>{formatNumber(current.accessories_qty)} units</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Footfall Analytics Panel
 */
function FootfallAnalyticsPanel({ days }) {
  const current = kpisFrom(days);
  const conversionPercent = current.walkins > 0 ? (current.bills / current.walkins) * 100 : 0;
  const malePercent = current.walkins > 0 ? (current.male_walkins / current.walkins) * 100 : 0;
  const femalePercent = current.walkins > 0 ? (current.female_walkins / current.walkins) * 100 : 0;

  return (
    <div className="sb-panel sb-footfall">
      <h3 className="sb-panel-title">Footfall Analytics</h3>
      <div className="sb-footfall-content">
        <div className="sb-footfall-item">
          <div className="sb-footfall-label">Footfall</div>
          <div className="sb-footfall-value">{formatNumber(current.walkins)}</div>
        </div>
        <div className="sb-footfall-item">
          <div className="sb-footfall-label">Conversion %</div>
          <div className="sb-footfall-value">{formatPercent(conversionPercent, 1)}</div>
        </div>
        <div className="sb-footfall-item">
          <div className="sb-footfall-label">Male %</div>
          <div className="sb-footfall-value">{formatPercent(malePercent, 1)}</div>
        </div>
        <div className="sb-footfall-item">
          <div className="sb-footfall-label">Female %</div>
          <div className="sb-footfall-value">{formatPercent(femalePercent, 1)}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * Filter Bar
 */
function FilterBar({ dateMode, onDateModeChange, customStart, customEnd, onCustomChange, onApply, latestDate, isLoading }) {
  const modeButtons = ['today', 'wtd', 'mtd', 'ytd'];

  return (
    <div className="sb-filter-bar">
      <div className="sb-filter-left">
        <div className="sb-mode-selector">
          {modeButtons.map((mode) => (
            <button
              key={mode}
              className={`sb-mode-btn ${dateMode === mode ? 'active' : ''}`}
              onClick={() => onDateModeChange(mode)}
            >
              {mode.toUpperCase()}
            </button>
          ))}
        </div>
        {dateMode === 'custom' && (
          <div className="sb-custom-dates">
            <input
              type="date"
              value={customStart}
              onChange={(e) => onCustomChange('start', e.target.value)}
              className="sb-date-input"
            />
            <span>to</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => onCustomChange('end', e.target.value)}
              className="sb-date-input"
            />
            <button className="sb-apply-btn" onClick={onApply}>Apply</button>
          </div>
        )}
      </div>
      <div className="sb-filter-right">
        <div className="sb-store-info">
          <span className="sb-store-name">{STORE_NAME} Store</span>
          {latestDate && <span className="sb-data-through">Data through {new Date(latestDate + 'T00:00:00Z').toLocaleDateString('en-IN')}</span>}
        </div>
        <button className="sb-refresh-btn" disabled={isLoading} title="Refresh data">
          <RefreshCw style={{ width: '16px', height: '16px' }} />
        </button>
      </div>
    </div>
  );
}

/**
 * Main Store Board Page
 */
function StoreBoardPage() {
  const [dateMode, setDateMode] = useState(DEFAULT_DATE_MODE);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [bounds, setBounds] = useState({ firstDate: null, latestDate: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  const { firstDate, latestDate } = bounds;

  // 1. Load data bounds
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

  // 2. Load data for selected date range
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

  const handleDateModeChange = (mode) => {
    setDateMode(mode);
  };

  const handleCustomChange = (type, value) => {
    if (type === 'start') setCustomStart(value);
    if (type === 'end') setCustomEnd(value);
  };

  const handleApply = () => {
    if (customStart && customEnd && customStart <= customEnd) {
      // TODO: Implement custom date range loading
      console.log('Apply custom range:', customStart, customEnd);
    }
  };

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
      <FilterBar
        dateMode={dateMode}
        onDateModeChange={handleDateModeChange}
        customStart={customStart}
        customEnd={customEnd}
        onCustomChange={handleCustomChange}
        onApply={handleApply}
        latestDate={latestDate}
        isLoading={loading}
      />

      {loading && (
        <div className="sb-loading">
          <div className="sb-spinner"></div>
          <p>Loading Store Board...</p>
        </div>
      )}

      {data && !loading && (
        <div className="sb-panels">
          <TargetVsAchievementPanel
            days={data.days}
            prevDays={data.prevDays}
            latestDate={latestDate}
            dateMode={dateMode}
          />
          <StoreKPIsPanel days={data.days} />
          <MerchandiseMixPanel days={data.days} prevDays={data.prevDays} />
          <FootfallAnalyticsPanel days={data.days} />
        </div>
      )}
    </div>
  );
}

export default RequireAuth(StoreBoardPage, ['admin']);
