-- P&L Tracker Schema (simplified single-store version)
-- For Uppal Reebok store only, no clusters

CREATE SCHEMA IF NOT EXISTS pnl_tracker;

-- Store information
CREATE TABLE pnl_tracker.stores (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  store_code TEXT UNIQUE,
  brand TEXT DEFAULT 'Regular', -- Regular or KKN
  carpet_sqft INTEGER,
  grade TEXT,
  type TEXT,
  capex NUMERIC,
  rental_deposit NUMERIC,
  stock_deposit NUMERIC,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Expense categories
CREATE TABLE pnl_tracker.expense_categories (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  group_name TEXT, -- Staffing, Occupancy, Other
  sort_order INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Monthly P&L data
CREATE TABLE pnl_tracker.monthly_pnl (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT NOT NULL REFERENCES pnl_tracker.stores(id),
  period_month DATE NOT NULL, -- First day of month

  -- Revenue
  gross_sale NUMERIC, -- Sales (NSV)
  discounts NUMERIC,
  gst NUMERIC,
  net_sales NUMERIC,

  -- Margin & Profitability
  income_margin NUMERIC, -- From source Excel
  depreciation NUMERIC,
  funds_cost NUMERIC,

  -- Calculations
  opex_expenses NUMERIC,
  operating_profit NUMERIC,
  net_profit_opex_dep NUMERIC,
  net_profit_opex_dep_funds NUMERIC,

  -- KPIs
  roi NUMERIC,
  breakeven_opex NUMERIC,
  breakeven_opex_capex NUMERIC,
  breakeven_opex_capex_interest NUMERIC,
  sales_per_sqft NUMERIC,

  -- Metadata
  import_source TEXT, -- 'manual' or 'excel'
  import_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(store_id, period_month)
);

-- Expense line items (per category, per month)
CREATE TABLE pnl_tracker.monthly_expense_lines (
  id BIGSERIAL PRIMARY KEY,
  monthly_pnl_id BIGINT NOT NULL REFERENCES pnl_tracker.monthly_pnl(id) ON DELETE CASCADE,
  category_id BIGINT NOT NULL REFERENCES pnl_tracker.expense_categories(id),
  amount NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(monthly_pnl_id, category_id)
);

-- Create view for monthly totals
CREATE OR REPLACE VIEW pnl_tracker.monthly_pnl_totals AS
SELECT
  mp.id,
  mp.store_id,
  s.name as store_name,
  s.store_code,
  mp.period_month,
  mp.gross_sale,
  mp.discounts,
  mp.net_sales,
  mp.income_margin,
  mp.depreciation,
  mp.funds_cost,
  COALESCE(SUM(mel.amount), 0) as opex_expenses,
  COALESCE(mp.income_margin, 0) - COALESCE(SUM(mel.amount), 0) as operating_profit,
  COALESCE(mp.income_margin, 0) - COALESCE(SUM(mel.amount), 0) - COALESCE(mp.depreciation, 0) as net_profit_opex_dep,
  COALESCE(mp.income_margin, 0) - COALESCE(SUM(mel.amount), 0) - COALESCE(mp.depreciation, 0) - COALESCE(mp.funds_cost, 0) as net_profit_all_costs,
  mp.roi,
  mp.sales_per_sqft,
  mp.created_at,
  mp.updated_at
FROM pnl_tracker.monthly_pnl mp
JOIN pnl_tracker.stores s ON mp.store_id = s.id
LEFT JOIN pnl_tracker.monthly_expense_lines mel ON mp.id = mel.monthly_pnl_id
GROUP BY mp.id, mp.store_id, s.name, s.store_code, mp.period_month, mp.gross_sale, mp.discounts, mp.net_sales, mp.income_margin, mp.depreciation, mp.funds_cost, mp.roi, mp.sales_per_sqft, mp.created_at, mp.updated_at;

-- Enable RLS
ALTER TABLE pnl_tracker.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE pnl_tracker.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE pnl_tracker.monthly_pnl ENABLE ROW LEVEL SECURITY;
ALTER TABLE pnl_tracker.monthly_expense_lines ENABLE ROW LEVEL SECURITY;

-- Create permissive policies (open access for now - add auth later)
CREATE POLICY "Allow all access to stores" ON pnl_tracker.stores FOR ALL USING (true);
CREATE POLICY "Allow all access to expense_categories" ON pnl_tracker.expense_categories FOR ALL USING (true);
CREATE POLICY "Allow all access to monthly_pnl" ON pnl_tracker.monthly_pnl FOR ALL USING (true);
CREATE POLICY "Allow all access to monthly_expense_lines" ON pnl_tracker.monthly_expense_lines FOR ALL USING (true);

-- Insert Uppal store
INSERT INTO pnl_tracker.stores (name, store_code, brand, carpet_sqft, capex, rental_deposit, stock_deposit)
VALUES ('REEBOK UPPAL', '323865', 'Regular', 1200, 5330536, 1260000, 1800000)
ON CONFLICT (name) DO NOTHING;

-- Insert expense categories
INSERT INTO pnl_tracker.expense_categories (name, group_name, sort_order) VALUES
('Rent + CAM', 'Occupancy', 1),
('Staff Salaries', 'Staffing', 2),
('Electricity Bill', 'Occupancy', 3),
('Telephone & Internet', 'Occupancy', 4),
('Petty Cash', 'Other', 5),
('House Keeping', 'Other', 6),
('Staff Incentives', 'Staffing', 7),
('Bank EDC Charges', 'Other', 8),
('Bank UPI Charges', 'Other', 9)
ON CONFLICT (name) DO NOTHING;
