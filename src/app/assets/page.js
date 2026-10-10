'use client';

// Asset Tracker: what each store physically has, by category and item. Admin only.
//   * pick a store (or add one); the cards, the register and the category summary are that store's
//   * add an asset, change its brand / specification / quantity / remark, or remove it
//   * import the store's asset Excel: every row is shown first with what will happen to it
//     (added, updated, skipped, or why it cannot be read); nothing is saved until Import is pressed
// Data: /api/assets (+ /<id>, /stores, /import). The admin role is enforced in those routes.
// Rules and figures: src/lib/assetShared.js. Excel reading: src/lib/assetExcel.js.
// Nothing here is sample data: an empty store shows an empty register.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Boxes, Hash, AlertTriangle, Layers, Plus, Pencil, Trash2, Check, X, RefreshCw, Upload, FileSpreadsheet, Download, Search, Save, CheckCircle2, Store } from 'lucide-react';
import RequireAuth from '@/components/RequireAuth';
import { apiFetch } from '@/lib/api';
import { SortTh, useSort } from '@/components/SortTh';
import { stats, byCategory, filterAssets, nameKey, LIMITS, MAX_QUANTITY } from '@/lib/assetShared';
import { parseAssetWorkbook, planImport, matchStore, buildTemplate } from '@/lib/assetExcel';
import './assets.css';

