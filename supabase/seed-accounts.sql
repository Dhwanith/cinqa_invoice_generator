-- =============================================================================
-- Chart of Accounts seed — Cinqa Tech Solutions LLP
-- Run AFTER migration 009.
-- Safe to re-run (ON CONFLICT DO NOTHING).
-- =============================================================================

INSERT INTO accounts (organization_id, code, name, type, sub_type, is_system, sort_order) VALUES

-- ── Assets (1xxx) ─────────────────────────────────────────────────────────
('00000000-0000-0000-0000-000000000001','1100','Cash in Hand',           'asset','current_asset',  true, 100),
('00000000-0000-0000-0000-000000000001','1110','Bank - Axis Bank',       'asset','current_asset',  true, 110),
('00000000-0000-0000-0000-000000000001','1200','Accounts Receivable',    'asset','current_asset',  true, 120),
('00000000-0000-0000-0000-000000000001','1210','ITC Receivable - CGST',  'asset','current_asset',  true, 130),
('00000000-0000-0000-0000-000000000001','1211','ITC Receivable - SGST',  'asset','current_asset',  true, 140),
('00000000-0000-0000-0000-000000000001','1212','ITC Receivable - IGST',  'asset','current_asset',  true, 150),
('00000000-0000-0000-0000-000000000001','1300','Prepaid Expenses',       'asset','current_asset',  false,160),
('00000000-0000-0000-0000-000000000001','1400','Security Deposits',      'asset','non_current_asset',false,170),
('00000000-0000-0000-0000-000000000001','1500','Fixed Assets',           'asset','non_current_asset',false,180),
('00000000-0000-0000-0000-000000000001','1510','Accumulated Depreciation','asset','non_current_asset',false,190),

-- ── Liabilities (2xxx) ────────────────────────────────────────────────────
('00000000-0000-0000-0000-000000000001','2100','Accounts Payable',       'liability','current_liability',true, 200),
('00000000-0000-0000-0000-000000000001','2200','GST Payable - CGST',     'liability','current_liability',true, 210),
('00000000-0000-0000-0000-000000000001','2201','GST Payable - SGST',     'liability','current_liability',true, 220),
('00000000-0000-0000-0000-000000000001','2202','GST Payable - IGST',     'liability','current_liability',true, 230),
('00000000-0000-0000-0000-000000000001','2300','TDS Payable',            'liability','current_liability',false,240),
('00000000-0000-0000-0000-000000000001','2400','Salary Payable',         'liability','current_liability',false,250),
('00000000-0000-0000-0000-000000000001','2500','Reimbursements Payable', 'liability','current_liability',true, 260),
('00000000-0000-0000-0000-000000000001','2600','Advance Received',       'liability','current_liability',false,270),

-- ── Partners'' Capital (3xxx) ──────────────────────────────────────────────
('00000000-0000-0000-0000-000000000001','3100','Partners'' Capital Account','equity','partners_capital',true, 300),
('00000000-0000-0000-0000-000000000001','3200','Partners'' Drawings',    'equity','drawings',        false,310),
('00000000-0000-0000-0000-000000000001','3300','Retained Earnings',      'equity','retained_earnings',false,320),

-- ── Income (4xxx) ─────────────────────────────────────────────────────────
('00000000-0000-0000-0000-000000000001','4100','Revenue from IT Services','income','operating_income',true, 400),
('00000000-0000-0000-0000-000000000001','4200','Other Income',           'income','other_income',    false,410),

-- ── Expenses (5xxx) ───────────────────────────────────────────────────────
('00000000-0000-0000-0000-000000000001','5100','Software & Licenses',    'expense','operating_expense',true, 500),
('00000000-0000-0000-0000-000000000001','5110','Cloud & Hosting',        'expense','operating_expense',true, 510),
('00000000-0000-0000-0000-000000000001','5120','Office & Stationery',    'expense','operating_expense',true, 520),
('00000000-0000-0000-0000-000000000001','5130','Equipment & Accessories','expense','operating_expense',true, 530),
('00000000-0000-0000-0000-000000000001','5140','Professional Services',  'expense','operating_expense',true, 540),
('00000000-0000-0000-0000-000000000001','5150','Travel & Accommodation', 'expense','operating_expense',true, 550),
('00000000-0000-0000-0000-000000000001','5160','Marketing & Advertising','expense','operating_expense',false,560),
('00000000-0000-0000-0000-000000000001','5170','Utilities & Telecom',    'expense','operating_expense',true, 570),
('00000000-0000-0000-0000-000000000001','5180','Meals & Entertainment',  'expense','operating_expense',false,580),
('00000000-0000-0000-0000-000000000001','5190','Salary & Partner Remuneration','expense','employee_benefit',false,590),
('00000000-0000-0000-0000-000000000001','5200','Bank Charges',           'expense','operating_expense',false,600),
('00000000-0000-0000-0000-000000000001','5210','Payroll Processing',     'expense','operating_expense',false,610),
('00000000-0000-0000-0000-000000000001','5900','Depreciation',           'expense','non_cash_expense', false,620),
('00000000-0000-0000-0000-000000000001','5910','Other Expenses',         'expense','operating_expense',false,630)

ON CONFLICT (organization_id, code) DO NOTHING;
