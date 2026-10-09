'use client';

// Petty Cash tracker (Uppal Reebok).
//   store_manager  adds one or many entries, each with a photo of the debit voucher and of the
//                  receipt; saves drafts, submits for approval, edits drafts / rejected, deletes
//   admin          approves or rejects submitted entries (one or many); otherwise view only
// Two sources, shown together:
//   * the Account DSR Excel ("Petty cash" worksheet) -> the cash book lines. Refreshed on every
//     Account DSR upload (Data Upload page). Already spent, so no photo ("—") and no approval.
//     All cash received comes from here.
//   * entries made on this page -> draft -> submitted (reserved) -> approved | rejected.
// Data: /api/petty-cash (+ /expenses, /expenses/<id>, /expenses/decision, /expenses/<id>/photo).
// Roles are enforced in those routes; `role` only decides which buttons are shown. No balance is
// stored: src/lib/pettyCashShared.js works them out, and balances are always all-time so a date
// filter can never hide reserved cash. Only "Executed" and the cash book follow the period.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Wallet, Scale, Lock, Hourglass, CheckCircle2, Target, Download, Plus, Pencil, Trash2, Check, X, RefreshCw, FileSpreadsheet, ListChecks, Camera, Send, Save, AlertTriangle } from 'lucide-react';
import RequireAuth from '@/components/RequireAuth';
import { apiFetch } from '@/lib/api';
import { quickRange } from '@/lib/masterDashboardShared';
import { STORE_LABEL, CATEGORIES, STATUS_LABELS, PHOTO_KINDS, position, monthlySummary } from '@/lib/pettyCashShared';

const PRESETS = [['ALL', 'All'], ['MTD', 'MTD'], ['YTD', 'YTD']];
const STATUS_FILTERS = ['all', 'submitted', 'approved', 'rejected', 'draft'];
const todayIso = () => new Date().toLocaleDateString('en-CA');
let rowSeq = 0;
const blankRow = () => ({ key: ++rowSeq, id: null, expense_date: todayIso(), category: '', amount: '', description: '', voucher: null, receipt: null, has_voucher: false, has_receipt: false, error: null });

const money = (v) => {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
  const n = Number(v);
  return `${n < 0 ? '-' : ''}₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
};
const amountCell = (v) => (v ? money(v) : '');
const dayLabel = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const monthLabel = (ym) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const stamp = (ts) => new Date(ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const neg = (v) => (v < 0 ? 'pc-neg' : '');
const PLURALS = { entry: 'entries', day: 'days', line: 'lines' };
const plural = (n, word) => `${n} ${n === 1 ? word : PLURALS[word]}`;

// Phone photos are several MB; shrink to a 1600px JPEG in the browser so uploads stay small and fast.
async function shrinkPhoto(file) {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error('This file is not a photo the browser can open. Use a JPG or PNG.');
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.82));
  if (!blob) throw new Error('Could not prepare the photo.');
  return new File([blob], 'photo.jpg', { type: 'image/jpeg' });
}

function Kpi({ label, value, foot, icon: Icon, negative, title }) {
  return (
    <div className="card md-kpi" title={title}>
      <div className="md-kpi-top"><span className="md-label">{label}</span>{Icon && <Icon />}</div>
      <div className={`md-kpi-value ${negative ? 'pc-neg' : ''}`}>{value}</div>
      {foot && <div className="md-kpi-foot">{foot}</div>}
    </div>
  );
}

// Opens one photo of one entry in a new tab through a short-lived signed link.
function PhotoLink({ expenseId, kind, has }) {
  const [busy, setBusy] = useState(false);
  if (!has) return <span className="pc-dash">—</span>;
  const open = async () => {
    const tab = window.open('', '_blank'); // opened now (inside the click) so it is not blocked as a pop-up
    setBusy(true);
    try {
      const res = await apiFetch(`/api/petty-cash/expenses/${expenseId}/photo?kind=${kind}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.url) throw new Error(json.error || `HTTP ${res.status}`);
      if (tab) tab.location = json.url; else window.location.assign(json.url);
    } catch (err) {
      if (tab) tab.document.body.textContent = `Could not open the photo: ${err.message}`;
    } finally {
      setBusy(false);
    }
  };
  return <button type="button" className="pc-photo-link" onClick={open} disabled={busy}>{PHOTO_KINDS[kind]}</button>;
}

