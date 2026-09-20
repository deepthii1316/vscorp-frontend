'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  LayoutDashboard, IndianRupee, TrendingUp, Percent, Package, Receipt, Wallet, ShoppingBag,
  ChartColumn, Layers, RefreshCw, ArrowUpRight, ArrowDownRight, Minus,
} from 'lucide-react';
import {
  formatINRFull, formatNumber, formatPercent, DIVISIONS,
  sumDays, kpisFrom, change, sumPayments,
  trendSeries, weeklyNsv, divisionSplit, divisionTable,
} from '@/lib/masterDashboardShared';
import RequireAuth from '@/components/RequireAuth';
import { Sparkline, TrendCard, DivisionSplitCard, PaymentCard, WeeklyCard, DivisionTableCard } from '@/components/MasterDashboardCharts';

// Overview tab, Phase 2: real data from gold.reebok_master_dashboard and
// gold.reebok_master_dashboard_payments (see public/MASTER-DASHBOARD-OVERVIEW-PLAN.md).
// Phase 3: charts. Every number here is calculated from the day rows returned by the API.

const QUICK_RANGES = ['WTD', 'MTD', 'YTD', 'All'];

const iso = (d) => d.toISOString().split('T')[0];

// Preset ranges are anchored on the latest date that has data.
function rangeFor(preset, anchor) {
  const end = new Date(anchor + 'T00:00:00Z');
  const first = (y, m) => iso(new Date(Date.UTC(y, m, 1)));
  if (preset === 'WTD') {
    const start = new Date(end);
    start.setUTCDate(end.getUTCDate() - ((end.getUTCDay() + 6) % 7)); // Monday
    return [iso(start), anchor];
  }
  if (preset === 'MTD') return [first(end.getUTCFullYear(), end.getUTCMonth()), anchor];
  if (preset === 'YTD') return [first(end.getUTCFullYear(), 0), anchor];
  return ['2026-01-01', anchor];
}