const STORE_KEY = 'assets-store';
const NEW_STORE = '__new__';
const PREVIEW_ROWS = 300;
const blankForm = () => ({ category: '', item: '', brand: '', specification: '', quantity: '', remark: '', error: null });
const count = (n) => Number(n || 0).toLocaleString('en-IN');
const stamp = (ts) => new Date(ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const plural = (n, word) => `${count(n)} ${word}${n === 1 ? '' : 's'}`;
const STATUS_TEXT = { insert: 'New', update: 'Update', skip: 'Skipped', error: 'Cannot read' };

function Kpi({ label, value, foot, icon: Icon, negative, title }) {
  return (
    <div className="card md-kpi" title={title}>
      <div className="md-kpi-top"><span className="md-label">{label}</span>{Icon && <Icon />}</div>
      <div className={`md-kpi-value ${negative ? 'pc-neg' : ''}`}>{value}</div>
      {foot && <div className="md-kpi-foot">{foot}</div>}
    </div>
  );
}

async function send(url, method, body) {
  const res = await apiFetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

function Assets() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [saving, setSaving] = useState(false);

  const [view, setView] = useState('register');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [zeroOnly, setZeroOnly] = useState(false);

  const [form, setForm] = useState(null);             // the add / change form
  const [newStore, setNewStore] = useState(null);     // { name, code } while the add-store box is open
  const [imp, setImp] = useState(null);               // the import panel: { fileName, parsed, sheet, target, newName, newCode, readError }
  const fileRef = useRef(null);

  const load = useCallback(async (storeId) => {
    setLoading(true); setError(null);
    try {
      let wanted = storeId;
      if (wanted === undefined) { try { wanted = localStorage.getItem(STORE_KEY) || ''; } catch { wanted = ''; } }
      const json = await send(`/api/assets${wanted ? `?store=${encodeURIComponent(wanted)}` : ''}`, 'GET');
      setData(json);
      try { if (json.store) localStorage.setItem(STORE_KEY, json.store.id); } catch { /* remembered per browser only */ }
      return json;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const store = data?.store || null;
  const stores = useMemo(() => data?.stores || [], [data]);
  const assets = useMemo(() => data?.assets || [], [data]);
  const totals = useMemo(() => stats(assets), [assets]);
  const categoryRows = useMemo(() => byCategory(assets), [assets]);
  const shown = useMemo(() => filterAssets(assets, { search, category, zeroOnly }), [assets, search, category, zeroOnly]);
  const filtered = Boolean(search || category || zeroOnly);

  const switchStore = (id) => {
    if (id === NEW_STORE) { setNewStore({ name: '', code: '' }); return; }
    setForm(null); setConfirmDelete(null); setNotice(null); setCategory(''); setSearch(''); setZeroOnly(false);
    load(id);
  };

  // ─── Stores ───────────────────────────────────────────────────────────────
  const saveStore = async () => {
    setSaving(true); setNotice(null);
    try {
      const json = await send('/api/assets/stores', 'POST', newStore);
      setNewStore(null);
      setNotice({ ok: true, text: `Store "${json.store.name}" added.` });
      await load(json.store.id);
    } catch (err) {
      setNotice({ ok: false, text: err.message });
    } finally {
      setSaving(false);
    }
  };

  // ─── Add / change / remove one asset ──────────────────────────────────────
  const [confirmDelete, setConfirmDelete] = useState(null);
  const openAdd = () => { setForm({ ...blankForm(), category }); setNotice(null); setConfirmDelete(null); };
  const openEdit = (a) => {
    setForm({ id: a.id, category: a.category, item: a.item, brand: a.brand || '', specification: a.specification || '', quantity: String(a.quantity), remark: a.remark || '', error: null });
    setNotice(null); setConfirmDelete(null);
  };
  const setField = (patch) => setForm((f) => ({ ...f, ...patch, error: null }));
  const itemSuggestions = useMemo(() => {
    if (!form || form.id) return [];
    const cat = (data?.categories || []).find((c) => nameKey(c.name) === nameKey(form.category));
    const held = new Set(assets.filter((a) => nameKey(a.category) === nameKey(form.category)).map((a) => nameKey(a.item)));
    return (data?.items || []).filter((i) => cat && i.category_id === cat.id && !held.has(nameKey(i.name))).map((i) => i.name);
  }, [form, data, assets]);

  const saveForm = async () => {
    setSaving(true);
    try {
      const fields = { brand: form.brand, specification: form.specification, quantity: form.quantity, remark: form.remark };
      if (form.id) await send(`/api/assets/${form.id}`, 'PATCH', fields);
      else await send('/api/assets', 'POST', { store_id: store.id, category: form.category, item: form.item, ...fields });
      setNotice({ ok: true, text: form.id ? `${form.item} updated.` : `${form.item.trim()} added to ${store.name}.` });
      setForm(null);
      await load(store.id);
    } catch (err) {
      setForm((f) => ({ ...f, error: err.message }));
    } finally {
      setSaving(false);
    }
  };

  const deleteAsset = async (a) => {
    setSaving(true); setNotice(null);
    try {
      await send(`/api/assets/${a.id}`, 'DELETE');
      setConfirmDelete(null);
      setNotice({ ok: true, text: `${a.item} removed from ${store.name}.` });
      await load(store.id);
    } catch (err) {
      setNotice({ ok: false, text: err.message });
    } finally {
      setSaving(false);
    }
  };

  // ─── Excel import ─────────────────────────────────────────────────────────
  const openImport = () => { setImp({ fileName: null, parsed: null, sheet: 0, target: store?.id || NEW_STORE, newName: '', newCode: '', readError: null }); setNotice(null); setForm(null); };
  const targetFor = (sheet) => {
    const match = sheet.storeGuess ? matchStore(sheet.storeGuess, stores) : null;
    // A store named inside the file decides; a sheet name only suggests, so it never overrides the store on screen.
    if (match) return { target: match.store.id, newName: '' };
    if (sheet.storeFromTitle) return { target: NEW_STORE, newName: sheet.storeGuess };
    return { target: store?.id || NEW_STORE, newName: sheet.storeGuess || '' };
  };
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const parsed = parseAssetWorkbook(await file.arrayBuffer());
      setImp((s) => ({ ...s, fileName: file.name, parsed, sheet: 0, readError: null, newCode: '', ...targetFor(parsed.sheets[0]) }));
    } catch (err) {
      setImp((s) => ({ ...s, fileName: file.name, parsed: null, readError: `Could not read ${file.name}: ${err.message}` }));
    }
  };
  const pickSheet = (i) => setImp((s) => ({ ...s, sheet: i, ...targetFor(s.parsed.sheets[i]) }));

  const impSheet = imp?.parsed?.sheets[imp.sheet] || null;
  // Rows are compared with the register on screen; for another store the server decides add / update.
  const impSameStore = Boolean(imp && store && imp.target === store.id);
  const impPlan = useMemo(() => (impSheet ? planImport(impSheet.rows, impSameStore ? assets : []) : null), [impSheet, impSameStore, assets]);
  const impReady = impPlan ? impPlan.insert + impPlan.update : 0;
  const impStoreMatch = impSheet?.storeGuess ? matchStore(impSheet.storeGuess, stores) : null;

  const doImport = async () => {
    setSaving(true); setNotice(null);
    try {
      let target = imp.target;
      if (target === NEW_STORE) target = (await send('/api/assets/stores', 'POST', { name: imp.newName, code: imp.newCode })).store.id;
      const rows = impPlan.rows.filter((r) => r.status === 'insert' || r.status === 'update')
        .map(({ category: c, item, brand, specification, quantity, remark }) => ({ category: c, item, brand, specification, quantity, remark }));
      const json = await send('/api/assets/import', 'POST', { store_id: target, file_name: imp.fileName, sheet_name: impSheet.sheet, rows });
      const fresh = await load(target);
      setImp(null);
      setNotice({ ok: true, text: `Imported into ${fresh?.store?.name || 'the store'}: ${plural(json.inserted, 'asset')} added, ${count(json.updated)} updated.${impPlan.skip + impPlan.error ? ` ${plural(impPlan.skip + impPlan.error, 'row')} left out.` : ''}` });
    } catch (err) {
      setNotice({ ok: false, text: `Nothing was imported: ${err.message}` });
      load(store?.id); // a new store may have been created before the rows failed
    } finally {
      setSaving(false);
    }
  };

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([buildTemplate(store?.name)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'asset-list-template.xlsx'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const regSort = useSort({ textKeys: ['category', 'item', 'brand', 'specification', 'remark'] });
  const catSort = useSort({ textKeys: ['category'] });
  const sth = (s, k, label) => <SortTh k={k} label={label} sort={s.sort} onSort={s.onSort} />;
  const busy = saving || loading;

  return (
    <div className="md-page">
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="page-header-icon-box"><Box className="page-header-icon-svg" /></div>
        <div className="page-header-text">
          <h1>Assets</h1>
          <p>
            {store ? `${store.name}${store.code ? ` (${store.code})` : ''} - asset register` : 'Asset register'}
            {data?.lastImport ? ` · last import ${data.lastImport.file_name || 'Excel'}, ${stamp(data.lastImport.at)}` : ''}
          </p>
        </div>
        <div className="md-header-actions pc-header-actions">
          <label className="pc-range"><Store className="as-store-icon" />
            <select className="pc-input as-store" value={store?.id || ''} onChange={(e) => switchStore(e.target.value)} disabled={busy || !data} aria-label="Store">
              {stores.length === 0 && <option value="" disabled>No store yet</option>}
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}{s.code ? ` (${s.code})` : ''}</option>)}
              <option value={NEW_STORE}>+ Add a store…</option>
            </select>
          </label>
          <button type="button" className="reebok-btn secondary" onClick={() => load(store?.id)} disabled={busy}><RefreshCw />{loading ? 'Loading…' : 'Refresh'}</button>
          <button type="button" className="reebok-btn secondary" onClick={openImport} disabled={busy || !data || Boolean(imp)}><Upload />Import Excel</button>
          <button type="button" className="reebok-btn" onClick={openAdd} disabled={busy || !store || Boolean(form)}><Plus />Add asset</button>
        </div>
      </div>

      {error && <div className="reebok-error">Could not load the assets: {error}</div>}
      {notice && <div className={notice.ok ? 'reebok-send-status success pn-result' : 'reebok-error'} role="status">{notice.ok && <CheckCircle2 />}{notice.text}</div>}
      {loading && !data && <div className="md-empty card">Loading assets…</div>}

      {newStore && (
        <div className="md-notice pc-reject-box">
          <strong>Add a store</strong>
          <input type="text" className="pc-input" value={newStore.name} maxLength={LIMITS.store} placeholder="Store name" onChange={(e) => setNewStore((s) => ({ ...s, name: e.target.value }))} autoFocus aria-label="Store name" />
          <input type="text" className="pc-input as-code" value={newStore.code} maxLength={LIMITS.code} placeholder="Code (optional)" onChange={(e) => setNewStore((s) => ({ ...s, code: e.target.value }))} aria-label="Store code" />
          <button type="button" className="reebok-btn" onClick={saveStore} disabled={saving || !newStore.name.trim()}>{saving ? 'Saving…' : 'Add store'}</button>
          <button type="button" className="reebok-btn secondary" onClick={() => setNewStore(null)} disabled={saving}>Cancel</button>
        </div>
      )}

      {data && (
        <>
          <div className="md-kpis">
            <Kpi label="Asset types" value={count(totals.types)} icon={Boxes} title="Different items this store has on its register" foot={`In ${count(totals.categories)} ${totals.categories === 1 ? 'category' : 'categories'}`} />
            <Kpi label="Total quantity" value={count(totals.quantity)} icon={Hash} title="All units of all items added together" foot="Units across every item" />
            <Kpi label="Zero-stock items" value={count(totals.zeroStock)} icon={AlertTriangle} negative={totals.zeroStock > 0} title="Items on the register with a quantity of 0"
              foot={totals.zeroStock > 0 ? 'On the register but none in the store' : 'Every item has stock'} />
            <Kpi label="Categories" value={count(totals.categories)} icon={Layers} title="Groups the items fall under" foot={categoryRows[0] ? `Largest: ${[...categoryRows].sort((a, b) => b.quantity - a.quantity)[0].category}` : 'None yet'} />
          </div>

          {imp && (
            <div className="card">
              <div className="card-header mx-card-head">
                <FileSpreadsheet className="card-header-icon-svg" />
                <h3>Import assets from Excel{impSheet ? ` · ${plural(impSheet.rows.length, 'row')} read` : ''}</h3>
                <div className="mx-card-actions">
                  <button type="button" className="reebok-btn secondary" onClick={() => setImp(null)} disabled={saving}><X />Close</button>
                  <button type="button" className="reebok-btn secondary" onClick={downloadTemplate} disabled={saving}><Download />Template</button>
                  {impPlan && (
                    <button type="button" className="reebok-btn" onClick={doImport} disabled={saving || impReady === 0 || (imp.target === NEW_STORE && !imp.newName.trim())}>
                      <Upload />{saving ? 'Importing…' : `Import ${plural(impReady, 'row')}`}
                    </button>
                  )}
                </div>
              </div>

              <div className="pn-drop as-drop">
                <Upload />
                <div>
                  <strong>{imp.fileName || 'Choose the asset Excel file'}</strong>
                  <p className="md-note">
                    One sheet per store. A header row with <b>Particulars</b> (category), <b>Item</b>, <b>Brand</b>, <b>Specification</b>, <b>Qty</b>, <b>Remarks</b>, in any order; only Item and Qty are required.
                    A blank category means the same as the row above. A title line such as &quot;Store Name: Uppal Reebok&quot; picks the store. Use Template for an empty file in this layout.
                  </p>
                </div>
                <button type="button" className="reebok-btn" onClick={() => fileRef.current?.click()} disabled={saving}>Choose file</button>
                <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={onFile} hidden />
              </div>

              {imp.readError && <div className="reebok-error">{imp.readError}</div>}

              {impSheet && impPlan && (
                <>
                  <div className="pc-filters as-import-bar">
                    {imp.parsed.sheets.length > 1 && (
                      <label className="pc-range">Sheet
                        <select className="pc-input as-store" value={imp.sheet} onChange={(e) => pickSheet(Number(e.target.value))} disabled={saving} aria-label="Sheet">
                          {imp.parsed.sheets.map((s, i) => <option key={s.sheet} value={i}>{s.sheet} ({s.rows.length})</option>)}
                        </select>
                      </label>
                    )}
                    <label className="pc-range">Import into
                      <select className="pc-input as-store" value={imp.target} onChange={(e) => setImp((s) => ({ ...s, target: e.target.value }))} disabled={saving} aria-label="Import into store">
                        {stores.map((s) => <option key={s.id} value={s.id}>{s.name}{s.code ? ` (${s.code})` : ''}</option>)}
                        <option value={NEW_STORE}>A new store…</option>
                      </select>
                    </label>
                    {imp.target === NEW_STORE && (
                      <>
                        <input type="text" className="pc-input as-new-store" value={imp.newName} maxLength={LIMITS.store} placeholder="New store name" onChange={(e) => setImp((s) => ({ ...s, newName: e.target.value }))} disabled={saving} aria-label="New store name" />
                        <input type="text" className="pc-input as-code" value={imp.newCode} maxLength={LIMITS.code} placeholder="Code (optional)" onChange={(e) => setImp((s) => ({ ...s, newCode: e.target.value }))} disabled={saving} aria-label="New store code" />
                      </>
                    )}
                    <span className="as-chip as-insert">{count(impPlan.insert)} new</span>
                    <span className="as-chip as-update">{count(impPlan.update)} update</span>
                    {impPlan.skip > 0 && <span className="as-chip as-skip">{count(impPlan.skip)} skipped</span>}
                    {impPlan.error > 0 && <span className="as-chip as-error">{count(impPlan.error)} cannot be read</span>}
                  </div>

                  <p className="md-note">
                    {impSheet.storeGuess
                      ? `The ${impSheet.storeFromTitle ? 'file' : 'sheet name'} says "${impSheet.storeGuess}"${impStoreMatch ? `, matched to ${impStoreMatch.store.name}${impStoreMatch.exact ? '' : ' (close spelling, please check)'}` : ', which is not a saved store'}. `
                      : 'The file does not name a store. '}
                    {impSameStore ? 'New = not on this store\'s register yet; Update = the saved quantity is replaced.' : 'For a store other than the one on screen, each row is added, or updates the item if that store already has it.'}
                    {' '}Blank brand, specification or remark cells keep what is already saved.
                  </p>

                  {(impSheet.warnings.length > 0 || imp.parsed.skippedSheets.length > 0) && (
                    <div className="md-notice pn-warn">
                      <AlertTriangle />
                      <div>
                        <strong>Check before importing:</strong>
                        <ul>
                          {impSheet.warnings.map((w) => <li key={w}>{w}</li>)}
                          {imp.parsed.skippedSheets.length > 0 && <li>No header row found in: {imp.parsed.skippedSheets.join(', ')}. Those sheets are not read.</li>}
                        </ul>
                      </div>
                    </div>
                  )}

                  {impSheet.rows.length === 0 ? <div className="md-empty">The header row was found on line {impSheet.headerLine}, but there are no asset rows under it.</div> : (
                    <div className="md-table-wrap pc-preview">
                      <table className="md-table md-table-compact as-table">
                        <thead><tr><th>Line</th><th>Category</th><th>Item</th><th>Brand</th><th>Specification</th><th className="as-num">Qty</th><th>Remark</th><th>What happens</th></tr></thead>
                        <tbody>
                          {impPlan.rows.slice(0, PREVIEW_ROWS).map((r) => (
                            <tr key={r.line} className={r.status === 'error' ? 'as-row-error' : r.status === 'skip' ? 'as-row-skip' : ''}>
                              <td>{r.line}</td><td>{r.category}</td><td className="as-wrap">{r.item || <em>missing</em>}</td><td>{r.brand || ''}</td><td className="as-wrap">{r.specification || ''}</td>
                              <td className="as-num">{r.status === 'error' ? '' : count(r.quantity)}</td><td className="as-wrap">{r.remark || ''}</td>
                              <td className="as-wrap">
                                <span className={`as-chip as-${r.status}`}>{STATUS_TEXT[r.status]}</span>
                                {r.status === 'update' && ` quantity ${count(r.from)} → ${count(r.quantity)}`}
                                {r.status === 'skip' && ` listed again on line ${r.duplicateOf}`}
                                {r.status === 'error' && ` ${r.error}`}
                                {r.note && r.status !== 'error' && <span className="pc-sub">{r.note}</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {impPlan.rows.length > PREVIEW_ROWS && <p className="md-note as-more">Showing the first {PREVIEW_ROWS} of {count(impPlan.rows.length)} rows. All of them are imported.</p>}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {form && (
            <div className="card">
              <div className="card-header mx-card-head">
                {form.id ? <Pencil className="card-header-icon-svg" /> : <Plus className="card-header-icon-svg" />}
                <h3>{form.id ? `Change ${form.item}` : `Add an asset to ${store?.name}`}</h3>
                <div className="mx-card-actions">
                  <button type="button" className="reebok-btn secondary" onClick={() => setForm(null)} disabled={saving}><X />Close</button>
                  <button type="button" className="reebok-btn" onClick={saveForm} disabled={saving}><Save />{saving ? 'Saving…' : form.id ? 'Save changes' : 'Add asset'}</button>
                </div>
              </div>
              <p className="md-note">
                {form.id ? 'The category and item cannot be changed here. If this is the wrong item, remove the row and add the right one.'
                  : 'Pick a category and item from the suggestions, or type a new one and it is added to the lists. A store holds each item once.'}
              </p>
              <div className="as-form">
                <label>Category<input type="text" className="pc-input" list="as-categories" value={form.category} maxLength={LIMITS.category} placeholder="e.g. Electronics" onChange={(e) => setField({ category: e.target.value })} disabled={saving || Boolean(form.id)} /></label>
                <label>Item<input type="text" className="pc-input" list="as-items" value={form.item} maxLength={LIMITS.item} placeholder="e.g. Billing computer" onChange={(e) => setField({ item: e.target.value })} disabled={saving || Boolean(form.id)} /></label>
                <label>Brand<input type="text" className="pc-input" value={form.brand} maxLength={LIMITS.brand} placeholder="Make" onChange={(e) => setField({ brand: e.target.value })} disabled={saving} /></label>
                <label className="as-form-wide">Specification<input type="text" className="pc-input" value={form.specification} maxLength={LIMITS.specification} placeholder="Model, size, capacity" onChange={(e) => setField({ specification: e.target.value })} disabled={saving} /></label>
                <label>Quantity<input type="number" className="pc-input" value={form.quantity} min="0" max={MAX_QUANTITY} step="1" placeholder="0" onChange={(e) => setField({ quantity: e.target.value })} disabled={saving} /></label>
                <label className="as-form-wide">Remark<input type="text" className="pc-input" value={form.remark} maxLength={LIMITS.remark} placeholder="Condition, where it is kept" onChange={(e) => setField({ remark: e.target.value })} disabled={saving} /></label>
              </div>
              <datalist id="as-categories">{(data.categories || []).map((c) => <option key={c.id} value={c.name} />)}</datalist>
              <datalist id="as-items">{itemSuggestions.map((n) => <option key={n} value={n} />)}</datalist>
              {form.error && <div className="pc-row-error">{form.error}</div>}
            </div>
          )}

          <div className="pc-filters">
            <div className="md-seg">
              <button type="button" className={view === 'register' ? 'active' : ''} onClick={() => setView('register')}>Register · {count(assets.length)}</button>
              <button type="button" className={view === 'categories' ? 'active' : ''} onClick={() => setView('categories')}>By category</button>
            </div>
            {view === 'register' && (
              <>
                <label className="mx-scan"><Search /><input type="search" value={search} placeholder="Search item, brand, category" onChange={(e) => setSearch(e.target.value)} aria-label="Search assets" /></label>
                <label className="pc-range">Category
                  <select className="pc-input pc-month" value={category} onChange={(e) => setCategory(e.target.value)} disabled={categoryRows.length === 0} aria-label="Category">
                    <option value="">All categories</option>
                    {categoryRows.map((c) => <option key={c.category} value={c.category}>{c.category} ({c.types})</option>)}
                  </select>
                </label>
                <label className="pc-range as-check"><input type="checkbox" checked={zeroOnly} onChange={(e) => setZeroOnly(e.target.checked)} />Zero stock only</label>
                {filtered && <button type="button" className="reebok-btn secondary" onClick={() => { setSearch(''); setCategory(''); setZeroOnly(false); }}><X />Clear</button>}
              </>
            )}
          </div>

          {view === 'register' && (
            <div className="card">
              <div className="card-header mx-card-head">
                <Box className="card-header-icon-svg" />
                <h3>Asset register · {filtered ? `${count(shown.length)} of ${count(assets.length)}` : count(assets.length)}</h3>
              </div>
              {shown.length === 0 ? (
                <div className="md-empty">
                  {!store ? 'No store yet. Use "+ Add a store" in the store list, or import an Excel file that names its store.'
                    : assets.length === 0 ? `Nothing is recorded for ${store.name} yet. Use "Import Excel" for the store's asset list, or "Add asset" to enter items one at a time.`
                      : 'No assets match the search and filters.'}
                </div>
              ) : (
                <div className="md-table-wrap">
                  <table className="md-table md-table-compact as-table">
                    <thead>
                      <tr>
                        {sth(regSort, 'category', 'Category')}{sth(regSort, 'item', 'Item')}{sth(regSort, 'brand', 'Brand')}{sth(regSort, 'specification', 'Specification')}
                        <SortTh k="quantity" label="Qty" className="as-num" sort={regSort.sort} onSort={regSort.onSort} />{sth(regSort, 'remark', 'Remark')}{sth(regSort, 'updated_at', 'Last updated')}<th aria-label="Actions" />
                      </tr>
                    </thead>
                    <tbody>
                      {regSort.sorted(shown).map((a) => (
                        <tr key={a.id} className={form?.id === a.id ? 'as-row-editing' : ''}>
                          <td>{a.category}</td>
                          <td className="as-wrap as-item">{a.item}</td>
                          <td>{a.brand || <span className="pc-dash">—</span>}</td>
                          <td className="as-wrap">{a.specification || <span className="pc-dash">—</span>}</td>
                          <td className={`as-num ${a.quantity === 0 ? 'pc-neg' : ''}`}>{count(a.quantity)}</td>
                          <td className="as-wrap">{a.remark || <span className="pc-dash">—</span>}</td>
                          <td title={a.updated_by_email ? `by ${a.updated_by_email}` : undefined}>{stamp(a.updated_at)}</td>
                          <td className="as-actions">
                            {confirmDelete === a.id ? (
                              <>
                                <span className="pc-confirm">Remove?</span>
                                <button type="button" className="pc-icon-btn pc-danger" onClick={() => deleteAsset(a)} disabled={saving} title="Yes, remove"><Check /></button>
                                <button type="button" className="pc-icon-btn" onClick={() => setConfirmDelete(null)} disabled={saving} title="Keep"><X /></button>
                              </>
                            ) : (
                              <>
                                <button type="button" className="pc-icon-btn" onClick={() => openEdit(a)} disabled={saving} title="Change brand, specification, quantity or remark"><Pencil /></button>
                                <button type="button" className="pc-icon-btn" onClick={() => setConfirmDelete(a.id)} disabled={saving} title="Remove from this store"><Trash2 /></button>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                      <tr className="md-total-row">
                        <td>{filtered ? 'Total shown' : 'Total'}</td><td>{plural(shown.length, 'item')}</td><td /><td />
                        <td className="as-num">{count(shown.reduce((s, a) => s + a.quantity, 0))}</td><td /><td /><td />
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {view === 'categories' && (
            <div className="card">
              <div className="card-header mx-card-head"><Layers className="card-header-icon-svg" /><h3>By category · {count(categoryRows.length)}</h3></div>
              {categoryRows.length === 0 ? <div className="md-empty">No assets recorded for this store yet.</div> : (
                <div className="md-table-wrap">
                  <table className="md-table md-table-compact">
                    <thead><tr>{sth(catSort, 'category', 'Category')}{sth(catSort, 'types', 'Asset types')}{sth(catSort, 'quantity', 'Total quantity')}{sth(catSort, 'share', 'Share of quantity')}{sth(catSort, 'zeroStock', 'Zero-stock items')}<th aria-label="Open" /></tr></thead>
                    <tbody>
                      {catSort.sorted(categoryRows.map((c) => ({ ...c, share: totals.quantity > 0 ? (c.quantity / totals.quantity) * 100 : null }))).map((c) => (
                        <tr key={c.category}>
                          <td>{c.category}</td><td>{count(c.types)}</td><td>{count(c.quantity)}</td><td>{c.share === null ? '—' : `${c.share.toFixed(1)}%`}</td>
                          <td className={c.zeroStock > 0 ? 'pc-neg' : ''}>{count(c.zeroStock)}</td>
                          <td><button type="button" className="pc-photo-link" onClick={() => { setCategory(c.category); setSearch(''); setZeroOnly(false); setView('register'); }}>Show items</button></td>
                        </tr>
                      ))}
                      <tr className="md-total-row"><td>Total</td><td>{count(totals.types)}</td><td>{count(totals.quantity)}</td><td>{totals.quantity > 0 ? '100.0%' : '—'}</td><td>{count(totals.zeroStock)}</td><td /></tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function AssetsPage() {
  return (
    <RequireAuth roles={['admin']}>
      <Assets />
    </RequireAuth>
  );
}
