'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import {
  LayoutDashboard,
  Box,
  UploadCloud,
  History,
  FileCheck,
  Users,
  Grid3x3,
  PieChart,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

// roles omitted -> visible to every logged-in role. Master Dashboard and the
// Admin-only pages need an explicit ['admin'] since store_manager can't reach them
// (each route/page also re-checks this server-side - this list is only what's shown).
const navItems = [
  {
    section: 'Analytics',
    items: [
      { href: '/master-dashboard', label: 'Master Dashboard', icon: LayoutDashboard, roles: ['admin'] },
      { href: '/assets', label: 'Assets', icon: Box, disabled: true, roles: ['admin'] },
    ],
  },
  {
    section: 'Admin',
    items: [
      { href: '/upload',          label: 'Data Upload',    icon: UploadCloud, roles: ['admin'] },
      { href: '/upload-history',  label: 'Upload History', icon: History, roles: ['admin'] },
      { href: '/data-coverage',   label: 'Data Coverage',  icon: FileCheck, roles: ['admin'] },
      { href: '/reebok-reports',  label: 'Sales Reports',  icon: FileSpreadsheet },
    ],
  },
];

const ROLE_LABEL = { admin: 'Administrator', store_manager: 'Store Manager' };

export default function Sidebar({ collapsed = false, onToggleCollapsed }) {
  const pathname = usePathname();
  const [report, setReport] = useState(null);
  const { user, role } = useAuth();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    setReport(params.get('report'));
  }, [pathname]);

  if (pathname === '/login') return null;

  const visibleGroups = navItems
    .map((group) => ({ ...group, items: group.items.filter((item) => !item.roles || item.roles.includes(role)) }))
    .filter((group) => group.items.length > 0);

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      {/* Brand */}
      <div className="sidebar-brand">
        <div className="sidebar-logo">
          <img src="/virata-logo.png" alt="Virata Retail" className="sidebar-logo-img" />
        </div>
        <div className="sidebar-brand-text">
          <span className="sidebar-brand-name">Virata Retail</span>
          <br />
          <span className="sidebar-brand-sub">Retail Operations</span>
        </div>
        <button
          type="button"
          className="sidebar-toggle"
          onClick={onToggleCollapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight /> : <ChevronLeft />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {visibleGroups.map((group) => (
          <div key={group.section} className="sidebar-section">
            <span className="sidebar-section-label">{group.section}</span>
            <ul className="sidebar-menu">
              {group.items.map((item) => {
                const IconComp = item.icon;
                if (item.subItems) {
                  return (
                    <li key={item.label}>
                      <span className="sidebar-link" style={{ fontWeight: 600 }}>
                        <span className="sidebar-link-icon">
                          <IconComp />
                        </span>
                        <span className="sidebar-link-label">{item.label}</span>
                      </span>
                      <ul className="sidebar-submenu">
                        {item.subItems.map((sub) => {
                          const subReport = sub.href.split('report=')[1] || null;
                          const isOnReebokReports = pathname === '/reebok-reports';
                          const subActive = isOnReebokReports && report === subReport;
                          return (
                            <li key={sub.label}>
                              <Link href={sub.href} className={`sidebar-link sidebar-sub ${subActive ? 'active' : ''}`}>
                                <span className="sidebar-link-label">{sub.label}</span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  );
                }

                // For reebok-reports, active state requires both pathname + report param
                const isOnReebokReports = pathname === '/reebok-reports';
                const expectedReport = item.href.split('report=')[1] || null;
                const isActive = expectedReport
                  ? isOnReebokReports && report === expectedReport
                  : pathname === item.href;
                return (
                  <li key={item.label}>
                    {item.disabled ? (
                      <span className="sidebar-link disabled">
                        <span className="sidebar-link-icon">
                          <IconComp />
                        </span>
                        <span className="sidebar-link-label">{item.label}</span>
                      </span>
                    ) : (
                      <Link
                        href={item.href}
                        className={`sidebar-link ${isActive ? 'active' : ''}`}
                      >
                        <span className="sidebar-link-icon">
                          <IconComp />
                        </span>
                        <span className="sidebar-link-label">{item.label}</span>
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="sidebar-user-avatar">{(user?.email || '?')[0].toUpperCase()}</div>
          <div>
            <div className="sidebar-user-name">{user?.email || '—'}</div>
            <div className="sidebar-user-role">{ROLE_LABEL[role] || '…'}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
