'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
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
} from 'lucide-react';

const navItems = [
  {
    section: 'Analytics',
    items: [
      { href: '/master-dashboard', label: 'Master Dashboard', icon: LayoutDashboard },
      { href: '/assets', label: 'Assets', icon: Box, disabled: true },
    ],
  },
  {
    section: 'Admin',
    items: [
      { href: '/upload',          label: 'Data Upload',    icon: UploadCloud },
      { href: '/upload-history',  label: 'Upload History', icon: History },
      { href: '/data-coverage',   label: 'Data Coverage',  icon: FileCheck },
      { href: '/reebok-reports',  label: 'Sales Reports',  icon: FileSpreadsheet },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [report, setReport] = useState(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    setReport(params.get('report'));
  }, [pathname]);

  if (pathname === '/login') return null;

  return (
    <aside className="sidebar">
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
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {navItems.map((group) => (
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
          <div className="sidebar-user-avatar">A</div>
          <div>
            <div className="sidebar-user-name">Admin</div>
            <div className="sidebar-user-role">Administrator</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
