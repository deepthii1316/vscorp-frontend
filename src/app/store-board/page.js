'use client';

// Store Board (Uppal Reebok, R1157): the store's scoreboard on one page. Admin only.
//
// Data: /api/store-board is called once for every day on record (one small row per day), plus the
// staff figures for the latest sales date; the category drill-down is fetched for the selected
// period. Everything shown is worked out from those rows in src/lib/storeBoardShared.js.
//
// Which panels follow the period buttons:
//   Target vs Achievement   no  - always WTD / MTD / YTD up to the latest sales date
//   Weekly Business Plan    no  - the month of the latest sales date
//   Individual Performance  no  - month to date
//   Annual Business Plan    no  - 1 July to the latest sales date
//   Store KPIs              no  - month to date
//   Merchandise Mix         yes - selected period vs the same days one month earlier
//   Footfall                yes - selected period
// Targets use the same rules as the Sales Reports (see storeBoardShared.js). No number on this
// page is typed in: with no data a cell shows a dash.

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, RefreshCw, AlertCircle, Printer } from 'lucide-react';
import RequireAuth from '@/components/RequireAuth';
import { apiFetch } from '@/lib/api';
import { SortTh, useSort } from '@/components/SortTh';
import { staffTarget } from '@/lib/email/reebokHelpers';
import {
  MONTH_NAMES, rangeForMode, inRange, totals, kpisFrom, monthStart, monthEarlier, pctChange,
  achievementRows, weeklyPlan, annualPlan, mixTree, achievement, achClass,
  dayLabel, dayLabelLong, weekdayOf, fmtINR, fmtInt, fmtDec, fmtPct,
} from '@/lib/storeBoardShared';
import './store-board.css';

const DEFAULT_DATE_MODE = 'mtd';
const STORE_NAME = 'UPPAL';
const MODES = ['today', 'wtd', 'mtd', 'ytd', 'custom'];
const num = (v) => Number(v) || 0;
const signClass = (v) => (v === null || v === undefined ? '' : v >= 0 ? 'positive' : 'negative');

/** Header cells for a sortable table: cols = [[key, label, props?], ...]. */
function SortHead({ cols, sort, onSort }) {
  return <tr>{cols.map(([k, label, props]) => <SortTh key={k} k={k} label={label} sort={sort} onSort={onSort} {...(props || {})} />)}</tr>;
}

/**
 * A change in percent with a triangle: ▲ up, ▼ down. Green when it is good news, red when bad.
 * `better="down"` is for figures where lower is better (markdown %).
 */
function Delta({ value, better = 'up' }) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return <span className="sb-delta none">—</span>;
  if (Math.abs(value) < 0.05) return <span className="sb-delta flat">● 0.0%</span>;
  const up = value > 0;
  const good = better === 'down' ? !up : up;
  return <span className={`sb-delta ${good ? 'good' : 'bad'}`}><span className="sb-tri">{up ? '▲' : '▼'}</span>{Math.abs(value).toFixed(1)}%</span>;
}

function Panel({ title, note, children, followsPeriod, busy }) {
  return (
    <div className={`sb-panel ${busy ? 'sb-busy' : ''}`}>
      <div className="sb-panel-header">
        <h3 className="sb-panel-title">{title}{followsPeriod && <span className="sb-follows" title="This panel changes with the period buttons">follows period</span>}</h3>
        {note && <span className="sb-panel-date">{note}</span>}
      </div>
      {children}
    </div>
  );
}

