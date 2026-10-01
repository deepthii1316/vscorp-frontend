'use client';

// Sell-Through tab: article-level (style + colour) 30-day sell-through, expandable to sizes.
// Identifies fast movers (>= 60%) and slow movers (< 15% while holding stock).

import { Fragment, useEffect, useMemo, useState } from 'react';
import { Gauge, Search, ChevronDown, ChevronRight } from 'lucide-react';
import { Kpi, CardHead, ExportButton, exportSheets, Pager, SortTh, nextSort, sortRows } from './MerchCommon';
import {
  articleRows, speedOf, SPEED_LABEL, ST_FAST, ST_SLOW, sellThrough, coverDays, COVER_TIP,
  divisionLabel, shortDate, formatDays,
} from '@/lib/merchShared';
import { formatINRFull, formatNumber, formatPercent } from '@/lib/masterDashboardShared';

const PAGE = 50;
const SPEEDS = ['all', 'fast', 'mid', 'slow', 'none', 'soldout'];

function stCls(speed) {
  if (speed === 'fast' || speed === 'soldout') return 'mx-good';
  if (speed === 'slow' || speed === 'none') return 'mx-bad';
  return '';
}

export default function MerchSellThrough({ rows, rateDays, onLookup, asOfLabel }) {
  const [speed, setSpeed] = useState('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState({ key: 'sellThrough', dir: 'desc' });
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(() => new Set());

  const articles = useMemo(() => articleRows(rows, rateDays).map((a) => ({ ...a, speed: speedOf(a) })), [rows, rateDays]);
  const counts = useMemo(() => {
    const c = Object.fromEntries(SPEEDS.map((s) => [s, 0]));
    articles.forEach((a) => { c[a.speed] += 1; c.all += 1; });
    return c;
  }, [articles]);

  const filtered = useMemo(() => {
    const s = q.trim().toUpperCase();
    const hits = articles.filter((a) => (speed === 'all' || a.speed === speed)
      && (!s || [a.name, a.style, a.color, a.articleType, ...a.sizes.map((r) => r.barcode)].some((v) => String(v || '').toUpperCase().includes(s))));
    return sortRows(hits, sort);
  }, [articles, speed, q, sort]);

  useEffect(() => { setPage(0); }, [speed, q, sort, rows]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const view = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const onSort = (k) => setSort((s) => nextSort(s, k, k === 'name' ? 'asc' : 'desc'));
  const th = (k, label, title) => <SortTh k={k} label={label} sort={sort} onSort={onSort} title={title} />;
  const toggle = (key) => setOpen((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const fast = articles.filter((a) => a.speed === 'fast');
  const slow = articles.filter((a) => a.speed === 'slow' || a.speed === 'none');
  const slowStock = slow.reduce((s, a) => s + a.stockQty, 0);

  const doExport = () => {
    const pct = (v) => (v == null ? null : +v.toFixed(1));
    exportSheets(`merch-sell-through-${asOfLabel}.xlsx`, [
      { name: 'Articles', rows: filtered.map((a) => ({
        Article: a.name, 'Style code': a.style, Colour: a.color, Division: divisionLabel(a.division), Department: a.department,
        Section: a.section, 'Article type': a.articleType, MRP: a.mrp, Sizes: a.sizes.length, 'Stock qty': a.stockQty,
        'Sold 30d': a.qty30, 'Sell-through 30d %': pct(a.sellThrough), 'Sold MTD': a.qtyMtd, 'NSV 30d': Math.round(a.nsv30),
        'Cover (days)': a.cover == null ? null : Math.round(a.cover), Speed: SPEED_LABEL[a.speed], 'Last sale': a.lastSale,
      })) },
      { name: 'Sizes', rows: filtered.flatMap((a) => a.sizes.map((r) => ({
        Article: a.name, 'Style code': a.style, Size: r.size, Barcode: r.barcode, 'Stock qty': r.stock_qty, 'Sold 30d': r.sales_qty_30d,
        'Sell-through 30d %': pct(sellThrough(r.sales_qty_30d, r.stock_qty)), 'Last sale': r.last_sale_date,
      }))) },
    ]);
  };

  return (
    <>
      <div className="md-kpis">
        <Kpi label="Articles" icon={Gauge} value={formatNumber(articles.length)} foot="Style + colour, in stock or sold in 30d" />
        <Kpi label={`Fast movers (≥ ${ST_FAST}%)`} value={formatNumber(fast.length)} foot={`${formatNumber(counts.soldout)} more sold out`} />
        <Kpi label={`Slow movers (< ${ST_SLOW}%)`} value={formatNumber(slow.length)} foot={`${formatNumber(counts.none)} with no sale in 30 days`} />
        <Kpi label="Units in slow movers" value={formatNumber(slowStock)} foot="Stock on hand in slow / unsold articles" />
      </div>

      <div className="card">
        <CardHead icon={Gauge} title="Sell-through by article (last 30 days)">
          <ExportButton onClick={doExport} disabled={!filtered.length} />
        </CardHead>
        <p className="md-note">
          Sell-through = sold in 30 days ÷ (sold + on hand). Green: {ST_FAST}% or more (fast). Red: under {ST_SLOW}% while holding stock (slow).
          Click an article to see its sizes; click a barcode for its full history.
        </p>
        <div className="mx-list-head">
          <div className="md-seg" role="group" aria-label="Speed">
            {SPEEDS.map((s) => (
              <button key={s} type="button" className={speed === s ? 'active' : ''} onClick={() => setSpeed(s)}>
                {s === 'all' ? 'All' : SPEED_LABEL[s]} ({formatNumber(counts[s])})
              </button>
            ))}
          </div>
          <label className="mx-search">
            <Search />
            <input type="search" placeholder="Search article, style, colour, barcode" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
        {filtered.length === 0 ? <div className="md-empty">No articles match.</div> : (
          <>
            <div className="md-table-wrap">
              <table className="md-table md-table-compact md-drill">
                <thead>
                  <tr>
                    {th('name', 'Article')}<th>Category</th>{th('mrp', 'MRP')}
                    {th('stockQty', 'Stock')}{th('qty30', 'Sold 30d')}{th('sellThrough', 'Sell-thru 30d')}
                    {th('qtyMtd', 'Sold MTD')}{th('cover', 'Cover', COVER_TIP)}{th('lastSale', 'Last sale')}<th>Speed</th>
                  </tr>
                </thead>
                <tbody>
                  {view.map((a) => {
                    const isOpen = open.has(a.key);
                    return (
                      <Fragment key={a.key}>
                        <tr className="md-drill-row has-children" data-depth={0} onClick={() => toggle(a.key)}>
                          <td className="mx-name">
                            <span className="md-drill-label">
                              <span className="md-drill-chevron">{isOpen ? <ChevronDown /> : <ChevronRight />}</span>
                              <span>{a.name}<small className="mx-sub">{a.style}{a.color ? ` · ${a.color}` : ''} · {a.sizes.length} size{a.sizes.length > 1 ? 's' : ''}</small></span>
                            </span>
                          </td>
                          <td className="mx-cat">{divisionLabel(a.division)} › {a.department} › {a.articleType}</td>
                          <td>{a.mrp ? formatINRFull(a.mrp) : '—'}</td>
                          <td>{formatNumber(a.stockQty)}</td>
                          <td>{formatNumber(a.qty30)}</td>
                          <td className={stCls(a.speed)}>{formatPercent(a.sellThrough)}</td>
                          <td>{formatNumber(a.qtyMtd)}</td>
                          <td>{formatDays(a.cover)}</td>
                          <td>{a.lastSale ? shortDate(a.lastSale) : 'Never'}</td>
                          <td><span className={`mx-speed mx-speed-${a.speed}`}>{SPEED_LABEL[a.speed]}</span></td>
                        </tr>
                        {isOpen && a.sizes.map((r) => {
                          const st = sellThrough(r.sales_qty_30d, r.stock_qty);
                          return (
                            <tr key={r.barcode} className="md-drill-row" data-depth={2}>
                              <td className="mx-size-cell">
                                Size {r.size || '—'} · <button type="button" className="mx-link" onClick={(e) => { e.stopPropagation(); onLookup(r.barcode); }}>{r.barcode}</button>
                              </td>
                              <td />
                              <td>{r.mrp ? formatINRFull(r.mrp) : '—'}</td>
                              <td>{formatNumber(r.stock_qty)}</td>
                              <td>{formatNumber(r.sales_qty_30d)}</td>
                              <td>{formatPercent(st)}</td>
                              <td>{formatNumber(r.sales_qty_mtd)}</td>
                              <td>{formatDays(coverDays(r.stock_qty, r.sales_qty_rate, rateDays))}</td>
                              <td>{r.last_sale_date ? shortDate(r.last_sale_date) : 'Never'}</td>
                              <td />
                            </tr>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pager page={page} pages={pages} total={filtered.length} onPage={setPage} />
          </>
        )}
      </div>
    </>
  );
}
