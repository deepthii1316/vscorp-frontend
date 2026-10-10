import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireAuth } from '@/middleware/auth';

// POST /api/pnl/import — body { months: [{ period_month: 'YYYY-MM-01', gross_sale, income_margin,
// depreciation, funds_cost, roi, expenses: { '<category>': amount } }] }, as produced by
// src/lib/pnlExcelImport.js. Saved by public.pnl_import() in one transaction: all months or none.
// Admin only.

export const dynamic = 'force-dynamic';

const FIELDS = ['gross_sale', 'income_margin', 'depreciation', 'funds_cost', 'roi'];
const isNum = (v) => v === null || (typeof v === 'number' && Number.isFinite(v));

function validate(months) {
  if (!Array.isArray(months) || months.length === 0) return 'No months to import.';
  if (months.length > 120) return 'Too many months in one import (max 120).';
  for (const m of months) {
    if (!/^\d{4}-\d{2}-01$/.test(m?.period_month || '')) return `Invalid month "${m?.period_month}".`;
    for (const f of FIELDS) if (!isNum(m[f] ?? null)) return `${m.period_month}: ${f} is not a number.`;
    if (m.expenses && (typeof m.expenses !== 'object' || Array.isArray(m.expenses))) return `${m.period_month}: expenses must be an object.`;
    for (const [k, v] of Object.entries(m.expenses || {})) if (!isNum(v)) return `${m.period_month}: "${k}" is not a number.`;
  }
  return null;
}

export async function POST(request) {
  const auth = await requireAuth(request, ['admin']);
  if (auth.response) return auth.response;

  try {
    const { months } = await request.json().catch(() => ({}));
    const invalid = validate(months);
    if (invalid) return NextResponse.json({ success: false, error: invalid }, { status: 400 });

    const rows = months.map((m) => ({
      period_month: m.period_month,
      ...Object.fromEntries(FIELDS.map((f) => [f, m[f] ?? null])),
      expenses: m.expenses || {},
    }));
    const { data, error } = await createServerClient().rpc('pnl_import', { p_rows: rows });
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    return NextResponse.json({ success: true, saved: data?.saved || [] });
  } catch (err) {
    console.error('P&L import error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
