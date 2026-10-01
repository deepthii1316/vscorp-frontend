import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireAuth } from '@/middleware/auth';

// GET /api/merchandiser/product?barcode=<EAN> — every sales line and stock snapshot for one EAN,
// from public.rpt_merch_product_history(). Admin only.

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requireAuth(request, ['admin']);
  if (auth.response) return auth.response;

  const barcode = (new URL(request.url).searchParams.get('barcode') || '').trim();
  if (!/^[0-9A-Za-z-]{4,40}$/.test(barcode)) {
    return NextResponse.json({ success: false, error: 'Enter a valid barcode (EAN).' }, { status: 400 });
  }

  try {
    const { data, error } = await createServerClient().rpc('rpt_merch_product_history', { p_barcode: barcode });
    if (error) throw new Error(`rpt_merch_product_history: ${error.message}`);
    const num = (v) => (v == null ? null : Number(v));
    const rows = (data || []).map((r) => ({ ...r, qty: num(r.qty), mrp: num(r.mrp), nsv: num(r.nsv), stock_qty: num(r.stock_qty) }));
    return NextResponse.json({
      success: true,
      barcode,
      sales: rows.filter((r) => r.kind === 'sale'),
      stock: rows.filter((r) => r.kind === 'stock'),
    });
  } catch (err) {
    console.error('Merchandiser product API error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
