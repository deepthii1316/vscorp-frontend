'use client';

import { TrendingUp, Users, Package, Truck, RefreshCw, CreditCard } from 'lucide-react';

const reportTypes = [
  { id: 'sales',         icon: TrendingUp, name: 'Sales',         description: 'Sales Item Report' },
  { id: 'inventory',     icon: Package,   name: 'Inventory',     description: 'Stock Report' },
  { id: 'account_dsr',   icon: CreditCard, name: 'Account DSR',  description: 'Payment Mode Split' },
  { id: 'salesperson',   icon: Users,     name: 'Salesperson',   description: 'Sales Person Report' },
  { id: 'grn',           icon: Truck,     name: 'GRN',           description: 'Goods Received Note' },
  { id: 'site_movement', icon: RefreshCw, name: 'Site Movement', description: 'Site Movement Report' },
];

export default function ReportTypeSelector({ selectedType, onSelect }) {
  return (
    <div>
      {/* Source Selector Pill */}
      <div style={{ marginBottom: 'var(--space-5)' }}>
        <p className="section-label">Source</p>
        <div className="source-pills">
          <button type="button" className="source-pill active">Supply Mint</button>
        </div>
      </div>

      {/* Report Type Selector */}
      <div>
        <p className="section-label">Report Type</p>
        <div className="report-types-grid">
          {reportTypes.map((type) => {
            const IconComponent = type.icon;
            const isSelected = selectedType === type.id;
            return (
              <button
                key={type.id}
                className={`report-type-card ${isSelected ? 'selected' : ''}`}
                onClick={() => onSelect(type.id)}
                type="button"
              >
                <div className="report-type-icon-wrapper">
                  <IconComponent className="report-type-icon-svg" />
                </div>
                <div>
                  <div className="report-type-name">{type.name}</div>
                  <div className="report-type-desc">{type.description}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
