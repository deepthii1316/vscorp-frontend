'use client';

// Merchandiser Dashboard (Uppal Reebok). Inventory lens: is stock healthy, and is it moving?
// Template: public/docs/MERCHANDISER_DASHBOARD_REFERENCE.md (single store here, so no
// cluster / store / transfer pages). Data: /api/merchandiser (one row per EAN, latest stock
// snapshot + sales windows), fetched once; every filter, threshold and rollup runs in the browser
// (src/lib/merchShared.js). Barcode lookup is the search box in the header, not a separate tab.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Boxes, RefreshCw, LayoutDashboard, HeartPulse, Skull, Gauge, ScanBarcode } from 'lucide-react';
import RequireAuth from '@/components/RequireAuth';
import { apiFetch } from '@/lib/api';
import {
  DEFAULT_THRESHOLDS, EMPTY_FILTER, LEVELS, applyFilter, filterOptions, summarize, divisionLabel, shortDate,
} from '@/lib/merchShared';
import MerchOverview from '@/components/merch/MerchOverview';
import MerchHealth from '@/components/merch/MerchHealth';
import MerchDeadStock from '@/components/merch/MerchDeadStock';
import MerchSellThrough from '@/components/merch/MerchSellThrough';
import MerchProductPanel from '@/components/merch/MerchProductPanel';

const TABS = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'health', label: 'Inventory Health', icon: HeartPulse },
  { key: 'dead', label: 'Dead Stock', icon: Skull },
  { key: 'sell', label: 'Sell-Through', icon: Gauge },
];

const THRESHOLD_KEY = 'merch.thresholds';
function loadThresholds() {
  try {
    const t = JSON.parse(window.localStorage.getItem(THRESHOLD_KEY) || 'null');
    if (t && t.slow < t.risk && t.risk < t.dead) return t;
  } catch { /* storage unavailable: use defaults */ }
  return DEFAULT_THRESHOLDS;
}

function MerchandiserDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('overview');
  const [filter, setFilter] = useState(EMPTY_FILTER);
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS);
  const [scan, setScan] = useState('');
  const [lookup, setLookup] = useState(null);

  useEffect(() => { setThresholds(loadThresholds()); }, []);
  const applyThresholds = (t) => {
    setThresholds(t);
    try { window.localStorage.setItem(THRESHOLD_KEY, JSON.stringify(t)); } catch { /* ignore */ }
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/merchandiser');
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { fetchData(); }, [fetchData]);

  const allRows = data?.rows || [];
  const rows = useMemo(() => applyFilter(allRows, filter), [allRows, filter]);
  const options = useMemo(() => filterOptions(allRows, filter), [allRows, filter]);
  const summary = useMemo(() => summarize(rows, thresholds, data?.rateDays || 0), [rows, thresholds, data?.rateDays]);
  const rowByBarcode = useMemo(() => new Map(allRows.map((r) => [r.barcode, r])), [allRows]);

  const setLevel = (key, val) => {
    const idx = LEVELS.findIndex((l) => l.key === key);
    const next = { ...filter, [key]: val };
    LEVELS.slice(idx + 1).forEach((l) => { next[l.key] = 'ALL'; });   // cascading: reset levels below
    setFilter(next);
  };
  const isFiltered = LEVELS.some((l) => filter[l.key] !== 'ALL');

  const submitScan = (e) => {
    e.preventDefault();
    const code = scan.trim();
    if (code) setLookup(code);
  };

  const asOfLabel = data?.asOf || 'latest';
  const common = { rows, rateDays: data?.rateDays || 0, asOfLabel };

  return (
    <div className="md-page">
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="page-header-icon-box"><Boxes className="page-header-icon-svg" /></div>
        <div className="page-header-text">
          <h1>Merchandiser Dashboard</h1>
          <p>
            Uppal Reebok - stock as of {data?.asOf ? shortDate(data.asOf) : '…'}, sales up to the same day
            {data?.storeFirstSale ? ` (trading since ${shortDate(data.storeFirstSale)})` : ''}
          </p>
        </div>
        <div className="md-header-actions mx-header-actions">
          <form className="mx-scan" onSubmit={submitScan} role="search">
            <ScanBarcode />
            <input type="search" inputMode="numeric" placeholder="Scan or type a barcode" aria-label="Barcode lookup"
              value={scan} onChange={(e) => setScan(e.target.value)} />
            <button type="submit" className="md-apply" disabled={!scan.trim()}>Look up</button>
          </form>
          <button type="button" className="reebok-btn secondary" onClick={fetchData} disabled={loading}>
            <RefreshCw />{loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="card md-filters">
        <div className="md-filter-group">
          {LEVELS.map(({ key, label }) => (
            <label key={key} className="md-filter-item">
              <span className="md-label">{label}</span>
              <select className="md-select-plain" value={filter[key]} onChange={(e) => setLevel(key, e.target.value)}>
                <option value="ALL">All</option>
                {options[key].map((v) => <option key={v} value={v}>{key === 'division' ? divisionLabel(v) : v}</option>)}
              </select>
            </label>
          ))}
          {isFiltered && <button type="button" className="reebok-btn secondary mx-btn-sm" onClick={() => setFilter(EMPTY_FILTER)}>Clear</button>}
        </div>
      </div>

      <div className="md-tabs" role="tablist">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={`md-tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>
            <Icon />{label}
          </button>
        ))}
      </div>

      {error && <div className="reebok-error">Could not load the dashboard: {error}</div>}
      {loading && !data && <div className="md-empty card">Loading...</div>}
      {data && allRows.length === 0 && <div className="md-empty card">No stock data has been processed yet. Upload a Stock Balance Report and run processing.</div>}

      {data && allRows.length > 0 && (
        <>
          {tab === 'overview' && <MerchOverview {...common} summary={summary} />}
          {tab === 'health' && <MerchHealth {...common} summary={summary} thresholds={thresholds} onThresholds={applyThresholds} />}
          {tab === 'dead' && <MerchDeadStock {...common} thresholds={thresholds} onThresholds={applyThresholds} onLookup={setLookup} />}
          {tab === 'sell' && <MerchSellThrough {...common} onLookup={setLookup} />}
        </>
      )}

      {lookup && (
        <MerchProductPanel barcode={lookup} row={rowByBarcode.get(lookup) || null} thresholds={thresholds}
          rateDays={data?.rateDays || 0} onClose={() => setLookup(null)} />
      )}
    </div>
  );
}

export default function MerchandiserDashboardPage() {
  return (
    <RequireAuth roles={['admin']}>
      <MerchandiserDashboard />
    </RequireAuth>
  );
}
