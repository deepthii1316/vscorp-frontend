'use client';

import { useState, useEffect, useRef } from 'react';
import { LayoutDashboard, Store, Package, Tag, CreditCard, Award, Send, Mail } from 'lucide-react';
import html2canvas from 'html2canvas';
import { formatINR, formatNumber, formatPercent } from '@/lib/masterDashboardShared';
import RequireAuth from '@/components/RequireAuth';

function MasterDashboardPage() {
  const [startDate, setStartDate] = useState('2026-08-01');
  const [endDate, setEndDate] = useState('2026-08-18');
  const [selectedDivision, setSelectedDivision] = useState('ALL');
  const [selectedQuickRange, setSelectedQuickRange] = useState('MTD');
  const [activeTab, setActiveTab] = useState('overview');

  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState(null);
  const [emailState, setEmailState] = useState({ sending: false, status: null, message: null });
  const [emailMode, setEmailMode] = useState('test');
  const [emailDate, setEmailDate] = useState(yesterdayIST());
  const dashboardRef = useRef(null);

  useEffect(() => {
    fetchDashboardData();
  }, [startDate, endDate, selectedDivision]);

  async function fetchDashboardData() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        startDate,
        endDate,
        divisions: selectedDivision !== 'ALL' ? selectedDivision : '',
      });
      const res = await fetch(`/api/reports/master-dashboard?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setDashboardData(json);
      }
    } catch (err) {
      console.error('Failed to fetch master dashboard data:', err);
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
      const res = await fetch(`/api/reports/kpi-dashboard?${params.toString()}`, {
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
      formData.append('subject', `VS Corp KPI Dashboard — ${emailDate}`);
      formData.append('displayDate', emailDate);
      formData.append('mode', emailMode);

      const sendRes = await fetch('/api/reports/kpi-dashboard/send', { method: 'POST', body: formData });
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

  return (
    <div style={{ padding: '32px' }}>
      {/* Header */}
      <div className="page-header">
        <div className="page-header-icon">
          <LayoutDashboard style={{ width: 20, height: 20 }} />
        </div>
        <div className="page-header-text">
          <h1>Master Dashboard</h1>
          <p>Virata Retail Operations — Reebok Store (Uppal) Sales & Payment Performance</p>
        </div>
      </div>

      {/* Styled Filter Control Bar */}
      <div className="card" style={{ marginBottom: '24px', padding: '18px 24px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
          {/* Dates & Quick Ranges */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', items: 'center', gap: '8px', fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' }}>
              <span>FROM</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => handleDateChange(e.target.value, endDate)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--surface-border)',
                  fontFamily: 'inherit',
                  fontSize: '13px',
                }}
              />
              <span>TO</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => handleDateChange(startDate, e.target.value)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--surface-border)',
                  fontFamily: 'inherit',
                  fontSize: '13px',
                }}
              />
            </div>

            {/* Quick Range Pills */}
            <div style={{ display: 'flex', background: 'var(--content-bg)', padding: '4px', borderRadius: 'var(--radius-sm)', gap: '4px' }}>
              {['WTD', 'MTD', 'YTD', 'All'].map((range) => {
                const val = range.toLowerCase();
                const isActive = selectedQuickRange === val || (range === 'All' && selectedQuickRange === 'all');
                return (
                  <button
                    key={range}
                    onClick={() => handleQuickRangeChange(val)}
                    style={{
                      padding: '4px 12px',
                      borderRadius: '4px',
                      border: 'none',
                      fontSize: '12px',
                      fontWeight: '700',
                      cursor: 'pointer',
                      background: isActive ? 'var(--surface)' : 'transparent',
                      color: isActive ? 'var(--brand-primary)' : 'var(--text-secondary)',
                      boxShadow: isActive ? 'var(--shadow-sm)' : 'none',
                    }}
                  >
                    {range}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Division Pills */}
          <div style={{ display: 'flex', background: 'var(--content-bg)', padding: '4px', borderRadius: 'var(--radius-sm)', gap: '4px' }}>
            {[
              { label: 'All divisions', value: 'ALL' },
              { label: 'Footwear', value: 'Footwear' },
              { label: 'Apparel', value: 'Apparel' },
              { label: 'Accessories', value: 'Accessories' },
            ].map((d) => {
              const isActive = selectedDivision === d.value;
              return (
                <button
                  key={d.value}
                  onClick={() => setSelectedDivision(d.value)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '4px',
                    border: 'none',
                    fontSize: '12px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    background: isActive ? 'var(--gradient-primary)' : 'transparent',
                    color: isActive ? '#FFFFFF' : 'var(--text-secondary)',
                  }}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Styled Dashboard Tabs */}
      <div style={{ display: 'flex', gap: '24px', borderBottom: '1px solid var(--surface-border)', marginBottom: '24px' }}>
        {[
          { id: 'overview', label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><LayoutDashboard style={{ width: 14, height: 14 }} />Overview</span> },
          { id: 'retail-metrics', label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Store style={{ width: 14, height: 14 }} />Retail Metrics (Store Board)</span> },
          { id: 'category-drilldown', label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Package style={{ width: 14, height: 14 }} />Category Drill-down</span> },
          { id: 'discount-vs-fresh', label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Tag style={{ width: 14, height: 14 }} />Discount vs Fresh</span> },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                paddingBottom: '12px',
                background: 'none',
                border: 'none',
                borderBottom: isActive ? '3px solid var(--brand-primary)' : '3px solid transparent',
                color: isActive ? 'var(--brand-primary)' : 'var(--text-secondary)',
                fontWeight: isActive ? '800' : '600',
                fontSize: '14px',
                cursor: 'pointer',
                transition: 'all 150ms',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Top KPI Cards Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '16px' }}>
            <div className="card" style={{ padding: '16px' }}>
              <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>RSV</span>
              <div style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', marginTop: '4px' }}>{formatINR(kpis.rsv)}</div>
              <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--status-success)' }}>+28.8% YoY</span>
            </div>

            <div className="card" style={{ padding: '16px' }}>
              <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>AVG / DAY</span>
              <div style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', marginTop: '4px' }}>{formatINR(kpis.avgPerDay)}</div>
              <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{kpis.daysCount} days</span>
            </div>

            <div className="card" style={{ padding: '16px' }}>
              <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>MD %</span>
              <div style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', marginTop: '4px' }}>{formatPercent(kpis.mdPct)}</div>
              <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>(MRP-RSV)/MRP</span>
            </div>

            <div className="card" style={{ padding: '16px' }}>
              <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>QTY SOLD</span>
              <div style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', marginTop: '4px' }}>{formatNumber(kpis.qtySold)}</div>
              <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--status-success)' }}>+19.5% YoY</span>
            </div>

            <div className="card" style={{ padding: '16px' }}>
              <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>BILLS</span>
              <div style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', marginTop: '4px' }}>{formatNumber(kpis.bills)}</div>
              <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Transactions</span>
            </div>

            <div className="card" style={{ padding: '16px' }}>
              <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>ATV</span>
              <div style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', marginTop: '4px' }}>{formatINR(kpis.atv)}</div>
              <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Sales / Bill</span>
            </div>

            <div className="card" style={{ padding: '16px' }}>
              <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>SSR</span>
              <div style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', marginTop: '4px' }}>55.3%</div>
              <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Socks / Shoes</span>
            </div>
          </div>

          {/* Account DSR Payment Mode Breakdown Strip */}
          <div className="card">
            <div className="card-header" style={{ justifyContent: 'space-between' }}>
              <div>
                <h3>💳 Payment Mode Breakdown (Account DSR)</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                  Split of collections across UPI, Cash, Card & Other payment channels
                </p>
              </div>
              <span className="status-badge success">
                Total Collections: {formatINR(payments.totalSales)}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '16px' }}>
              <div style={{ padding: '16px', borderRadius: 'var(--radius-md)', background: '#ECFDF5', border: '1px solid #A7F3D0' }}>
                <div style={{ display: 'flex', justify: 'space-between', fontSize: '12px', fontWeight: '700', color: '#065F46' }}>
                  <span>UPI / QR</span>
                  <span>{formatPercent(payments.upiPct)}</span>
                </div>
                <div style={{ fontSize: '20px', fontWeight: '800', color: '#065F46', marginTop: '4px' }}>
                  {formatINR(payments.upiAmount)}
                </div>
              </div>

              <div style={{ padding: '16px', borderRadius: 'var(--radius-md)', background: '#EFF6FF', border: '1px solid #BFDBFE' }}>
                <div style={{ display: 'flex', justify: 'space-between', fontSize: '12px', fontWeight: '700', color: '#1E40AF' }}>
                  <span>Cash</span>
                  <span>{formatPercent(payments.cashPct)}</span>
                </div>
                <div style={{ fontSize: '20px', fontWeight: '800', color: '#1E40AF', marginTop: '4px' }}>
                  {formatINR(payments.cashAmount)}
                </div>
              </div>

              <div style={{ padding: '16px', borderRadius: 'var(--radius-md)', background: '#EEF2FF', border: '1px solid #C7D2FE' }}>
                <div style={{ display: 'flex', justify: 'space-between', fontSize: '12px', fontWeight: '700', color: '#3730A3' }}>
                  <span>Credit / Debit Card</span>
                  <span>{formatPercent(payments.cardPct)}</span>
                </div>
                <div style={{ fontSize: '20px', fontWeight: '800', color: '#3730A3', marginTop: '4px' }}>
                  {formatINR(payments.cardAmount)}
                </div>
              </div>

              <div style={{ padding: '16px', borderRadius: 'var(--radius-md)', background: '#F5F3FF', border: '1px solid #DDD6FE' }}>
                <div style={{ display: 'flex', justify: 'space-between', fontSize: '12px', fontWeight: '700', color: '#5B21B6' }}>
                  <span>Other / Vouchers</span>
                  <span>{formatPercent(payments.otherPct)}</span>
                </div>
                <div style={{ fontSize: '20px', fontWeight: '800', color: '#5B21B6', marginTop: '4px' }}>
                  {formatINR(payments.otherAmount)}
                </div>
              </div>
            </div>

            {/* Channel Stacked Progress Bar */}
            <div style={{ width: '100%', height: '10px', background: 'var(--content-bg)', borderRadius: '100px', overflow: 'hidden', display: 'flex' }}>
              <div style={{ width: `${payments.upiPct}%`, background: '#10B981', height: '100%' }} title="UPI" />
              <div style={{ width: `${payments.cashPct}%`, background: '#3B82F6', height: '100%' }} title="Cash" />
              <div style={{ width: `${payments.cardPct}%`, background: '#6366F1', height: '100%' }} title="Card" />
              <div style={{ width: `${payments.otherPct}%`, background: '#8B5CF6', height: '100%' }} title="Other" />
            </div>
          </div>

          {/* Top Stores Overview */}
          <div className="card">
            <div className="card-header">
              <span className="card-header-icon">
                <Award style={{ width: 18, height: 18 }} />
              </span>
              <h3>Top Stores by RSV</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {topStores.map((s) => {
                const maxRsv = topStores[0]?.rsv || 1;
                const pct = (s.rsv / maxRsv) * 100;
                return (
                  <div key={s.store_name} style={{ display: 'flex', alignItems: 'center', fontSize: '13px' }}>
                    <span style={{ width: '180px', fontWeight: '600', color: 'var(--text-primary)' }}>{s.store_name}</span>
                    <div style={{ flex: 1, background: 'var(--content-bg)', height: '20px', borderRadius: '100px', overflow: 'hidden', marginRight: '16px' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: 'var(--gradient-primary)', borderRadius: '100px' }} />
                    </div>
                    <span style={{ fontWeight: '800', color: 'var(--text-primary)', width: '90px', textAlign: 'right' }}>
                      {formatINR(s.rsv)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* RETAIL METRICS TAB */}
      {activeTab === 'retail-metrics' && (
        <div className="card">
          <div className="card-header">
            <h3>Store Performance Overview</h3>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--surface-border)', background: 'var(--content-bg)', color: 'var(--text-tertiary)', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase' }}>
                  <th style={{ padding: '12px 16px' }}>Store Name</th>
                  <th style={{ padding: '12px 16px' }}>RSV</th>
                  <th style={{ padding: '12px 16px' }}>Bills</th>
                  <th style={{ padding: '12px 16px' }}>Qty Sold</th>
                  <th style={{ padding: '12px 16px' }}>MD %</th>
                </tr>
              </thead>
              <tbody>
                {storePerformance.map((row) => (
                  <tr key={row.store_name} style={{ borderBottom: '1px solid var(--surface-border)' }}>
                    <td style={{ padding: '14px 16px', fontWeight: '700', color: 'var(--text-primary)' }}>{row.store_name}</td>
                    <td style={{ padding: '14px 16px', fontWeight: '700', color: 'var(--brand-primary)' }}>{formatINR(row.rsv)}</td>
                    <td style={{ padding: '14px 16px', color: 'var(--text-secondary)' }}>{formatNumber(row.bills)}</td>
                    <td style={{ padding: '14px 16px', color: 'var(--text-secondary)' }}>{formatNumber(row.qty_sold)}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <span className={`status-badge ${row.md_pct < 15 ? 'success' : row.md_pct < 20 ? 'processing' : 'error'}`}>
                        {formatPercent(row.md_pct)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CATEGORY DRILLDOWN TAB */}
      {activeTab === 'category-drilldown' && (
        <div className="card">
          <div className="card-header">
            <h3>Category Hierarchy Drill-down</h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            <div style={{ padding: '20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--surface-border)', background: 'var(--content-bg)' }}>
              <h4 style={{ fontWeight: '700', fontSize: '15px' }}>Footwear</h4>
              <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '4px' }}>Running, Training, Classics</p>
              <div style={{ fontSize: '22px', fontWeight: '800', color: 'var(--brand-primary)', marginTop: '12px' }}>₹3.5Cr</div>
            </div>
            <div style={{ padding: '20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--surface-border)', background: 'var(--content-bg)' }}>
              <h4 style={{ fontWeight: '700', fontSize: '15px' }}>Apparel</h4>
              <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '4px' }}>Tees, Trackpants, Jackets</p>
              <div style={{ fontSize: '22px', fontWeight: '800', color: 'var(--status-warning)', marginTop: '12px' }}>₹1.2Cr</div>
            </div>
            <div style={{ padding: '20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--surface-border)', background: 'var(--content-bg)' }}>
              <h4 style={{ fontWeight: '700', fontSize: '15px' }}>Accessories</h4>
              <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '4px' }}>Socks, Bags, Caps</p>
              <div style={{ fontSize: '22px', fontWeight: '800', color: 'var(--brand-accent)', marginTop: '12px' }}>₹50L</div>
            </div>
          </div>
        </div>
      )}

      {/* DISCOUNT VS FRESH TAB */}
      {activeTab === 'discount-vs-fresh' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div className="card" style={{ borderColor: '#A7F3D0', background: 'linear-gradient(135deg, #FFFFFF 0%, #ECFDF5 100%)' }}>
            <div className="card-header" style={{ justifyContent: 'space-between' }}>
              <span className="status-badge success">FRESH / FULL PRICE</span>
              <span style={{ fontWeight: '800', color: '#065F46', fontSize: '13px' }}>70% of Revenue</span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Revenue (RSV)</div>
            <div style={{ fontSize: '28px', fontWeight: '900', color: '#065F46', marginTop: '4px' }}>₹3.64Cr</div>
          </div>

          <div className="card" style={{ borderColor: '#FDE68A', background: 'linear-gradient(135deg, #FFFFFF 0%, #FFFBEB 100%)' }}>
            <div className="card-header" style={{ justifyContent: 'space-between' }}>
              <span className="status-badge warning">DISCOUNTED / EOSS</span>
              <span style={{ fontWeight: '800', color: '#92400E', fontSize: '13px' }}>30% of Revenue</span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Revenue (RSV)</div>
            <div style={{ fontSize: '28px', fontWeight: '900', color: '#92400E', marginTop: '4px' }}>₹1.56Cr</div>
          </div>
        </div>
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
