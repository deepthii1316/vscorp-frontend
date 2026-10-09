import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireAuth } from '@/middleware/auth';
import { STORE, cleanExpense, EXPENSE_COLUMNS, toExpense } from '@/lib/pettyCashShared';
import { readPhotos, storePhoto, removePhotos, todayInIndia } from '@/lib/pettyCashPhotos';

// POST /api/petty-cash/expenses — the store manager adds one petty cash entry (multipart form):
//   expense_date, category, amount, description, status ('draft' | 'submitted'),
//   voucher (photo of the debit voucher), receipt (photo of the receipt)
// A draft may be saved without photos; submitting needs both. A submitted entry is "reserved"
// until admin approves or rejects it. store_manager only. The page sends several entries one
// request at a time, so one bad row never loses the others.

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const auth = await requireAuth(request, ['store_manager']);
  if (auth.response) return auth.response;

  const supabase = createServerClient();
  let createdId = null;
  const stored = [];
  try {
    const form = await request.formData().catch(() => null);
    if (!form) return NextResponse.json({ success: false, error: 'Could not read the entry.' }, { status: 400 });

    const { expense, error: invalid } = cleanExpense(Object.fromEntries(['expense_date', 'category', 'amount', 'description'].map((k) => [k, form.get(k)])), { today: todayInIndia() });
    if (invalid) return NextResponse.json({ success: false, error: invalid }, { status: 400 });
    const { photos, error: badPhoto } = await readPhotos(form);
    if (badPhoto) return NextResponse.json({ success: false, error: badPhoto }, { status: 400 });
    const submit = form.get('status') === 'submitted';
    if (submit && (!photos.voucher || !photos.receipt)) {
      return NextResponse.json({ success: false, error: 'Add a photo of the debit voucher and of the receipt before submitting.' }, { status: 400 });
    }

    // Row first (as a draft) so the photos can be filed under its id; then photos; then the final status.
    const { data: created, error: insertError } = await supabase.from('petty_cash_expenses')
      .insert({ ...expense, store_site_short_name: STORE, status: 'draft', created_by: auth.user.id, created_by_email: auth.user.email || null })
      .select('id').single();
    if (insertError) throw new Error(insertError.message);
    createdId = created.id;

    const paths = {};
    for (const kind of Object.keys(photos)) {
      paths[`${kind}_path`] = await storePhoto(supabase, createdId, kind, photos[kind]);
      stored.push(paths[`${kind}_path`]);
    }

    const patch = { ...paths, updated_at: new Date().toISOString() };
    if (submit) { patch.status = 'submitted'; patch.submitted_at = patch.updated_at; }
    const { data, error } = await supabase.from('petty_cash_expenses').update(patch).eq('id', createdId).select(EXPENSE_COLUMNS).single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, expense: toExpense(data) });
  } catch (err) {
    console.error('Petty cash entry error:', err);
    // Leave nothing half-saved.
    await removePhotos(supabase, stored);
    if (createdId) await supabase.from('petty_cash_expenses').delete().eq('id', createdId);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