function PhotoPicker({ kind, row, onPick, disabled }) {
  const chosen = row[kind];
  const saved = row[`has_${kind}`];
  return (
    <label className={`pc-photo-pick ${chosen || saved ? 'has' : ''}`}>
      <Camera />
      <span>{chosen ? 'Photo added' : saved ? 'Saved · replace' : PHOTO_KINDS[kind]}</span>
      <input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={disabled}
        onChange={(e) => { onPick(kind, e.target.files?.[0] || null); e.target.value = ''; }} />
    </label>
  );
}

function PettyCash() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const [tab, setTab] = useState('entries');
  const [preset, setPreset] = useState('ALL');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [statusFilter, setStatusFilter] = useState('all');

  // Store manager: the entry form (several new rows, or one existing entry being changed)
  const [rows, setRows] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Admin: selection for approve / reject
  const [selected, setSelected] = useState(() => new Set());
  const [rejecting, setRejecting] = useState(null); // { ids } while the reason box is open
  const [reason, setReason] = useState('');
  const [deciding, setDeciding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch('/api/petty-cash');
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json);
      setSelected(new Set());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const entries = useMemo(() => data?.entries || [], [data]);
  const expenses = useMemo(() => data?.expenses || [], [data]);
  const isManager = data?.role === 'store_manager';
  const isAdmin = data?.role === 'admin';

  // Period presets are anchored on the latest cash book date, not on today.
  const ledgerDates = useMemo(() => [...entries.map((e) => e.entry_date), ...expenses.filter((x) => x.status === 'approved').map((x) => x.expense_date)].sort(), [entries, expenses]);
  const firstDate = ledgerDates[0] || null;
  const latestDate = ledgerDates[ledgerDates.length - 1] || null;
  const range = useMemo(() => {
    if (!latestDate || preset === 'ALL') return { start: null, end: null };
    if (preset === 'custom') return { start: custom.from || null, end: custom.to || null };
    const [start, end] = quickRange(preset, latestDate, firstDate);
    return { start, end };
  }, [preset, custom, latestDate, firstDate]);
  const filtered = Boolean(range.start || range.end);
  const rangeText = latestDate ? `${dayLabel(range.start || firstDate)} to ${dayLabel(range.end || latestDate)}` : '';

  const pos = useMemo(() => position(entries, expenses, data?.targetFloat ?? 15000, { ...range, today: todayIso() }), [entries, expenses, data, range]);
  const months = useMemo(() => monthlySummary(pos.ledger), [pos]);

  const counts = useMemo(() => Object.fromEntries(STATUS_FILTERS.map((s) => [s, s === 'all' ? expenses.length : expenses.filter((x) => x.status === s).length])), [expenses]);
  const shown = statusFilter === 'all' ? expenses : expenses.filter((x) => x.status === statusFilter);
  const pendingShown = shown.filter((x) => x.status === 'submitted');

  // ─── Store manager: entry form ────────────────────────────────────────────
  const openNew = () => { setRows([blankRow()]); setNotice(null); setConfirmDelete(null); };
  const openEdit = (x) => {
    setRows([{ ...blankRow(), id: x.id, expense_date: x.expense_date, category: x.category, amount: x.amount, description: x.description, has_voucher: x.has_voucher, has_receipt: x.has_receipt }]);
    setNotice(null); setConfirmDelete(null);
  };
  const setRow = (key, patch) => setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const pickPhoto = async (key, kind, file) => {
    if (!file) return;
    try {
      setRow(key, { [kind]: await shrinkPhoto(file), error: null });
    } catch (err) {
      setRow(key, { error: err.message });
    }
  };

  // Rows are sent one request each, so one bad row never loses the others; saved rows leave the form.
  const saveRows = async (status) => {
    setSaving(true); setNotice(null);
    let saved = 0;
    const left = [];
    for (const row of rows) {
      const missing = status === 'submitted' && (!(row.voucher || row.has_voucher) || !(row.receipt || row.has_receipt));
      if (missing) { left.push({ ...row, error: 'Add a photo of the debit voucher and of the receipt before submitting.' }); continue; }
      try {
        const fd = new FormData();
        ['expense_date', 'category', 'amount', 'description'].forEach((k) => fd.append(k, row[k] ?? ''));
        fd.append('status', status);
        if (row.voucher) fd.append('voucher', row.voucher);
        if (row.receipt) fd.append('receipt', row.receipt);
        const res = await apiFetch(row.id ? `/api/petty-cash/expenses/${row.id}` : '/api/petty-cash/expenses', { method: row.id ? 'PATCH' : 'POST', body: fd });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
        saved += 1;
      } catch (err) {
        left.push({ ...row, error: err.message });
      }
    }
    setSaving(false);
    setRows(left.length ? left : null);
    if (saved) {
      setNotice({ ok: true, text: `${plural(saved, 'entry')} ${status === 'submitted' ? 'submitted for approval' : 'saved as draft'}.${left.length ? ` ${plural(left.length, 'entry')} still to fix below.` : ''}` });
      await load();
    }
  };

  const deleteExpense = async (id) => {
    setSaving(true); setNotice(null);
    try {
      const res = await apiFetch(`/api/petty-cash/expenses/${id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
      setConfirmDelete(null);
      await load();
    } catch (err) {
      setNotice({ ok: false, text: err.message });
    } finally {
      setSaving(false);
    }
  };

  // ─── Admin: approve / reject ──────────────────────────────────────────────
  const toggle = (id) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allPendingSelected = pendingShown.length > 0 && pendingShown.every((x) => selected.has(x.id));
  const toggleAll = () => setSelected(allPendingSelected ? new Set() : new Set(pendingShown.map((x) => x.id)));

  const decide = async (ids, action, why) => {
    setDeciding(true); setNotice(null);
    try {
      const res = await apiFetch('/api/petty-cash/expenses/decision', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action, reason: why }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
      setNotice({ ok: true, text: `${plural(json.decided, 'entry')} ${action === 'approve' ? 'approved' : 'rejected'}.${json.skipped ? ` ${json.skipped} had already been decided or deleted.` : ''}` });
      setRejecting(null); setReason('');
      await load();
    } catch (err) {
      setNotice({ ok: false, text: err.message });
    } finally {
      setDeciding(false);
    }
  };

  // ─── Excel download of the cash book on screen ────────────────────────────
  const downloadExcel = async () => {
    const XLSX = await import('xlsx');
    const sheet = [
      [`Petty Cash - ${STORE_LABEL}`], [rangeText], [],
      ['Date', 'Voucher No', 'Description', 'Expenses', 'Credit', 'Balance', 'Source'],
      ...(filtered ? [['', '', 'Opening balance', '', '', pos.period.opening, '']] : []),
      ...pos.period.lines.map((e) => [e.entry_date.split('-').reverse().join('.'), e.voucher_no || '', e.description, e.expense || '', e.credit || '', e.balance, e.source === 'app' ? 'App entry (approved)' : 'Account DSR']),
      ['', '', 'Total', pos.period.expense, pos.period.credit, pos.period.closing, ''],
      [],
      ['Actual balance', pos.actual], ['Reserved (awaiting approval)', pos.reserved], ['Available balance', pos.available], ['Target float', pos.targetFloat], ['Refill needed', pos.refill],
    ];
    const ws = XLSX.utils.aoa_to_sheet(sheet);
    ws['!cols'] = [{ wch: 26 }, { wch: 11 }, { wch: 60 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Petty Cash');
    XLSX.writeFile(wb, `Uppal_Reebok_Petty_Cash_${range.end || latestDate || todayIso()}.xlsx`);
  };

  const hasAnything = entries.length > 0 || expenses.length > 0;
  const editingOne = rows?.length === 1 && rows[0].id;

  return (
    <div className="md-page">
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="page-header-icon-box"><Wallet className="page-header-icon-svg" /></div>
        <div className="page-header-text">
          <h1>Petty Cash</h1>
          <p>{STORE_LABEL} - petty cash tracker{data?.lastUpload ? ` · cash book from ${data.lastUpload.file_name}, ${stamp(data.lastUpload.uploaded_at)}` : ''}</p>
        </div>
        <div className="md-header-actions pc-header-actions">
          <button type="button" className="reebok-btn secondary" onClick={load} disabled={loading}><RefreshCw />{loading ? 'Loading…' : 'Refresh'}</button>
          <button type="button" className="reebok-btn secondary" onClick={downloadExcel} disabled={!hasAnything}><Download />Download .xlsx</button>
          {isManager && <button type="button" className="reebok-btn" onClick={openNew} disabled={Boolean(rows)}><Plus />New entries</button>}
        </div>
      </div>

      {error && <div className="reebok-error">Could not load petty cash: {error}</div>}
      {notice && <div className={notice.ok ? 'reebok-send-status success pn-result' : 'reebok-error'} role="status">{notice.ok && <CheckCircle2 />}{notice.text}</div>}
      {loading && !data && <div className="md-empty card">Loading petty cash…</div>}

      {data && (
        <>
          {isAdmin && pos.pendingCount > 0 && (
            <div className="md-notice pn-warn">
              <AlertTriangle />
              <div>
                <strong>{plural(pos.pendingCount, 'entry')} waiting for your approval</strong> ({money(pos.reserved)}){pos.pendingOldestDays !== null ? `, the oldest for ${plural(pos.pendingOldestDays, 'day')}` : ''}.
              </div>
            </div>
          )}

          <div className="md-kpis">
            <Kpi label="Available balance" value={money(pos.available)} icon={Wallet} negative={pos.available < 0}
              title="Actual balance minus reserved: what the store can still spend"
              foot={pos.available < 0 ? `Short by ${money(-pos.available)}` : 'Actual minus reserved'} />
            <Kpi label="Reserved amount" value={money(pos.reserved)} icon={Lock}
              title="Entries submitted and waiting for approval"
              foot={pos.pendingCount ? `${plural(pos.pendingCount, 'entry')} awaiting approval` : 'Nothing awaiting approval'} />
            <Kpi label="Actual balance" value={money(pos.actual)} icon={Scale} negative={pos.actual < 0}
              title="Cash received minus everything already spent or approved"
              foot="Available + reserved" />
            <Kpi label="Pending exposure" value={pos.pendingShare === null ? (pos.pendingCount ? money(pos.reserved) : '0%') : `${pos.pendingShare}%`} icon={Hourglass}
              title="Reserved amount as a share of the actual balance"
              foot={pos.pendingCount ? `${money(pos.reserved)} of actual${pos.pendingOldestDays !== null ? ` · oldest ${plural(pos.pendingOldestDays, 'day')}` : ''}` : 'No entries pending'} />
            <Kpi label="Executed expenses" value={money(pos.executed)} icon={CheckCircle2}
              title="Spent in the selected period: Account DSR lines plus approved entries"
              foot={`${filtered ? rangeText : 'All time'} · DSR ${money(pos.executedExcel)} · approved ${money(pos.executedApp)}`} />
            <Kpi label="Target float" value={money(pos.targetFloat)} icon={Target}
              title="Cash the store should have on hand"
              foot={pos.refill > 0 ? `Refill needed ${money(pos.refill)}` : 'Funded'} />
          </div>

          {rows && (
            <div className="card">
              <div className="card-header mx-card-head">
                <Plus className="card-header-icon-svg" />
                <h3>{editingOne ? 'Change entry' : `New entries · ${rows.length}`}</h3>
                <div className="mx-card-actions">
                  <button type="button" className="reebok-btn secondary" onClick={() => setRows(null)} disabled={saving}><X />Close</button>
                  <button type="button" className="reebok-btn secondary" onClick={() => saveRows('draft')} disabled={saving}><Save />{saving ? 'Saving…' : 'Save as draft'}</button>
                  <button type="button" className="reebok-btn" onClick={() => saveRows('submitted')} disabled={saving}><Send />{saving ? 'Saving…' : `Submit ${rows.length > 1 ? `${rows.length} ` : ''}for approval`}</button>
                </div>
              </div>
              <p className="md-note">Each entry needs a photo of the debit voucher and of the receipt before it can be submitted. Drafts can be saved without photos.</p>
              <div className="md-table-wrap">
                <table className="md-table md-table-compact pc-table pc-form">
                  <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount (₹)</th><th>Debit voucher</th><th>Receipt</th><th aria-label="Remove" /></tr></thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.key} className="pc-edit-row">
                        <td><input type="date" className="md-date" value={row.expense_date} max={todayIso()} onChange={(e) => setRow(row.key, { expense_date: e.target.value })} disabled={saving} aria-label="Date" /></td>
                        <td>
                          <select className="pc-input" value={row.category} onChange={(e) => setRow(row.key, { category: e.target.value })} disabled={saving} aria-label="Category">
                            <option value="">Select</option>
                            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </td>
                        <td className="pc-desc">
                          <input type="text" className="pc-input" value={row.description} maxLength={300} placeholder="What was it for" onChange={(e) => setRow(row.key, { description: e.target.value })} disabled={saving} aria-label="Description" />
                          {row.error && <div className="pc-row-error">{row.error}</div>}
                        </td>
                        <td><input type="number" className="pc-input pc-input-amount" value={row.amount} min="0" step="0.01" placeholder="0" onChange={(e) => setRow(row.key, { amount: e.target.value })} disabled={saving} aria-label="Amount" /></td>
                        <td><PhotoPicker kind="voucher" row={row} onPick={(kind, file) => pickPhoto(row.key, kind, file)} disabled={saving} /></td>
                        <td><PhotoPicker kind="receipt" row={row} onPick={(kind, file) => pickPhoto(row.key, kind, file)} disabled={saving} /></td>
                        <td className="pc-actions">
                          {!editingOne && rows.length > 1 && <button type="button" className="pc-icon-btn" onClick={() => setRows((list) => list.filter((r) => r.key !== row.key))} disabled={saving} title="Remove this row"><X /></button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!editingOne && <button type="button" className="reebok-btn secondary pc-add-row" onClick={() => setRows((list) => [...list, blankRow()])} disabled={saving}><Plus />Add another entry</button>}
            </div>
          )}

          <div className="pc-filters">
            <div className="md-seg">
              <button type="button" className={tab === 'entries' ? 'active' : ''} onClick={() => setTab('entries')}>Entries{counts.submitted ? ` · ${counts.submitted} pending` : ''}</button>
              <button type="button" className={tab === 'book' ? 'active' : ''} onClick={() => setTab('book')}>Cash book</button>
            </div>
            <span className="pc-range">Period</span>
            <div className="md-seg">
              {PRESETS.map(([key, label]) => <button key={key} type="button" className={preset === key ? 'active' : ''} onClick={() => setPreset(key)} disabled={!latestDate}>{label}</button>)}
            </div>
            <label className="pc-range">From
              <input type="date" className="md-date" disabled={!latestDate} value={preset === 'custom' ? custom.from : (range.start || firstDate || '')} max={custom.to || undefined}
                onChange={(e) => { setCustom((c) => ({ from: e.target.value, to: preset === 'custom' ? c.to : (range.end || latestDate || '') })); setPreset('custom'); }} />
            </label>
            <label className="pc-range">To
              <input type="date" className="md-date" disabled={!latestDate} value={preset === 'custom' ? custom.to : (range.end || latestDate || '')} min={custom.from || undefined}
                onChange={(e) => { setCustom((c) => ({ from: preset === 'custom' ? c.from : (range.start || firstDate || ''), to: e.target.value })); setPreset('custom'); }} />
            </label>
          </div>

          {tab === 'entries' && (
            <div className="card">
              <div className="card-header mx-card-head">
                <ListChecks className="card-header-icon-svg" />
                <h3>Entries made here · {shown.length}</h3>
                <div className="mx-card-actions">
                  {isAdmin && selected.size > 0 && (
                    <>
                      <button type="button" className="reebok-btn secondary" onClick={() => { setRejecting({ ids: [...selected] }); setReason(''); }} disabled={deciding}><X />Reject {selected.size}</button>
                      <button type="button" className="reebok-btn" onClick={() => decide([...selected], 'approve')} disabled={deciding}><Check />{deciding ? 'Saving…' : `Approve ${selected.size}`}</button>
                    </>
                  )}
                </div>
              </div>
              <div className="md-seg pc-status-seg">
                {STATUS_FILTERS.map((s) => <button key={s} type="button" className={statusFilter === s ? 'active' : ''} onClick={() => setStatusFilter(s)}>{s === 'all' ? 'All' : STATUS_LABELS[s]} · {counts[s]}</button>)}
              </div>

              {rejecting && (
                <div className="md-notice pc-reject-box">
                  <strong>Reject {plural(rejecting.ids.length, 'entry')}</strong>
                  <input type="text" className="pc-input" value={reason} maxLength={300} placeholder="Reason (the store manager sees this)" onChange={(e) => setReason(e.target.value)} autoFocus />
                  <button type="button" className="reebok-btn" onClick={() => decide(rejecting.ids, 'reject', reason)} disabled={deciding || !reason.trim()}>{deciding ? 'Saving…' : 'Reject'}</button>
                  <button type="button" className="reebok-btn secondary" onClick={() => setRejecting(null)} disabled={deciding}>Cancel</button>
                </div>
              )}

              {shown.length === 0 ? (
                <div className="md-empty">
                  {expenses.length === 0
                    ? (isManager ? 'No entries yet. Use "New entries" to add expenses with their voucher and receipt photos.' : 'The store manager has not added any entries here yet. Lines from the Account DSR are in the Cash book tab.')
                    : 'No entries with this status.'}
                </div>
              ) : (
                <div className="md-table-wrap">
                  <table className="md-table md-table-compact pc-table pc-entries">
                    <thead>
                      <tr>
                        {isAdmin && <th className="pc-check"><input type="checkbox" checked={allPendingSelected} onChange={toggleAll} disabled={pendingShown.length === 0} aria-label="Select all pending" /></th>}
                        <th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th>Photos</th><th>Status</th><th aria-label="Actions" />
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((x) => (
                        <tr key={x.id}>
                          {isAdmin && <td className="pc-check">{x.status === 'submitted' && <input type="checkbox" checked={selected.has(x.id)} onChange={() => toggle(x.id)} aria-label="Select entry" />}</td>}
                          <td>{dayLabel(x.expense_date)}</td>
                          <td>{x.category}</td>
                          <td className="pc-desc">
                            {x.description}
                            {x.status === 'rejected' && x.rejection_reason && <div className="pc-row-error">Rejected: {x.rejection_reason}</div>}
                            {x.status === 'submitted' && x.submitted_at && <div className="pc-sub">Submitted {stamp(x.submitted_at)}{isAdmin && x.created_by_email ? ` by ${x.created_by_email}` : ''}</div>}
                            {x.status === 'approved' && x.decided_at && <div className="pc-sub">Approved {stamp(x.decided_at)}{x.decided_by_email ? ` by ${x.decided_by_email}` : ''}</div>}
                          </td>
                          <td>{money(x.amount)}</td>
                          <td className="pc-photos">{x.has_voucher || x.has_receipt ? <><PhotoLink expenseId={x.id} kind="voucher" has={x.has_voucher} /> <PhotoLink expenseId={x.id} kind="receipt" has={x.has_receipt} /></> : <span className="pc-dash">—</span>}</td>
                          <td><span className={`pc-status pc-status-${x.status}`}>{STATUS_LABELS[x.status]}</span></td>
                          <td className="pc-actions">
                            {isAdmin && x.status === 'submitted' && (
                              <>
                                <button type="button" className="pc-icon-btn pc-ok" onClick={() => decide([x.id], 'approve')} disabled={deciding} title="Approve"><Check /></button>
                                <button type="button" className="pc-icon-btn pc-danger" onClick={() => { setRejecting({ ids: [x.id] }); setReason(''); }} disabled={deciding} title="Reject"><X /></button>
                              </>
                            )}
                            {isManager && x.status !== 'approved' && (confirmDelete === x.id ? (
                              <>
                                <span className="pc-confirm">Delete?</span>
                                <button type="button" className="pc-icon-btn pc-danger" onClick={() => deleteExpense(x.id)} disabled={saving} title="Yes, delete"><Check /></button>
                                <button type="button" className="pc-icon-btn" onClick={() => setConfirmDelete(null)} disabled={saving} title="Keep"><X /></button>
                              </>
                            ) : (
                              <>
                                {(x.status === 'draft' || x.status === 'rejected') && <button type="button" className="pc-icon-btn" onClick={() => openEdit(x)} disabled={Boolean(rows)} title={x.status === 'rejected' ? 'Fix and send again' : 'Change or submit'}><Pencil /></button>}
                                <button type="button" className="pc-icon-btn" onClick={() => setConfirmDelete(x.id)} disabled={Boolean(rows)} title="Delete entry"><Trash2 /></button>
                              </>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 'book' && (
            <>
              <div className="card">
                <div className="card-header mx-card-head">
                  <FileSpreadsheet className="card-header-icon-svg" />
                  <h3>Cash book · {plural(pos.period.lines.length, 'line')}{rangeText ? ` · ${rangeText}` : ''}</h3>
                </div>
                <p className="md-note">Lines from the Account DSR Excel plus the entries approved here. Cash received {money(pos.received)} (head office {money(pos.headOffice)} · sale cash {money(pos.saleCash)}).</p>
                {pos.period.lines.length === 0 && !filtered ? (
                  <div className="md-empty">No cash book lines yet. They come in with the next Account DSR uploaded on the Data Upload page.</div>
                ) : (
                  <div className="md-table-wrap">
                    <table className="md-table md-table-compact pc-table">
                      <thead><tr><th>Date</th><th>Voucher</th><th>Description</th><th>Expense</th><th>Credit</th><th>Balance</th><th>Photos</th></tr></thead>
                      <tbody>
                        {filtered && <tr className="pc-opening"><td /><td /><td className="pc-desc">Opening balance</td><td /><td /><td className={neg(pos.period.opening)}>{money(pos.period.opening)}</td><td /></tr>}
                        {pos.period.lines.map((e) => (
                          <tr key={e.id}>
                            <td>{dayLabel(e.entry_date)}</td>
                            <td>{e.voucher_no || ''}</td>
                            <td className="pc-desc">
                              {e.description || <em>no description</em>}
                              {e.credit_source === 'sale_cash' && <span className="pc-tag">sale cash</span>}
                              {e.source === 'app' && <span className="pc-tag pc-tag-app">approved entry</span>}
                            </td>
                            <td>{amountCell(e.expense)}</td>
                            <td className="pc-credit">{amountCell(e.credit)}</td>
                            <td className={neg(e.balance)}>{money(e.balance)}</td>
                            <td className="pc-photos">
                              {e.source === 'app'
                                ? <><PhotoLink expenseId={e.expense_id} kind="voucher" has={e.has_voucher} /> <PhotoLink expenseId={e.expense_id} kind="receipt" has={e.has_receipt} /></>
                                : <span className="pc-dash">—</span>}
                            </td>
                          </tr>
                        ))}
                        {pos.period.lines.length === 0 && <tr><td colSpan={7} className="pc-none">No lines in this date range.</td></tr>}
                        <tr className="md-total-row">
                          <td>Total</td><td /><td /><td>{money(pos.period.expense)}</td><td>{money(pos.period.credit)}</td>
                          <td className={neg(pos.period.closing)}>{money(pos.period.closing)}</td><td />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {months.length > 0 && (
                <div className="card">
                  <div className="card-header mx-card-head"><Scale className="card-header-icon-svg" /><h3>Month by month</h3></div>
                  <div className="md-table-wrap">
                    <table className="md-table md-table-compact">
                      <thead><tr><th>Month</th><th>Cash from head office</th><th>Sale cash used</th><th>Spent</th><th>Balance at month end</th></tr></thead>
                      <tbody>
                        {months.map((m) => (
                          <tr key={m.month}>
                            <td>{monthLabel(m.month)}</td><td>{money(m.headOffice)}</td><td>{money(m.saleCash)}</td><td>{money(m.expense)}</td>
                            <td className={neg(m.closing)}>{money(m.closing)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

export default function PettyCashPage() {
  return (
    <RequireAuth roles={['admin', 'store_manager']}>
      <PettyCash />
    </RequireAuth>
  );
}
