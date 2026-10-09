import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireAuth } from '@/middleware/auth';
import { STORE, PHOTO_BUCKET, PHOTO_KINDS } from '@/lib/pettyCashShared';

// GET /api/petty-cash/expenses/<id>/photo?kind=voucher|receipt — a 5-minute signed link to one
// photo of one entry. The bucket is private; this route is the only way to a photo, and it
// checks the login and the store first. admin and store_manager.

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const auth = await requireAuth(request, ['admin', 'store_manager']);
  if (auth.response) return auth.response;

  try {
    const id = Number((await params).id);
    const kind = new URL(request.url).searchParams.get('kind');
    if (!Number.isInteger(id) || id <= 0 || !PHOTO_KINDS[kind]) return NextResponse.json({ success: false, error: 'Invalid photo.' }, { status: 400 });

    const supabase = createServerClient();
    const { data, error } = await supabase.from('petty_cash_expenses')
      .select('voucher_path, receipt_path').eq('id', id).eq('store_site_short_name', STORE).maybeSingle();
    if (error) throw new Error(error.message);
    const path = data?.[`${kind}_path`];
    if (!path) return NextResponse.json({ success: false, error: 'No photo saved for this entry.' }, { status: 404 });

    const { data: signed, error: signError } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, 300);
    if (signError) throw new Error(signError.message);
    return NextResponse.json({ success: true, url: signed.signedUrl });
  } catch (err) {
    console.error('Petty cash photo error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
