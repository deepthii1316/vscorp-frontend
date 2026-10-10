import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireAuth } from '@/middleware/auth';
import { cleanAsset, isUuid, assetKey, cleanText, MAX_IMPORT_ROWS } from '@/lib/assetShared';

// POST /api/assets/import — body { store_id, file_name, sheet_name, rows: [{ category, item, brand,
// specification, quantity, remark }] }, as produced by src/lib/assetExcel.js (rows with an error
// and repeated items are left out by the page). Every row is checked again here, then saved by
// public.asset_import() in one transaction: all rows or none. A row whose item the store already
// has updates it; any other row is added. Admin only.

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const auth = await requireAuth(request, ['admin']);
  if (auth.response) return auth.response;

  try {
    const body = await request.json().catch(() => null);
    if (!isUuid(body?.store_id)) return NextResponse.json({ success: false, error: 'Choose the store to import into.' }, { status: 400 });
    if (!Array.isArray(body.rows) || body.rows.length === 0) return NextResponse.json({ success: false, error: 'No rows to import.' }, { status: 400 });
    if (body.rows.length > MAX_IMPORT_ROWS) return NextResponse.json({ success: false, error: `Too many rows in one import (${MAX_IMPORT_ROWS} at most).` }, { status: 400 });

    const rows = [];
    const seen = new Set();
    for (let i = 0; i < body.rows.length; i++) {
      const { asset, error } = cleanAsset(body.rows[i]);
      if (error) return NextResponse.json({ success: false, error: `Row ${i + 1}: ${error}` }, { status: 400 });
      const key = assetKey(asset.category, asset.item);
      if (seen.has(key)) return NextResponse.json({ success: false, error: `"${asset.item}" under ${asset.category} is listed more than once.` }, { status: 400 });
      seen.add(key);
      rows.push(asset);
    }

    const { data, error } = await createServerClient().rpc('asset_import', {
      p_store: body.store_id, p_rows: rows,
      p_file: cleanText(body.file_name).slice(0, 200) || null, p_sheet: cleanText(body.sheet_name).slice(0, 200) || null,
      p_email: auth.user.email || null,
    });
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    return NextResponse.json({ success: true, inserted: data?.inserted ?? 0, updated: data?.updated ?? 0 });
  } catch (err) {
    console.error('Asset import error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
