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
import RequireAuth from '@/components/RequireAuth';
import { apiFetch } from '@/lib/api';
import MasterDashboardFilters from '@/components/MasterDashboardFilters';
import { Sparkline, TrendCard, DivisionSplitCard, PaymentCard, WeeklyCard, DivisionTableCard } from '@/components/MasterDashboardCharts';

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

  const { firstDate, latestDate } = bounds;

  // 1. Data bounds: presets are anchored on the latest date that has data.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/reports/master-dashboard?meta=1');
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
      const params = new URLSearchParams({
        startDate,
        endDate,
        divisions: selectedDivision !== 'ALL' ? selectedDivision : '',
      });
      const res = await apiFetch(`/api/reports/master-dashboard?${params.toString()}`);
      const params = new URLSearchParams({ startDate: resolved.start, endDate: resolved.end });
      if (resolved.compare) { params.set('compareStart', resolved.compare.start); params.set('compareEnd', resolved.compare.end); }
      const res = await fetch(`/api/reports/master-dashboard?${params.toString()}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const handleDateChange = (start, end) => {
    setStartDate(start);
    setEndDate(end);
  };

  const handleQuickRangeChange = (range) => {
    setSelectedQuickRange(range);
    if (range === 'WTD') {
      setStartDate('2026-08-14');
      setEndDate('2026-08-18');
    } else if (range === 'MTD') {
      setStartDate('2026-08-01');
      setEndDate('2026-08-18');
    } else if (range === 'YTD') {
      setStartDate('2026-01-01');
      setEndDate('2026-08-18');
    } else if (range === 'all') {
      setStartDate('2026-01-01');
      setEndDate('2026-12-31');
    }
  };

  function yesterdayIST() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }

  async function handleSendEmail() {
    setEmailState({ sending: true, status: 'loading', message: 'Generating report screenshot…' });
    try {
      const params = new URLSearchParams({
        date: emailDate,
        force: 'true',
      });
      const res = await apiFetch(`/api/reports/kpi-dashboard?${params.toString()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok || json.noData) {
        setEmailState({ sending: false, status: 'error', message: json.error || 'No report data available.' });
        return;
      }

      setEmailState({ sending: true, status: 'screenshot', message: 'Capturing screenshot…' });
      const canvas = await html2canvas(dashboardRef.current, {
        scale: 1.5,
        useCORS: true,
        logging: false,
      });
      const imageBase64 = canvas.toDataURL('image/png');

      const formData = new FormData();
      formData.append('images', new Blob([await (await fetch(imageBase64)).arrayBuffer()], { type: 'image/png' }), 'report.png');
      formData.append('subject', `Virata Retail KPI Dashboard — ${emailDate}`);
      formData.append('displayDate', emailDate);
      formData.append('mode', emailMode);

      const sendRes = await apiFetch('/api/reports/kpi-dashboard/send', { method: 'POST', body: formData });
      const sendJson = await sendRes.json();
      if (!sendRes.ok) {
        setEmailState({ sending: false, status: 'error', message: sendJson.error || 'Failed to send email.' });
        return;
      }

      setEmailState({ sending: false, status: 'success', message: `Email sent to ${sendJson.recipients} recipient(s).` });
    } catch (err) {
      setEmailState({ sending: false, status: 'error', message: err.message || 'Failed to send email.' });
    }
  }

  function yesterdayIST() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }

  const kpis = dashboardData?.summary?.kpis || {
    rsv: 0,
    avgPerDay: 0,
    mdPct: 0,
    qtySold: 0,
    bills: 0,
    atv: 0,
    daysCount: 1,
  };

  const payments = dashboardData?.payments?.totals || {
    totalSales: 0,
    upiAmount: 0,
    upiPct: 0,
    cashAmount: 0,
    cashPct: 0,
    cardAmount: 0,
    cardPct: 0,
    otherAmount: 0,
    otherPct: 0,
  };

  const topStores = dashboardData?.summary?.topStores || [];
  const storePerformance = dashboardData?.summary?.storePerformance || [];
  }, [resolved?.start, resolved?.end, resolved?.empty, resolved?.compare?.start, resolved?.compare?.end]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData(); }, [fetchData]);

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
        <button type="button" role="tab" className="md-tab" disabled>
          <ChartColumn />Retail metrics <span className="md-soon">Soon</span>
        </button>
        <button type="button" role="tab" className="md-tab" disabled>
          <Layers />Category drill-down <span className="md-soon">Soon</span>
        </button>
      </div>

      {error && <div className="reebok-error">Could not load the dashboard: {error}</div>}

      {resolved?.empty && (
        <div className="md-empty card">
          There is no data for this selection yet. Sales data is available from {firstDate ? shortDate(firstDate) : '-'} to {latestDate ? shortDate(latestDate) : '-'}.
        </div>
      )}

      {/* Overview */}
      {activeTab === 'overview' && view && !resolved?.empty && (
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
