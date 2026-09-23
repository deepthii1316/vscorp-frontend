'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  LayoutDashboard, IndianRupee, TrendingUp, Percent, Package, Receipt, Wallet, ShoppingBag,
  ChartColumn, Layers, RefreshCw, ArrowUpRight, ArrowDownRight, Minus,
} from 'lucide-react';
import {
  formatINRFull, formatNumber, formatPercent, MONTH_NAMES,
  sumDays, kpisFrom, change, sumPayments,
  trendSeries, weeklyNsv, divisionSplit, divisionTable,
  resolveRange, compareWindows,
} from '@/lib/masterDashboardShared';
import { categoryDrilldownTree, footwearByDepartmentTree } from '@/lib/categoryDrilldownShared';
import RequireAuth from '@/components/RequireAuth';
import { apiFetch } from '@/lib/api';
import MasterDashboardFilters from '@/components/MasterDashboardFilters';
import { Sparkline, TrendCard, DivisionSplitCard, PaymentCard, WeeklyCard, DivisionTableCard } from '@/components/MasterDashboardCharts';
import MasterDashboardMetrics from '@/components/MasterDashboardMetrics';
import CategoryDrilldownTables from '@/components/CategoryDrilldownTables';

// Overview tab. Data: gold.reebok_master_dashboard and gold.reebok_master_dashboard_payments.
// Filters (Phase 4): quick range, week, month, half-year, quarter, financial/calendar, custom dates,
// division, and Compare mode (Period A vs Period B). Every number is calculated from the day rows
// returned by the API; see src/lib/masterDashboardShared.js.

