'use client';

// Filter bar for the Master Dashboard (single store, so no cluster / state / grade / store filters).
//   Row 1: comparison mode, custom dates + Apply, division
//   Row 2 (Month on month): quick range, week, month, half-year, quarter, financial / calendar
//   Row 2 (Compare):        Period A and Period B (year, month, optional week)
// It only shows and edits the selection; all date calculations live in src/lib/masterDashboardShared.js.

import { DIVISIONS, MONTH_NAMES, availableWeeks } from '@/lib/masterDashboardShared';

const QUICK = ['WTD', 'MTD', 'YTD', 'All'];

function Seg({ label, children }) {
  return (
    <div className="md-filter-item">
      {label && <span className="md-label">{label}</span>}
      <div className="md-seg" role="group" aria-label={label || undefined}>{children}</div>
    </div>
  );
}

function PeriodPicker({ title, value, onChange, years }) {
  const set = (patch) => onChange({ ...value, ...patch });
  return (
    <div className="md-filter-item">
      <span className="md-label">{title}</span>
      <select className="md-select-plain" value={value.year} onChange={(e) => set({ year: +e.target.value })} aria-label={`${title} year`}>
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
      <select className="md-select-plain" value={value.month} onChange={(e) => set({ month: +e.target.value })} aria-label={`${title} month`}>
        {MONTH_NAMES.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
      </select>
      <select className="md-select-plain" value={value.week} onChange={(e) => set({ week: +e.target.value })} aria-label={`${title} week`}>
        <option value={0}>Whole month</option>
        {[1, 2, 3, 4, 5].map((w) => <option key={w} value={w}>Week {w}</option>)}
      </select>
    </div>
  );
}

export default function MasterDashboardFilters({
  mode, onMode, sel, onSel, draft, onDraft, onApply,
  division, onDivision, latestDate, years, cmpA, cmpB, onCmpA, onCmpB,
}) {
  const weeks = latestDate ? availableWeeks(latestDate) : [];
  const on = (group, test = true) => sel.group === group && test;

  return (
    <div className="card md-filters md-filters-stack">
      {/* Row 1 */}
      <div className="md-filter-row">
        <div className="md-filter-group">
          <div className="md-seg" role="group" aria-label="Comparison mode">
            <button type="button" className={mode === 'm2m' ? 'active' : ''} onClick={() => onMode('m2m')}>Month on month</button>
            <button type="button" className={mode === 'compare' ? 'active' : ''} onClick={() => onMode('compare')}>Compare</button>
          </div>
          {mode === 'm2m' && (
            <>
              <div className="md-filter-item">
                <span className="md-label">From</span>
                <input type="date" className="md-date" value={draft.from} max={draft.to || undefined} onChange={(e) => onDraft({ ...draft, from: e.target.value })} />
              </div>
              <div className="md-filter-item">
                <span className="md-label">To</span>
                <input type="date" className="md-date" value={draft.to} min={draft.from || undefined} onChange={(e) => onDraft({ ...draft, to: e.target.value })} />
              </div>
              <button type="button" className="md-apply" onClick={onApply} disabled={!draft.from || !draft.to || draft.from > draft.to}>Apply</button>
            </>
          )}
        </div>
        <div className="md-seg" role="group" aria-label="Division">
          {DIVISIONS.map((d) => (
            <button key={d.value} type="button" className={division === d.value ? 'active' : ''} onClick={() => onDivision(d.value)}>{d.label}</button>
          ))}
        </div>
      </div>

      {/* Row 2 */}
      {mode === 'm2m' ? (
        <div className="md-filter-row md-filter-row-sub">
          <Seg label="Quick range">
            {QUICK.map((q) => (
              <button key={q} type="button" className={on('quick', sel.quick === q) ? 'active' : ''} onClick={() => onSel({ group: 'quick', quick: q })}>{q}</button>
            ))}
          </Seg>

          <Seg label="Week">
            <button type="button" className={sel.group !== 'week' ? 'active' : ''} onClick={() => sel.group === 'week' && onSel({ group: 'quick', quick: 'MTD' })}>All</button>
            {[1, 2, 3, 4, 5].map((w) => (
              <button key={w} type="button" disabled={!weeks.includes(w)} className={on('week', sel.week === w) ? 'active' : ''} onClick={() => onSel({ group: 'week', week: w })}
                      title={weeks.includes(w) ? undefined : 'This week has no data yet'}>{w}</button>
            ))}
          </Seg>

          <div className="md-filter-item">
            <span className="md-label">Month</span>
            <select className="md-select-plain" value={sel.group === 'month' ? sel.month : ''} aria-label="Month"
                    onChange={(e) => (e.target.value ? onSel({ group: 'month', month: +e.target.value }) : sel.group === 'month' && onSel({ group: 'quick', quick: 'MTD' }))}>
              <option value="">All</option>
              {MONTH_NAMES.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
            </select>
          </div>

          <Seg>
            {[1, 2].map((h) => (
              <button key={h} type="button" className={on('half', (sel.halves || []).includes(h)) ? 'active' : ''} onClick={() => onSel({ group: 'half', halves: toggle(sel.group === 'half' ? sel.halves : [], h), fiscal: sel.fiscal })}>H{h}</button>
            ))}
          </Seg>

          <Seg>
            {[1, 2, 3, 4].map((q) => (
              <button key={q} type="button" className={on('quarter', (sel.quarters || []).includes(q)) ? 'active' : ''} onClick={() => onSel({ group: 'quarter', quarters: toggle(sel.group === 'quarter' ? sel.quarters : [], q), fiscal: sel.fiscal })}>Q{q}</button>
            ))}
          </Seg>

          <Seg>
            <button type="button" className={sel.fiscal === 'financial' ? 'active' : ''} title="April to March" onClick={() => onSel({ fiscal: 'financial' })}>Financial</button>
            <button type="button" className={sel.fiscal === 'calendar' ? 'active' : ''} title="January to December" onClick={() => onSel({ fiscal: 'calendar' })}>Calendar</button>
          </Seg>
        </div>
      ) : (
        <div className="md-filter-row md-filter-row-sub">
          <PeriodPicker title="Period A" value={cmpA} onChange={onCmpA} years={years} />
          <span className="md-vs">vs</span>
          <PeriodPicker title="Period B" value={cmpB} onChange={onCmpB} years={years} />
        </div>
      )}
    </div>
  );
}

function toggle(list, item) {
  const has = list.includes(item);
  return has ? list.filter((x) => x !== item) : [...list, item].sort();
}
