import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireAuth } from '@/middleware/auth';

// GET /api/pnl — monthly P&L for Uppal Reebok from public.pnl_monthly() (pnl_tracker schema,
// reachable only through that service-role function). Admin only. Empty months = empty list;
// the page never substitutes sample numbers.

export const dynamic = 'force-dynamic';

const NUM = ['capex', 'gross_sale', 'income_margin', 'depreciation', 'funds_cost', 'roi',
  'opex_expenses', 'operating_profit', 'net_profit_opex_dep', 'net_profit_all_costs'];

export async function GET(request) {
  const auth = await requireAuth(request, ['admin']);
  if (auth.response) return auth.response;

  try {
    const supabase = createServerClient();
    const [months, cats] = await Promise.all([
      supabase.rpc('pnl_monthly'),
      supabase.rpc('pnl_expense_categories'),
    ]);
    if (months.error) throw new Error(`pnl_monthly: ${months.error.message}`);
    if (cats.error) throw new Error(`pnl_expense_categories: ${cats.error.message}`);
    const rows = (months.data || []).map((r) => {
      const out = { ...r };
      NUM.forEach((k) => { out[k] = r[k] == null ? null : Number(r[k]); });
      out.expenses = (r.expenses || []).map((e) => ({ ...e, amount: Number(e.amount) }));
      return out;
    });
    return NextResponse.json({ success: true, months: rows, categories: cats.data || [] });
  } catch (err) {
    console.error('P&L API error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