const shortDate = (s) => new Date(s + 'T00:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const periodLabel = (p) => `${MONTH_NAMES[p.month - 1].slice(0, 3)} ${p.year}${p.week ? ` week ${p.week}` : ''}`;
const DEFAULT_SEL = { group: 'quick', quick: 'MTD', week: null, month: null, halves: [], quarters: [], fiscal: 'financial' };

/** Change chip: arrow + value, coloured green (good) or red (bad). goodWhen says which direction is good. */
function Delta({ value, kind, goodWhen = 'up', compareLabel }) {
  if (value === null) {
    return <div className="md-delta flat" title="No comparison period is available for this selection"><Minus />No comparison</div>;
  }
  const flat = Math.abs(value) < 0.05;
  const up = value > 0;
  const good = goodWhen === 'up' ? up : !up;
  const tone = flat ? 'flat' : good ? 'good' : 'bad';
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  const text = kind === 'points' ? `${Math.abs(value).toFixed(1)} pts` : `${Math.abs(value).toFixed(1)}%`;
  return <div className={`md-delta ${tone}`} title={`Compared with ${compareLabel}`}><Icon />{text}</div>;
}

function MasterDashboardPage() {
  const [bounds, setBounds] = useState({ firstDate: null, latestDate: null });
  const [mode, setMode] = useState('m2m');                       // 'm2m' | 'compare'
  const [sel, setSel] = useState(DEFAULT_SEL);
  const [draft, setDraft] = useState({ from: '', to: '' });      // date boxes, applied with the Apply button
  const [cmpA, setCmpA] = useState(null);                        // { year, month, week }
  const [cmpB, setCmpB] = useState(null);
  const [selectedDivision, setSelectedDivision] = useState('ALL');
  const [activeTab, setActiveTab] = useState('overview');
  const [trendMetric, setTrendMetric] = useState('nsv');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  const [catLoading, setCatLoading] = useState(false);
  const [catError, setCatError] = useState(null);
  const [catData, setCatData] = useState(null);

  const { firstDate, latestDate } = bounds;

  // 1. Data bounds: presets are anchored on the latest date that has data.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch('/api/reports/master-dashboard?meta=1');
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
        if (cancelled) return;
        if (!json.latestDate) { setError('No sales data has been loaded yet.'); setLoading(false); return; }
        const y = +json.latestDate.slice(0, 4), m = +json.latestDate.slice(5, 7);
        setBounds({ firstDate: json.firstDate, latestDate: json.latestDate });
        setCmpA({ year: y, month: m, week: 0 });
        setCmpB(m === 1 ? { year: y - 1, month: 12, week: 0 } : { year: y, month: m - 1, week: 0 });
      } catch (err) {
        if (!cancelled) { setError(err.message); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 2. Turn the filter selection into the date range (and Period B in Compare mode).
  const resolved = useMemo(() => {
    if (!latestDate) return null;
    if (mode === 'compare' && cmpA && cmpB) {
      const w = compareWindows(cmpA, cmpB, latestDate);
      return {
        ...w.a, empty: w.a.empty || w.b.empty,
        compare: w.b.empty ? null : { start: w.b.start, end: w.b.end },
        compareLabel: periodLabel(cmpB), limitedTo: w.limitedTo,
      };
    }
    return { ...resolveRange(sel, latestDate, firstDate), compare: null, compareLabel: 'last month', limitedTo: null };
  }, [mode, sel, cmpA, cmpB, latestDate, firstDate]);

  // Keep the date boxes showing the range that is actually in use.
  useEffect(() => {
    if (resolved && !resolved.empty) setDraft({ from: resolved.start, to: resolved.end });
  }, [resolved?.start, resolved?.end, resolved?.empty]); // eslint-disable-line react-hooks/exhaustive-deps

  // 3. Load the day rows whenever the resolved range changes.
  const fetchData = useCallback(async () => {
    if (!resolved || resolved.empty) { setData(null); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ startDate: resolved.start, endDate: resolved.end });
      if (resolved.compare) { params.set('compareStart', resolved.compare.start); params.set('compareEnd', resolved.compare.end); }
      const res = await apiFetch(`/api/reports/master-dashboard?${params.toString()}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [resolved, selectedDivision]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // 3b. Category drill-down: only loaded once that tab is opened, same range/compare as Overview.
  useEffect(() => {
    if (activeTab !== 'categories' || !resolved || resolved.empty) return;
    let cancelled = false;
    (async () => {
      setCatLoading(true);
      setCatError(null);
      try {
        const params = new URLSearchParams({ startDate: resolved.start, endDate: resolved.end });
        if (resolved.compare) { params.set('compareStart', resolved.compare.start); params.set('compareEnd', resolved.compare.end); }
        const res = await fetch(`/api/reports/master-dashboard/category-drilldown?${params.toString()}`);
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
        if (!cancelled) setCatData(json);
      } catch (err) {
        if (!cancelled) setCatError(err.message);
      } finally {
        if (!cancelled) setCatLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeTab, resolved?.start, resolved?.end, resolved?.empty, resolved?.compare?.start, resolved?.compare?.end]); // eslint-disable-line react-hooks/exhaustive-deps

  const catView = useMemo(() => {
    if (!catData) return null;
    return {
      categoryTree: categoryDrilldownTree(catData.rows, catData.prevRows),
      footwearTree: footwearByDepartmentTree(catData.rows, catData.prevRows),
    };
  }, [catData]);

  // Selection handlers. Groups are mutually exclusive; emptying a multi-select falls back to month to date.
  const handleSel = (patch) => {
    if ((patch.group === 'half' && patch.halves.length === 0) || (patch.group === 'quarter' && patch.quarters.length === 0)) {
      setSel((s) => ({ ...s, group: 'quick', quick: 'MTD' }));
      return;
    }
    setSel((s) => ({ ...s, ...patch }));
  };
  const applyCustom = () => setSel((s) => ({ ...s, group: 'custom', from: draft.from, to: draft.to }));

  const years = useMemo(() => {
    if (!firstDate || !latestDate) return [];
    const out = [];
    for (let y = +firstDate.slice(0, 4); y <= +latestDate.slice(0, 4); y++) out.push(y);
    return out;
  }, [firstDate, latestDate]);

  // Aggregate in the browser: sum the inputs first, then compute every ratio from the sums.
  const view = useMemo(() => {
    if (!data) return null;
    const cur = kpisFrom(sumDays(data.days, selectedDivision), data.range.days, selectedDivision);
    const hasPrev = !!data.comparison && data.prevDays.length > 0;
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

  const compareLabel = resolved?.compareLabel || 'last month';
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

  // Header text: the range, whether it was cut at the latest data date, and what it is compared with.
  const rangeText = resolved && !resolved.empty ? `${shortDate(resolved.start)} to ${shortDate(resolved.end)}` : '';
  let compareText = '';
  if (data) {
    if (data.comparison && data.prevDays.length > 0) compareText = `compared with ${shortDate(data.comparison.start)} to ${shortDate(data.comparison.end)}`;
    else if (data.comparison) compareText = `no data for ${shortDate(data.comparison.start)} to ${shortDate(data.comparison.end)}, so there is no comparison`;
    else compareText = 'month-on-month comparison is shown for ranges up to one month';
  }
  const notices = [];
  if (resolved?.clamped && !resolved.empty && mode === 'm2m') notices.push(`Data is available up to ${shortDate(latestDate)}, so the range ends there.`);
  if (resolved?.limitedTo) notices.push(`Both periods are limited to ${resolved.limitedTo} day(s) so they can be compared like for like (data is available up to ${shortDate(latestDate)}).`);

  return (
    <div className="md-page">
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="page-header-icon-box">
          <LayoutDashboard className="page-header-icon-svg" />
        </div>
        <div className="page-header-text">
          <h1>Master Dashboard</h1>
          <p>Uppal Reebok - sales overview{rangeText ? `, ${rangeText}` : ''}{compareText ? `, ${compareText}` : ''}</p>
        </div>
        <div className="md-header-actions">
          <button type="button" className="reebok-btn secondary" onClick={fetchData} disabled={loading || !resolved || resolved.empty}>
            <RefreshCw />
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Filters */}
      {latestDate && cmpA && cmpB && (
        <MasterDashboardFilters
          mode={mode} onMode={setMode}
          sel={sel} onSel={handleSel}
          draft={draft} onDraft={setDraft} onApply={applyCustom}
          division={selectedDivision} onDivision={setSelectedDivision}
          latestDate={latestDate} years={years}
          cmpA={cmpA} cmpB={cmpB} onCmpA={setCmpA} onCmpB={setCmpB}
        />
      )}

      {notices.map((n) => <div key={n} className="md-notice">{n}</div>)}

      {/* Tabs */}
      <div className="md-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={activeTab === 'overview'} className={`md-tab ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
          <LayoutDashboard />Overview
        </button>
        <button type="button" role="tab" aria-selected={activeTab === 'metrics'} className={`md-tab ${activeTab === 'metrics' ? 'active' : ''}`} onClick={() => setActiveTab('metrics')}>
          <ChartColumn />Retail metrics
        </button>
        <button type="button" role="tab" aria-selected={activeTab === 'categories'} className={`md-tab ${activeTab === 'categories' ? 'active' : ''}`} onClick={() => setActiveTab('categories')}>
          <Layers />Category drill-down
        </button>
      </div>

      {error && <div className="reebok-error">Could not load the dashboard: {error}</div>}

      {resolved?.empty && (
        <div className="md-empty card">
          There is no data for this selection yet. Sales data is available from {firstDate ? shortDate(firstDate) : '-'} to {latestDate ? shortDate(latestDate) : '-'}.
        </div>
      )}

      {/* Overview */}
      {activeTab === 'overview' && !resolved?.empty && (
        loading ? <div className="md-empty card">Loading...</div> : view && (
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
                  <Delta value={t.delta} kind={t.kind || 'pct'} goodWhen={t.goodWhen || 'up'} compareLabel={compareLabel} />
                  <Sparkline values={view.series(t.spark).map((p) => p.cur)} />
                </div>
              );
            })}
          </div>

          <div className="md-row md-row-trend">
            <TrendCard series={view.series(trendMetric)} metric={trendMetric} onMetric={setTrendMetric} hasComparison={view.hasPrev} compareLabel={compareLabel} />
            <DivisionSplitCard split={view.split} selectedDivision={selectedDivision} onSelect={setSelectedDivision} />
          </div>

          <div className="md-row md-row-even">
            <PaymentCard payments={view.payments} grossSales={view.grossSales} />
            <WeeklyCard weeks={view.weeks} hasComparison={view.hasPrev} compareLabel={compareLabel} />
          </div>

          <DivisionTableCard table={view.table} compareLabel={compareLabel} />
        </>
        )
      )}

      {activeTab === 'metrics' && !resolved?.empty && (
        loading ? <div className="md-empty card">Loading...</div> : data && (
        <MasterDashboardMetrics
          days={data.retailMetricsDays || []}
          prevDays={data.retailMetricsPrevDays || []}
          ssrDays={data.days || []}
          ssrPrevDays={data.prevDays || []}
          rangeText={rangeText}
        />
        )
      )}

      {/* Category drill-down */}
      {activeTab === 'categories' && !resolved?.empty && (
        <>
          {catError && <div className="reebok-error">Could not load the category drill-down: {catError}</div>}
          {catLoading ? <div className="md-empty card">Loading...</div> : catView && (
            <CategoryDrilldownTables
              categoryTree={catView.categoryTree}
              footwearTree={catView.footwearTree}
              compareLabel={compareLabel}
            />
          )}
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