/** Target vs Achievement: WTD, MTD and YTD, each on its own dates. */
function TargetVsAchievementPanel({ allDays, latestDate, dateMode }) {
  const rows = useMemo(() => achievementRows(allDays, latestDate), [allDays, latestDate]);
  const { sort, onSort, sorted } = useSort({ textKeys: ['label'] });
  return (
    <Panel title="TARGET VS ACHIEVEMENT" note={`Up to ${dayLabelLong(latestDate)}`}>
      <table className="sb-table">
        <thead>
          <SortHead sort={sort} onSort={onSort} cols={[
            ['label', 'Period'], ['target', 'Target'],
            ['actual', 'Actual', { title: 'Sales, and the change against the same days one week (WTD) or one month (MTD) earlier' }],
            ['gap', 'Gap'], ['qty', 'Actual Qty'], ['ach', 'Achievement'],
          ]} />
        </thead>
        <tbody>
          {sorted(rows).map((r) => (
            <tr key={r.label} className={r.label.toLowerCase() === dateMode ? 'sb-selected-row' : ''}>
              <td className="sb-label">{r.label}<span className="sb-sub">{dayLabel(r.start)} – {dayLabel(r.end)}</span></td>
              <td className="sb-currency">{fmtINR(r.target)}</td>
              <td className="sb-currency">
                {fmtINR(r.actual)}{r.prevName && <Delta value={r.change} />}
                {r.prevName && (
                  <span className="sb-sub" title={`${dayLabel(r.prevStart)} – ${dayLabel(r.prevEnd)}`}>{r.prevName}: {fmtINR(r.prevActual)}</span>
                )}
              </td>
              <td className={`sb-currency ${signClass(r.gap)}`}>{fmtINR(r.gap)}</td>
              <td className="sb-number">{fmtInt(r.qty)}</td>
              <td className={`sb-percent ${achClass(r.ach)}`}>
                {fmtPct(r.ach)}{r.prevName && <Delta value={pctChange(r.ach, r.prevAch)} />}
                {r.prevName && (
                  <span className="sb-sub" title={`${dayLabel(r.prevStart)} – ${dayLabel(r.prevEnd)} against a target of ${fmtINR(r.prevTarget)}`}>{r.prevName}: {fmtPct(r.prevAch)}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

/** Today's date in India, 'YYYY-MM-DD' (the store's calendar day). */
const todayInIndia = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const NowTag = () => <span className="sb-now">Now</span>;

/** Weekly Business Plan: the month's target split into weeks and days, with actual sales. */
function WeeklyBusinessPlanPanel({ allDays, latestDate }) {
  const plan = useMemo(() => weeklyPlan(allDays, latestDate), [allDays, latestDate]);
  // "Now" follows the calendar, not the data: the week and the day the store is in today.
  const today = todayInIndia();
  const isNow = (w) => w.start <= today && today <= w.end;
  const current = plan.weeks.find(isNow) || plan.weeks.find((w) => w.isCurrent);
  const [open, setOpen] = useState(() => new Set(current ? [current.label] : []));
  const toggle = (label) => setOpen((s) => { const n = new Set(s); if (n.has(label)) n.delete(label); else n.add(label); return n; });
  const { sort, onSort, sorted } = useSort({ textKeys: ['label', 'start'] });

  return (
    <Panel title="WEEKLY BUSINESS PLAN"
      note={`${MONTH_NAMES[plan.month - 1]} ${plan.year} · month target ${fmtINR(plan.monthTarget)} · achieved ${fmtINR(plan.mtdActual)} (${fmtPct(plan.mtdAch)})`}>
      <table className="sb-table">
        <thead>
          <SortHead sort={sort} onSort={onSort} cols={[['label', 'Week'], ['start', 'Period', { className: 'sb-left' }], ['target', 'Target'], ['actual', 'Actual'], ['gap', 'Gap'], ['ach', 'Ach %']]} />
        </thead>
        <tbody>
          {sorted(plan.weeks).map((w) => (
            <Fragment key={w.label}>
              <tr className={`sb-week-row ${w.isCurrent ? 'sb-current-month' : ''}`} onClick={() => toggle(w.label)}>
                <td className="sb-week-label">
                  <span className="sb-toggle">{open.has(w.label) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}{w.label}{isNow(w) && <NowTag />}</span>
                </td>
                <td className="sb-date-range sb-left">{dayLabel(w.start)} – {dayLabel(w.end)}</td>
                <td className="sb-currency">{fmtINR(w.target)}</td>
                <td className="sb-currency">{fmtINR(w.actual)}</td>
                <td className={`sb-currency ${signClass(w.gap)}`}>{fmtINR(w.gap)}</td>
                <td className={`sb-percent ${achClass(w.ach)}`}>{fmtPct(w.ach)}</td>
              </tr>
              {open.has(w.label) && w.days.map((d) => (
                <tr key={d.date} className={`sb-day-row ${d.date === today ? 'sb-now-row' : ''}`}>
                  <td className="sb-day-label">{weekdayOf(d.date)}{d.date === today && <NowTag />}</td>
                  <td className="sb-date-range sb-left">{dayLabel(d.date)}{d.date === latestDate ? ' · latest' : ''}</td>
                  <td className="sb-currency">{fmtINR(d.target)}</td>
                  <td className="sb-currency">{fmtINR(d.actual)}</td>
                  <td className={`sb-currency ${signClass(d.gap)}`}>{fmtINR(d.gap)}</td>
                  <td className={`sb-percent ${achClass(d.ach)}`}>{fmtPct(d.ach)}</td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
      <p className="sb-foot-note">
        The plan paces the month: weeks carry 25 / 20 / 20 / 20 / 15% of the month target (30 / 25 / 25 / 20% in a four-week month) and Saturdays and Sundays carry more than weekdays.
        Gap = actual − target. Days after {dayLabel(latestDate)} have no sales yet.
      </p>
    </Panel>
  );
}

/** Individual Performance: each salesperson, month to date, against their target to date. */
function IndividualPerformancePanel({ salespersonData, latestDate }) {
  const people = useMemo(() => {
    const mtd = (salespersonData || []).filter((r) => r.period_type === 'mtd');
    const target = staffTarget('mtd', latestDate, mtd.length || 1);
    return mtd.map((r) => {
      const actual = num(r.nsv);
      return { name: r.salesperson_name, target, actual, gap: actual - target, qty: num(r.qty), bills: num(r.bills), atv: r.atv === null ? null : num(r.atv), ach: achievement(actual, target) };
    });
  }, [salespersonData, latestDate]);
  const { sort, onSort, sorted } = useSort({ initial: { key: 'ach', dir: 'desc' }, textKeys: ['name'] });
  const sum = (f) => people.reduce((s, p) => s + f(p), 0);
  const all = { target: sum((p) => p.target), actual: sum((p) => p.actual), qty: sum((p) => p.qty), bills: sum((p) => p.bills) };

  return (
    <Panel title="INDIVIDUAL PERFORMANCE" note={`Month to date · ${dayLabel(monthStart(latestDate))} – ${dayLabelLong(latestDate)}`}>
      {!salespersonData ? <p className="sb-empty">Loading…</p> : people.length === 0 ? <p className="sb-empty">No salesperson sales recorded this month.</p> : (
        <table className="sb-table">
          <thead>
            <SortHead sort={sort} onSort={onSort} cols={[['name', 'Salesperson'], ['target', 'Target'], ['actual', 'Actual'], ['gap', 'Gap'], ['qty', 'Actual Qty'], ['bills', 'Bills'], ['atv', 'ATV'], ['ach', 'Achievement']]} />
          </thead>
          <tbody>
            {sorted(people).map((p) => (
              <tr key={p.name}>
                <td className="sb-name">{p.name}</td>
                <td className="sb-currency">{fmtINR(p.target)}</td>
                <td className="sb-currency">{fmtINR(p.actual)}</td>
                <td className={`sb-currency ${signClass(p.gap)}`}>{fmtINR(p.gap)}</td>
                <td className="sb-number">{fmtInt(p.qty)}</td>
                <td className="sb-number">{fmtInt(p.bills)}</td>
                <td className="sb-currency">{fmtINR(p.atv)}</td>
                <td className={`sb-percent ${achClass(p.ach)}`}>
                  <span className="sb-bar"><span className={achClass(p.ach)} style={{ width: `${Math.min(100, Math.max(0, p.ach || 0))}%` }} /></span>
                  {fmtPct(p.ach)}
                </td>
              </tr>
            ))}
            <tr className="sb-ytd-row">
              <td className="sb-label">All salespeople</td>
              <td className="sb-currency">{fmtINR(all.target)}</td>
              <td className="sb-currency">{fmtINR(all.actual)}</td>
              <td className={`sb-currency ${signClass(all.actual - all.target)}`}>{fmtINR(all.actual - all.target)}</td>
              <td className="sb-number">{fmtInt(all.qty)}</td>
              <td className="sb-number">{fmtInt(all.bills)}</td>
              <td className="sb-currency">{fmtINR(all.bills > 0 ? all.actual / all.bills : null)}</td>
              <td className={`sb-percent ${achClass(achievement(all.actual, all.target))}`}>{fmtPct(achievement(all.actual, all.target))}</td>
            </tr>
          </tbody>
        </table>
      )}
      <p className="sb-foot-note">Target is each salesperson's monthly target up to {dayLabel(latestDate)}, the same rule as the Staff KPI sales report.</p>
    </Panel>
  );
}

/** A two-level table (group › sub-group) used by Merchandise Mix and Footwear by Department. */
function MixTable({ tree, firstColumn }) {
  const [open, setOpen] = useState(() => new Set());
  const toggle = (name) => setOpen((s) => { const n = new Set(s); if (n.has(name)) n.delete(name); else n.add(name); return n; });
  const { sort, onSort, sorted } = useSort({ textKeys: ['name'] });
  if (tree.length === 0) return <p className="sb-empty">No sales in this period.</p>;
  const cells = (n) => (
    <>
      <td className="sb-number">{fmtInt(n.qty)}</td>
      <td className="sb-number">{fmtInt(n.prevQty)}</td>
      <td className="sb-percent"><Delta value={n.qtyChange} /></td>
      <td className="sb-currency">{fmtINR(n.nsv)}</td>
      <td className="sb-currency">{fmtINR(n.prevNsv)}</td>
      <td className="sb-percent"><Delta value={n.nsvChange} /></td>
      <td className="sb-percent">{fmtPct(n.contribution)}</td>
    </>
  );
  return (
    <table className="sb-table">
      <thead>
        <SortHead sort={sort} onSort={onSort} cols={[['name', firstColumn], ['qty', 'Qty'], ['prevQty', 'Prev Qty'], ['qtyChange', 'Qty M2M'], ['nsv', 'NSV'], ['prevNsv', 'Prev NSV'], ['nsvChange', 'NSV M2M'], ['contribution', 'Contribution']]} />
      </thead>
      <tbody>
        {sorted(tree).map((n) => (
          <Fragment key={n.name}>
            <tr className="sb-week-row" onClick={() => toggle(n.name)}>
              <td className="sb-category"><span className="sb-toggle">{open.has(n.name) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}{n.name}</span></td>
              {cells(n)}
            </tr>
            {open.has(n.name) && sorted(n.children).map((c) => (
              <tr key={c.name} className="sb-day-row"><td className="sb-day-label">{c.name}</td>{cells(c)}</tr>
            ))}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}

function MerchandisePanels({ mix, rangeText, busy }) {
  const division = useMemo(() => mixTree(mix?.rows, mix?.prevRows, (r) => r.division, (r) => r.section, ['footwear', 'apparel', 'accessories']), [mix]);
  const footwear = useMemo(() => {
    const fw = (list) => (list || []).filter((r) => r.division === 'footwear');
    return mixTree(fw(mix?.rows), fw(mix?.prevRows), (r) => r.footwear_type, (r) => r.department, ['closed', 'open']);
  }, [mix]);
  const cmp = mix?.comparison;
  const note = `${rangeText}${cmp ? ` · compared with ${MONTH_NAMES[+cmp.start.slice(5, 7) - 1]} ${dayLabel(cmp.start)} – ${dayLabelLong(cmp.end)}` : ' · no previous period for a range longer than a month'}`;
  return (
    <>
      <Panel title="MERCHANDISE MIX" note={note} followsPeriod busy={busy}>
        {mix ? <MixTable tree={division} firstColumn="Division › Section" /> : <p className="sb-empty">Loading…</p>}
      </Panel>
      <Panel title="FOOTWEAR — BY DEPARTMENT" note="Closed / Open › Department" followsPeriod busy={busy}>
        {mix ? <MixTable tree={footwear} firstColumn="Type › Department" /> : <p className="sb-empty">Loading…</p>}
      </Panel>
    </>
  );
}

/** Annual Business Plan: one row per month since 1 July. */
function AnnualBusinessPlanPanel({ allDays, latestDate }) {
  const plan = useMemo(() => annualPlan(allDays, latestDate), [allDays, latestDate]);
  const { sort, onSort, sorted } = useSort({ textKeys: ['key'] });
  const gapOf = (m, k) => (k === 'gap' ? m.actual - m.target : m[k]);
  return (
    <Panel title="ANNUAL BUSINESS PLAN" note={`Year from ${dayLabelLong(plan.months[0].key + '-01')}`}>
      <table className="sb-table">
        <thead>
          <SortHead sort={sort} onSort={onSort} cols={[['key', 'Month'], ['target', 'Target'], ['actual', 'Actual'], ['gap', 'Gap'], ['ach', 'Ach %'], ['m2m', 'M2M %', { title: 'Change from the month before' }]]} />
        </thead>
        <tbody>
          {sorted(plan.months, gapOf).map((m) => (
            <tr key={m.key} className={m.isCurrent ? 'sb-current-month' : ''}>
              <td className={`sb-label ${m.isCurrent ? 'current' : ''}`}>
                {m.label}{m.isCurrent && <span className="sb-sub">to {dayLabel(latestDate)} · full month {fmtINR(m.fullTarget)}</span>}
              </td>
              <td className="sb-currency">{fmtINR(m.target)}</td>
              <td className="sb-currency">{fmtINR(m.actual)}</td>
              <td className={`sb-currency ${signClass(m.actual - m.target)}`}>{fmtINR(m.actual - m.target)}</td>
              <td className={`sb-percent ${achClass(m.ach)}`}>{fmtPct(m.ach)}</td>
              <td className="sb-percent"><Delta value={m.m2m} /></td>
            </tr>
          ))}
          <tr className="sb-ytd-row">
            <td className="sb-label">YTD</td>
            <td className="sb-currency">{fmtINR(plan.ytd.target)}</td>
            <td className="sb-currency">{fmtINR(plan.ytd.actual)}</td>
            <td className={`sb-currency ${signClass(plan.ytd.actual - plan.ytd.target)}`}>{fmtINR(plan.ytd.actual - plan.ytd.target)}</td>
            <td className={`sb-percent ${achClass(plan.ytd.ach)}`}>{fmtPct(plan.ytd.ach)}</td>
            <td className="sb-percent">—</td>
          </tr>
        </tbody>
      </table>
    </Panel>
  );
}

/** Store KPIs, month to date, each with its change from the same days one month earlier. */
function StoreKPIsPanel({ allDays, footfall, latestDate }) {
  const start = monthStart(latestDate);
  const prevStart = monthEarlier(start), prevEnd = monthEarlier(latestDate);
  const cards = useMemo(() => {
    const walk = (a, b) => inRange(footfall, a, b).reduce((s, r) => s + num(r.footfall), 0);
    const t = totals(inRange(allDays, start, latestDate)), p = totals(inRange(allDays, prevStart, prevEnd));
    const walkins = walk(start, latestDate);
    const k = kpisFrom(t, walkins), pk = kpisFrom(p, walk(prevStart, prevEnd));
    // tone = colour family; better = which direction is good news
    return [
      { tone: 'sales', label: 'Revenue (NSV)', value: fmtINR(t.nsv), how: 'Sum of taxable amount', cur: t.nsv, prev: p.nsv },
      { tone: 'sales', label: 'Bills', value: fmtInt(t.bills), how: 'Number of bills', cur: t.bills, prev: p.bills },
      { tone: 'sales', label: 'Quantity', value: fmtInt(t.qty), how: 'Units sold', cur: t.qty, prev: p.qty },
      { tone: 'basket', label: 'ATV', value: fmtINR(k.atv), how: 'NSV ÷ bills', cur: k.atv, prev: pk.atv },
      { tone: 'basket', label: 'UPT', value: fmtDec(k.upt), how: 'Units ÷ bills', cur: k.upt, prev: pk.upt },
      { tone: 'basket', label: 'ASP', value: fmtINR(k.asp), how: 'NSV ÷ units', cur: k.asp, prev: pk.asp },
      { tone: 'cross', label: 'FUPT', value: fmtDec(k.fupt), how: 'Footwear units ÷ bills', cur: k.fupt, prev: pk.fupt },
      { tone: 'cross', label: 'SFR', value: fmtDec(k.sfr), how: 'Socks ÷ footwear units', cur: k.sfr, prev: pk.sfr },
      { tone: 'cross', label: 'AFR', value: fmtDec(k.afr), how: 'Apparel ÷ footwear units', cur: k.afr, prev: pk.afr },
      { tone: 'cross', label: 'SSR', value: fmtPct(k.ssr), how: 'Socks ÷ shoes', cur: k.ssr, prev: pk.ssr },
      { tone: 'margin', label: 'MD %', value: fmtPct(k.mdPct), how: '(MRP − NSV) ÷ MRP', cur: k.mdPct, prev: pk.mdPct, better: 'down' },
      { tone: 'margin', label: 'Conversion %', value: fmtPct(k.conversion), cur: k.conversion, prev: pk.conversion,
        how: walkins > 0 ? `Bills ÷ footfall (${fmtInt(walkins)} walk-ins)` : 'Bills ÷ footfall · no footfall recorded this month' },
    ].map((c) => {
      const change = c.cur === null || c.prev === null ? null : pctChange(c.cur, c.prev);
      const good = change === null || change === 0 ? null : (c.better === 'down' ? change < 0 : change > 0);
      return { ...c, change, good };
    });
  }, [allDays, footfall, start, latestDate, prevStart, prevEnd]);

  return (
    <Panel title="STORE KPIS" note={`Month to date · ${dayLabel(start)} – ${dayLabelLong(latestDate)} · compared with ${MONTH_NAMES[+prevStart.slice(5, 7) - 1]} ${dayLabel(prevStart)} – ${dayLabel(prevEnd)}`}>
      <div className="sb-kpi-grid">
        {cards.map((c) => (
          <div key={c.label} className={`sb-kpi-card sb-tone-${c.tone}`} title={c.how}>
            <div className="sb-kpi-card-top">
              <span className="sb-kpi-card-label">{c.label}</span>
              <span className={`sb-kpi-chip ${c.good === null ? '' : c.good ? 'good' : 'bad'}`}>{c.change === null ? 'no comparison' : <Delta value={c.change} better={c.better} />}</span>
            </div>
            <div className="sb-kpi-card-value">{c.value}</div>
            <div className="sb-kpi-card-how">{c.how}</div>
          </div>
        ))}
      </div>
      <div className="sb-kpi-legend">
        <span className="sb-tone-sales">Sales</span><span className="sb-tone-basket">Basket</span><span className="sb-tone-cross">Cross-sell</span><span className="sb-tone-margin">Margin and conversion</span>
        <span className="sb-kpi-legend-note">▲ up, ▼ down against {MONTH_NAMES[+prevStart.slice(5, 7) - 1]} ({dayLabel(prevStart)} – {dayLabel(prevEnd)}). Green = better, red = worse. For MD %, lower is better.</span>
      </div>
    </Panel>
  );
}

/** Footfall for the selected period, by salesperson, with the conversion rate. */
function FootfallAnalyticsPanel({ allDays, footfall, range, rangeText }) {
  const rows = useMemo(() => inRange(footfall, range.start, range.end), [footfall, range]);
  const bills = useMemo(() => totals(inRange(allDays, range.start, range.end)).bills, [allDays, range]);
  const byPerson = useMemo(() => {
    const map = new Map();
    rows.forEach((r) => map.set(r.salesperson_name, (map.get(r.salesperson_name) || 0) + num(r.footfall)));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);
  const total = byPerson.reduce((s, [, n]) => s + n, 0);
  const { sort, onSort, sorted } = useSort({ textKeys: ['name'] });
  const cellOf = (row, k) => (k === 'name' ? row[0] : row[1]);
  const lastFootfall = (footfall || []).reduce((m, r) => (r.full_date > m ? r.full_date : m), '');

  return (
    <Panel title="FOOTFALL ANALYTICS" note={rangeText} followsPeriod>
      {total === 0 ? (
        <p className="sb-empty">No footfall recorded for this period.{lastFootfall ? ` Footfall is loaded up to ${dayLabelLong(lastFootfall)}.` : ''}</p>
      ) : (
        <>
          <table className="sb-table">
            <thead><SortHead sort={sort} onSort={onSort} cols={[['name', 'Salesperson'], ['footfall', 'Footfall'], ['share', '% of Total']]} /></thead>
            <tbody>
              {sorted(byPerson, cellOf).map(([name, n]) => (
                <tr key={name}><td className="sb-name">{name}</td><td className="sb-number">{fmtInt(n)}</td><td className="sb-percent">{fmtPct((n / total) * 100)}</td></tr>
              ))}
              <tr className="sb-ytd-row"><td className="sb-label">Store total</td><td className="sb-number">{fmtInt(total)}</td><td className="sb-percent">100.0%</td></tr>
            </tbody>
          </table>
          <div className="sb-conversion">
            <span>Conversion rate</span>
            <strong>{fmtPct((bills / total) * 100)}</strong>
            <span>{fmtInt(bills)} bills ÷ {fmtInt(total)} walk-ins</span>
          </div>
        </>
      )}
    </Panel>
  );
}

function StoreBoardContent() {
  const [dateMode, setDateMode] = useState(DEFAULT_DATE_MODE);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [board, setBoard] = useState(null);   // { firstDate, latestDate, days, footfall, salespersonData }
  const [mix, setMix] = useState(null);       // { rows, prevRows, comparison } for the selected period
  const [mixLoading, setMixLoading] = useState(false);
  const [month, setMonth] = useState('');     // 'YYYY-MM' from the Month filter; '' = latest month
  const [staff, setStaff] = useState(null);   // { date, rows } staff figures for a past month
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Every day on record, once. All fixed-period panels are worked out from these rows.
  const loadBoard = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const metaRes = await apiFetch('/api/store-board?meta=1');
      const meta = await metaRes.json();
      if (!metaRes.ok || !meta.success) throw new Error(meta.error || `HTTP ${metaRes.status}`);
      if (!meta.latestDate) throw new Error('No sales data available for the Uppal store yet.');
      const res = await apiFetch(`/api/store-board?${new URLSearchParams({ startDate: meta.firstDate, endDate: meta.latestDate })}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
      setBoard({ firstDate: meta.firstDate, latestDate: meta.latestDate, days: json.days || [], footfall: json.footfall || [], salespersonData: json.salespersonData || [] });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { loadBoard(); }, [loadBoard]);

  // Month filter: a past month moves the whole board to that month's last day, as if it were
  // being read then. '' (or the month of the latest sales date) is the board as it stands now.
  const dataLatest = board?.latestDate || null;
  const months = useMemo(() => {
    if (!board?.firstDate || !dataLatest) return [];
    const list = [];
    for (let key = dataLatest.slice(0, 7); key >= board.firstDate.slice(0, 7); key = monthEarlier(`${key}-01`).slice(0, 7)) list.push(key);
    return list;
  }, [board?.firstDate, dataLatest]);
  const latestDate = useMemo(() => {
    if (!dataLatest || !month || month === dataLatest.slice(0, 7)) return dataLatest;
    const [y, m] = month.split('-').map(Number);
    const end = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
    return end < dataLatest ? end : dataLatest;
  }, [month, dataLatest]);
  const pastMonth = Boolean(latestDate && latestDate !== dataLatest);

  // Staff figures come for one date; a past month needs them for that month's last day.
  useEffect(() => {
    if (!pastMonth) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(`/api/store-board?${new URLSearchParams({ startDate: latestDate, endDate: latestDate })}`);
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
        if (!cancelled) setStaff({ date: latestDate, rows: json.salespersonData || [] });
      } catch (err) {
        if (!cancelled) setError(`Individual performance: ${err.message}`);
      }
    })();
    return () => { cancelled = true; };
  }, [pastMonth, latestDate]);
  const staffRows = !pastMonth ? board?.salespersonData : staff?.date === latestDate ? staff.rows : null;

  const range = useMemo(() => rangeForMode(dateMode, latestDate, customStart, customEnd), [dateMode, latestDate, customStart, customEnd]);

  // Category rows for the selected period (and the same days one month earlier).
  useEffect(() => {
    if (!range) { setMix(null); return undefined; }
    let cancelled = false;
    setMixLoading(true); // the old rows stay on screen, dimmed, until the new ones arrive
    (async () => {
      try {
        const res = await apiFetch(`/api/reports/master-dashboard/category-drilldown?${new URLSearchParams({ startDate: range.start, endDate: range.end })}`);
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
        if (!cancelled) setMix({ rows: json.rows || [], prevRows: json.prevRows || [], comparison: json.comparison || null });
      } catch (err) {
        if (!cancelled) setError(`Merchandise mix: ${err.message}`);
      } finally {
        if (!cancelled) setMixLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [range]);

  const rangeText = range ? `${dayLabel(range.start)} – ${dayLabelLong(range.end)}` : 'Choose both dates';

  return (
    <div className="store-board-container">
      <div className="sb-top-bar">
        <div className="sb-top-left">
          <div className="sb-title-section">
            <h1>Store Board</h1>
            <span className="sb-store-path">{STORE_NAME}</span>
          </div>
        </div>
        <div className="sb-top-right">
          {dataLatest && <span className="sb-data-through">Data through {dayLabelLong(dataLatest)}</span>}
          <button type="button" className="sb-action-btn" onClick={loadBoard} disabled={loading}><RefreshCw size={14} />{loading ? 'Loading…' : 'Refresh'}</button>
          <button type="button" className="sb-action-btn" onClick={() => window.print()}><Printer size={14} />Print</button>
        </div>
      </div>

      <div className="sb-mode-bar">
        {MODES.map((mode) => (
          <button key={mode} type="button" className={`sb-mode-btn ${dateMode === mode ? 'active' : ''}`} onClick={() => setDateMode(mode)}>{mode.toUpperCase()}</button>
        ))}
        {dateMode === 'custom' && (
          <div className="sb-custom-dates">
            <input type="date" value={customStart} min={board?.firstDate || undefined} max={customEnd || dataLatest || undefined} onChange={(e) => setCustomStart(e.target.value)} className="sb-date-input" aria-label="Start date" />
            <span>to</span>
            <input type="date" value={customEnd} min={customStart || board?.firstDate || undefined} max={dataLatest || undefined} onChange={(e) => setCustomEnd(e.target.value)} className="sb-date-input" aria-label="End date" />
          </div>
        )}
        {months.length > 0 && (
          <label className="sb-custom-dates">
            Month
            <select className="sb-date-input" aria-label="Month" value={pastMonth ? month : ''}
              onChange={(e) => { setMonth(e.target.value); if (e.target.value) setDateMode('mtd'); }}>
              {months.map((key, i) => (
                <option key={key} value={i === 0 ? '' : key}>{MONTH_NAMES[+key.slice(5, 7) - 1]} {key.slice(0, 4)}{i === 0 ? ' (current)' : ''}</option>
              ))}
            </select>
          </label>
        )}
        <span className="sb-data-badge">{dateMode.toUpperCase()}: {rangeText}</span>
        <span className="sb-mode-note">
          {pastMonth && <strong>Showing the board as it stood on {dayLabelLong(latestDate)}. </strong>}
          The period buttons change the panels marked "follows period" (Merchandise Mix, Footwear, Footfall). Achievement always shows WTD / MTD / YTD together; the plans and KPIs are for the {pastMonth ? 'selected' : 'current'} month and its year.
        </span>
      </div>
      <div className={`sb-progress ${loading || mixLoading ? 'on' : ''}`} role="progressbar" aria-hidden={!(loading || mixLoading)}><span /></div>

      {error && (
        <div className="sb-error"><AlertCircle size={20} /><div><strong>Unable to load the Store Board</strong><p>{error}</p></div></div>
      )}

      {loading && !board ? (
        <div className="sb-loading"><div className="sb-spinner" /><p>Loading Store Board…</p></div>
      ) : board && (
        <div className="sb-content">
          <TargetVsAchievementPanel allDays={board.days} latestDate={latestDate} dateMode={dateMode} />
          <WeeklyBusinessPlanPanel allDays={board.days} latestDate={latestDate} />
          <IndividualPerformancePanel salespersonData={staffRows} latestDate={latestDate} />
          <MerchandisePanels mix={mix} rangeText={rangeText} busy={mixLoading} />
          <AnnualBusinessPlanPanel allDays={board.days} latestDate={latestDate} />
          <div className="sb-bottom-panels">
            <StoreKPIsPanel allDays={board.days} footfall={board.footfall} latestDate={latestDate} />
            {range && <FootfallAnalyticsPanel allDays={board.days} footfall={board.footfall} range={range} rangeText={rangeText} />}
          </div>
        </div>
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
