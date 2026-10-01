import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireAuth } from '@/middleware/auth';

// GET /api/merchandiser — every EAN row from public.rpt_merch_sku() (latest stock snapshot +
// sales windows). The page filters, buckets and rolls up client-side. Admin only.
// PostgREST caps a response at 1,000 rows, so this pages through the result (ordered by barcode
// so pages never overlap).

export const dynamic = 'force-dynamic';

const PAGE = 1000;
const NUMERIC = [
  'mrp', 'unit_cost', 'stock_qty', 'stock_mrp_value', 'stock_cost_value',
  'sales_qty_30d', 'nsv_30d', 'sales_qty_mtd', 'nsv_mtd', 'sales_qty_rate', 'sales_qty_total',
];

export async function GET(request) {
  const auth = await requireAuth(request, ['admin']);
  if (auth.response) return auth.response;

  try {
    const supabase = createServerClient();
    const rows = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase.rpc('rpt_merch_sku').order('barcode').range(from, from + PAGE - 1);
      if (error) throw new Error(`rpt_merch_sku: ${error.message}`);
      rows.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }
    for (const r of rows) for (const k of NUMERIC) r[k] = r[k] == null ? (k === 'mrp' || k === 'unit_cost' ? null : 0) : Number(r[k]);

    const first = rows[0] || {};
    return NextResponse.json({
      success: true,
      asOf: first.as_of || null,
      storeFirstSale: first.store_first_sale || null,
      rateDays: first.rate_days || 0,
      rows,
    });
  } catch (err) {
    console.error('Merchandiser API error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