const shortDate = (s) => new Date(s + 'T00:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Change chip: arrow + value, coloured green (good) or red (bad). goodWhen says which direction is good. */
function Delta({ value, kind, goodWhen = 'up' }) {
  if (value === null) {
    return <div className="md-delta flat" title="No comparison month is available for this range"><Minus />No comparison</div>;
  }
  const flat = Math.abs(value) < 0.05;
  const up = value > 0;
  const good = goodWhen === 'up' ? up : !up;
  const tone = flat ? 'flat' : good ? 'good' : 'bad';
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  const text = kind === 'points' ? `${Math.abs(value).toFixed(1)} pts` : `${Math.abs(value).toFixed(1)}%`;
  return <div className={`md-delta ${tone}`} title="Compared with the same days one month earlier"><Icon />{text}</div>;
}

function MasterDashboardPage() {
  const [latestDate, setLatestDate] = useState(null);
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [selectedDivision, setSelectedDivision] = useState('ALL');
  const [selectedQuickRange, setSelectedQuickRange] = useState('MTD');
  const [activeTab, setActiveTab] = useState('overview');
  const [trendMetric, setTrendMetric] = useState('nsv');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  // 1. Find the latest date with data and start on the month-to-date range.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/reports/master-dashboard?meta=1');
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
        if (cancelled) return;
        if (!json.latestDate) {
          setError('No sales data has been loaded yet.');
          setLoading(false);
          return;
        }
        const [s, e] = rangeFor('MTD', json.latestDate);
        setLatestDate(json.latestDate);
        setStartDate(s);
        setEndDate(e);
      } catch (err) {
        if (!cancelled) { setError(err.message); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 2. Load the day rows whenever the range changes.
  const fetchData = useCallback(async () => {
    if (!startDate || !endDate) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ startDate, endDate });
      const res = await fetch(`/api/reports/master-dashboard?${params.toString()}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleQuickRange = (range) => {
    if (!latestDate) return;
    const [s, e] = rangeFor(range, latestDate);
    setSelectedQuickRange(range);
    setStartDate(s);
    setEndDate(e);
  };

  const handleDateChange = (s, e) => {
    setSelectedQuickRange(null);
    setStartDate(s);
    setEndDate(e);
  };

  // Aggregate in the browser: sum the inputs first, then compute every ratio from the sums.
  const view = useMemo(() => {
    if (!data) return null;
    const cur = kpisFrom(sumDays(data.days, selectedDivision), data.range.days, selectedDivision);
    const hasPrev = data.comparison && data.prevDays.length > 0;
    const prev = hasPrev ? kpisFrom(sumDays(data.prevDays, selectedDivision), data.comparison.days, selectedDivision) : null;
    const grossSales = data.days.reduce((s, r) => s + Number(r.gross_value || 0), 0);
    const cmpStart = hasPrev ? data.comparison.start : null;
    const series = (key) => trendSeries(data.days, data.prevDays, selectedDivision, key, data.range.start, data.range.days, cmpStart);
    return {
      cur, prev, hasPrev,
      payments: sumPayments(data.payments),
      grossSales,
      series,
      weeks: weeklyNsv(data.days, data.prevDays, selectedDivision, data.range.start, data.range.days, cmpStart),
      split: divisionSplit(data.days),
      table: divisionTable(data.days, data.prevDays, hasPrev),
    };
  }, [data, selectedDivision]);

  const pick = (key, kind) => (view && view.prev ? change(view.cur[key], view.prev[key], kind) : null);

  const tiles = view ? [
    { label: 'NSV',       icon: IndianRupee, value: formatINRFull(view.cur.nsv),       foot: 'Taxable amount',      delta: pick('nsv', 'pct'), spark: 'nsv' },
    { label: 'Avg / day', icon: TrendingUp,  value: formatINRFull(view.cur.avgPerDay), foot: `${view.cur.days} days`, delta: pick('avgPerDay', 'pct'), spark: 'nsv' },
    { label: 'MD %',      icon: Percent,     value: formatPercent(view.cur.mdPct),     foot: '(MRP - NSV) / MRP',   delta: pick('mdPct', 'points'), goodWhen: 'down', kind: 'points', spark: 'mdPct' },
    { label: 'Qty sold',  icon: Package,     value: formatNumber(view.cur.qty),        foot: 'Units',               delta: pick('qty', 'pct'), spark: 'qty' },
    { label: 'Bills',     icon: Receipt,     value: formatNumber(view.cur.bills),      foot: 'Transactions',        delta: pick('bills', 'pct'), spark: 'bills' },
    { label: 'ATV',       icon: Wallet,      value: formatINRFull(view.cur.atv),       foot: 'NSV / bill',          delta: pick('atv', 'pct'), spark: 'atv' },
    { label: 'SSR',       icon: ShoppingBag, value: formatPercent(view.cur.ssr),       foot: 'Socks / shoes',       delta: pick('ssr', 'points'), kind: 'points', spark: 'ssr' },
  ] : [];

  const comparisonText = !data ? '' : data.comparison
    ? (data.prevDays.length > 0
        ? `compared with ${shortDate(data.comparison.start)} to ${shortDate(data.comparison.end)}`
        : `no data for ${shortDate(data.comparison.start)} to ${shortDate(data.comparison.end)}, so there is no comparison`)
    : 'comparison shown for ranges up to one month';

  return (
    <div className="md-page">
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="page-header-icon-box">
          <LayoutDashboard className="page-header-icon-svg" />
        </div>
        <div className="page-header-text">
          <h1>Master Dashboard</h1>
          <p>
            Uppal Reebok - sales overview{startDate && endDate ? `, ${shortDate(startDate)} to ${shortDate(endDate)}` : ''}
            {comparisonText ? `, ${comparisonText}` : ''}
          </p>
        </div>
        <div className="md-header-actions">
          <button type="button" className="reebok-btn secondary" onClick={fetchData} disabled={loading || !startDate}>
            <RefreshCw />
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card md-filters">
        <div className="md-filter-group">
          <span className="md-label">From</span>
          <input type="date" className="md-date" value={startDate || ''} max={endDate || undefined} onChange={(e) => handleDateChange(e.target.value, endDate)} />
          <span className="md-label">To</span>
          <input type="date" className="md-date" value={endDate || ''} min={startDate || undefined} onChange={(e) => handleDateChange(startDate, e.target.value)} />
          <div className="md-seg" role="group" aria-label="Quick range">
            {QUICK_RANGES.map((r) => (
              <button key={r} type="button" className={selectedQuickRange === r ? 'active' : ''} onClick={() => handleQuickRange(r)}>
                {r}
              </button>
            ))}
          </div>
        </div>
        <div className="md-seg" role="group" aria-label="Division">
          {DIVISIONS.map((d) => (
            <button key={d.value} type="button" className={selectedDivision === d.value ? 'active' : ''} onClick={() => setSelectedDivision(d.value)}>
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="md-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={activeTab === 'overview'} className={`md-tab ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
          <LayoutDashboard />Overview
        </button>
        <button type="button" role="tab" className="md-tab" disabled>
          <ChartColumn />Retail metrics <span className="md-soon">Soon</span>
        </button>
        <button type="button" role="tab" className="md-tab" disabled>
          <Layers />Category drill-down <span className="md-soon">Soon</span>
        </button>
      </div>

      {error && <div className="reebok-error">Could not load the dashboard: {error}</div>}

      {/* Overview */}
      {activeTab === 'overview' && view && (
        <>
          {data.days.length === 0 && <div className="md-empty card">No sales data in this date range.</div>}

          <div className="md-kpis">
            {tiles.map((t) => {
              const Icon = t.icon;
              return (
                <div key={t.label} className="card md-kpi">
                  <div className="md-kpi-top">
                    <span className="md-label">{t.label}</span>
                    <Icon />
                  </div>
                  <div className="md-kpi-value">{t.value}</div>
                  <div className="md-kpi-foot">{t.foot}</div>
                  <Delta value={t.delta} kind={t.kind || 'pct'} goodWhen={t.goodWhen || 'up'} />
                  <Sparkline values={view.series(t.spark).map((p) => p.cur)} />
                </div>
              );
            })}
          </div>

          <div className="md-row md-row-trend">
            <TrendCard series={view.series(trendMetric)} metric={trendMetric} onMetric={setTrendMetric} hasComparison={view.hasPrev} />
            <DivisionSplitCard split={view.split} selectedDivision={selectedDivision} onSelect={setSelectedDivision} />
          </div>

          <div className="md-row md-row-even">
            <PaymentCard payments={view.payments} grossSales={view.grossSales} />
            <WeeklyCard weeks={view.weeks} hasComparison={view.hasPrev} />
          </div>

          <DivisionTableCard table={view.table} />
        </>
      )}
    </div>
  );
}

export default function MasterDashboardPageWrapped() {
  return (
    <RequireAuth>
      <MasterDashboardPage />
    </RequireAuth>
  );
}
