'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  Circle,
  Database,
  Calendar,
  AlertCircle,
  Upload,
} from 'lucide-react';

const CATEGORIES = [
  { id: 'raw', label: 'RAW' },
  { id: 'sales', label: 'Sales' },
  { id: 'account_dsr', label: 'Account DSR' },
  { id: 'stock', label: 'Stock' },
];

export default function DataCoverageMatrix({ initialReportType = 'sales' }) {
  const router = useRouter();

  // State for Month and Year
  const now = new Date();
  const [currentDate, setCurrentDate] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [reportType, setReportType] = useState(initialReportType);

  // API Data states
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const month = currentDate.getMonth() + 1;
  const year = currentDate.getFullYear();

  useEffect(() => {
    fetchCoverage();
  }, [month, year, reportType]);

  const fetchCoverage = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/reports/upload-coverage?month=${month}&year=${year}&reportType=${reportType}`);
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to fetch data coverage');
      }

      setData(json);
    } catch (err) {
      console.error('Data Coverage Fetch Error:', err);
      setError(err.message || 'Failed to load data coverage');
    } finally {
      setLoading(false);
    }
  };

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 2, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month, 1));
  };

  const handleCellClick = (dayItem) => {
    if (dayItem.status === 'missing') {
      // Navigate to upload page with query params for selected report type and date
      router.push(`/upload?reportType=${reportType}&date=${dayItem.date}`);
    }
  };

  const kpis = data?.kpis || {
    totalStores: 1,
    coveragePct: 0,
    daysWithData: 0,
    missingDays: 0,
  };

  const stores = data?.stores || [];
  const daysHeader = stores[0]?.days || [];

  return (
    <div className="coverage-matrix-container">
      {/* ─── Top Bar: Title, Category Pills, Month Picker, Refresh ── */}
      <div className="coverage-header">
        <div className="coverage-header-title">
          <div className="coverage-title-icon">
            <Database />
          </div>
          <div>
            <h2>Data Coverage</h2>
            <p>Sales and report data availability per store</p>
          </div>
        </div>

        <div className="coverage-header-right">
          {/* Category Pills */}
          <div className="coverage-pills-group">
            {CATEGORIES.map((cat) => {
              const isActive = reportType === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setReportType(cat.id)}
                  className={`coverage-pill ${isActive ? 'active' : ''}`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>

          {/* Month Selector */}
          <div className="coverage-month-picker">
            <button onClick={handlePrevMonth} className="month-nav-btn" title="Previous Month">
              <ChevronLeft style={{ width: '16px', height: '16px' }} />
            </button>
            <div className="month-display">
              <span className="month-name">
                {data?.monthName || currentDate.toLocaleString('en-US', { month: 'long' })} {year}
              </span>
              <span className="month-sub">
                Latest data: {data?.latestDataDate || 'N/A'}
              </span>
            </div>
            <button onClick={handleNextMonth} className="month-nav-btn" title="Next Month">
              <ChevronRight style={{ width: '16px', height: '16px' }} />
            </button>
          </div>

          {/* Refresh Button */}
          <button
            onClick={fetchCoverage}
            disabled={loading}
            className="coverage-refresh-btn"
            title="Refresh"
          >
            <RefreshCw style={{ width: 13, height: 13, animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* ─── 4 Stat Cards Row ─────────────────────────────────────── */}
      <div className="coverage-stats-grid">
        <div className="stat-card">
          <span className="stat-label">STORES</span>
          <span className="stat-value">{kpis.totalStores}</span>
        </div>

        <div className="stat-card">
          <span className="stat-label">COVERAGE</span>
          <span
            className="stat-value"
            style={{
              color: kpis.coveragePct >= 80 ? 'var(--positive)' : kpis.coveragePct >= 50 ? 'var(--warning)' : 'var(--negative)',
            }}
          >
            {kpis.coveragePct}%
          </span>
        </div>

        <div className="stat-card">
          <span className="stat-label">DAYS WITH DATA</span>
          <span className="stat-value" style={{ color: 'var(--positive)' }}>{kpis.daysWithData}</span>
        </div>

        <div className="stat-card">
          <span className="stat-label">MISSING</span>
          <span
            className="stat-value"
            style={{ color: kpis.missingDays > 0 ? 'var(--negative)' : 'var(--text-muted)' }}
          >
            {kpis.missingDays}
          </span>
        </div>
      </div>

      {/* ─── Matrix Table Card ────────────────────────────────────── */}
      <div className="coverage-grid-card">
        {loading ? (
          <div className="coverage-loading">
            <RefreshCw className="spinning-icon" style={{ width: 28, height: 28 }} />
            <p>Fetching data coverage matrix…</p>
          </div>
        ) : error ? (
          <div className="coverage-error">
            <AlertCircle className="error-icon" />
            <p>{error}</p>
            <button onClick={fetchCoverage} className="retry-link">Try again</button>
          </div>
        ) : (
          <div className="matrix-table-wrapper">
            <table className="matrix-table">
              <thead>
                <tr>
                  <th className="matrix-th-store">Store</th>
                  {daysHeader.map((d) => (
                    <th key={d.date} className={`matrix-th-day ${d.isWeekend ? 'weekend' : ''}`}>
                      <div className="day-initial">{d.dayInitial}</div>
                      <div className="day-number">{d.dayNumber}</div>
                    </th>
                  ))}
                  <th className="matrix-th-gaps">Gaps</th>
                </tr>
              </thead>
              <tbody>
                {/* Store Section Header */}
                <tr className="matrix-section-row">
                  <td colSpan={daysHeader.length + 2}>
                    <span className="section-title">STORE MANAGER / ADMIN</span>
                  </td>
                </tr>

                {/* Reebok Store Row */}
                {stores.map((s) => (
                  <tr key={s.storeCode} className="matrix-data-row">
                    <td className="matrix-td-store">
                      <div className="store-info-cell">
                        <span className="store-name">{s.storeName}</span>
                        <span className="store-code">({s.storeCode})</span>
                      </div>
                    </td>

                    {s.days.map((d) => {
                      let iconNode = null;
                      let cellClass = `matrix-td-cell ${d.status}`;
                      if (d.isToday) cellClass += ' today';
                      if (d.isHoliday) cellClass += ' holiday';

                      if (d.status === 'has_data') {
                        iconNode = (
                          <div className="status-badge-circle has-data">
                            <Check style={{ width: 8, height: 8, strokeWidth: 3, color: '#fff' }} />
                          </div>
                        );
                      } else if (d.status === 'missing') {
                        iconNode = (
                          <div className="status-badge-circle missing">
                            <X style={{ width: 8, height: 8, strokeWidth: 3, color: 'var(--border-strong)' }} />
                          </div>
                        );
                      } else {
                        iconNode = <Circle style={{ width: 5, height: 5, fill: 'var(--border)', color: 'var(--border)' }} />;
                      }

                      const tooltipText = `${d.date} (${d.dayInitial}) - ${
                        d.status === 'has_data' ? 'Data Available' : d.status === 'missing' ? 'Missing (Click to upload)' : 'Future'
                      }${d.holidayName ? ` • ${d.holidayName}` : ''}`;

                      return (
                        <td
                          key={d.date}
                          className={cellClass}
                          title={tooltipText}
                          onClick={() => handleCellClick(d)}
                        >
                          <div className="cell-content">{iconNode}</div>
                        </td>
                      );
                    })}

                    <td className="matrix-td-gaps">
                      <span className={`gaps-badge ${s.gapsCount > 0 ? 'has-gaps' : 'no-gaps'}`}>
                        {s.gapsCount}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ─── Legend Footer ────────────────────────────────────────── */}
        <div className="matrix-legend">
          <div className="legend-item">
            <div className="status-badge-circle has-data">
              <Check style={{ width: 8, height: 8, strokeWidth: 3, color: '#fff' }} />
            </div>
            <span>Has data</span>
          </div>

          <div className="legend-item">
            <div className="status-badge-circle missing">
              <X style={{ width: 8, height: 8, strokeWidth: 3, color: 'var(--border-strong)' }} />
            </div>
            <span>Missing</span>
          </div>

          <div className="legend-item">
            <Circle style={{ width: 6, height: 6, fill: 'var(--border)', color: 'var(--border)' }} />
            <span>Future / not expected</span>
          </div>

          <div className="legend-item">
            <Calendar style={{ width: 13, height: 13, color: 'var(--text)' }} />
            <span>Today</span>
          </div>

          <div className="legend-item action-hint">
            <Upload style={{ width: 13, height: 13 }} />
            <span>Click any missing day to upload report</span>
          </div>
        </div>
      </div>
    </div>
  );
}
