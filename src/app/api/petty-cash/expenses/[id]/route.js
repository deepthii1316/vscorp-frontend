import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireAuth } from '@/middleware/auth';
import { STORE, cleanExpense, EXPENSE_COLUMNS, toExpense } from '@/lib/pettyCashShared';
import { readPhotos, storePhoto, removePhotos, todayInIndia } from '@/lib/pettyCashPhotos';

// PATCH  /api/petty-cash/expenses/<id> — change a draft or a rejected entry (same multipart form as
//          POST; a photo field left out keeps the photo already saved). status 'submitted' sends it
//          (back) for approval; otherwise it is kept as a draft.
// DELETE /api/petty-cash/expenses/<id> — remove an entry that is not approved.
// store_manager only. Submitted and approved entries cannot be edited; approved ones cannot be deleted.

export const dynamic = 'force-dynamic';

const EDITABLE = ['draft', 'rejected'];
const DELETABLE = ['draft', 'submitted', 'rejected'];

function idOf(params) {
  const id = Number(params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(request, { params }) {
  const auth = await requireAuth(request, ['store_manager']);
  if (auth.response) return auth.response;

  const supabase = createServerClient();
  const stored = [];
  try {
    const id = idOf(await params);
    if (!id) return NextResponse.json({ success: false, error: 'Invalid entry.' }, { status: 400 });
    const form = await request.formData().catch(() => null);
    if (!form) return NextResponse.json({ success: false, error: 'Could not read the entry.' }, { status: 400 });

    const { data: current, error: readError } = await supabase.from('petty_cash_expenses')
      .select('id, status, voucher_path, receipt_path').eq('id', id).eq('store_site_short_name', STORE).maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!current) return NextResponse.json({ success: false, error: 'This entry no longer exists. Refresh the page.' }, { status: 404 });
    if (!EDITABLE.includes(current.status)) return NextResponse.json({ success: false, error: `A ${current.status} entry cannot be changed.` }, { status: 409 });

    const { expense, error: invalid } = cleanExpense(Object.fromEntries(['expense_date', 'category', 'amount', 'description'].map((k) => [k, form.get(k)])), { today: todayInIndia() });
    if (invalid) return NextResponse.json({ success: false, error: invalid }, { status: 400 });
    const { photos, error: badPhoto } = await readPhotos(form);
    if (badPhoto) return NextResponse.json({ success: false, error: badPhoto }, { status: 400 });
    const submit = form.get('status') === 'submitted';
    if (submit && (!(photos.voucher || current.voucher_path) || !(photos.receipt || current.receipt_path))) {
      return NextResponse.json({ success: false, error: 'Add a photo of the debit voucher and of the receipt before submitting.' }, { status: 400 });
    }

    const paths = {};
    const replaced = [];
    for (const kind of Object.keys(photos)) {
      paths[`${kind}_path`] = await storePhoto(supabase, id, kind, photos[kind]);
      stored.push(paths[`${kind}_path`]);
      replaced.push(current[`${kind}_path`]);
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase.from('petty_cash_expenses')
      .update({
        ...expense, ...paths,
        status: submit ? 'submitted' : 'draft',
        submitted_at: submit ? now : null,
        rejection_reason: null, decided_by: null, decided_by_email: null, decided_at: null,
        updated_at: now,
      })
      .eq('id', id).eq('store_site_short_name', STORE).in('status', EDITABLE)
      .select(EXPENSE_COLUMNS).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      await removePhotos(supabase, stored);
      return NextResponse.json({ success: false, error: 'This entry was changed by someone else. Refresh the page.' }, { status: 409 });
    }
    await removePhotos(supabase, replaced);
    return NextResponse.json({ success: true, expense: toExpense(data) });
  } catch (err) {
    console.error('Petty cash entry edit error:', err);
    await removePhotos(supabase, stored);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const auth = await requireAuth(request, ['store_manager']);
  if (auth.response) return auth.response;

  try {
    const id = idOf(await params);
    if (!id) return NextResponse.json({ success: false, error: 'Invalid entry.' }, { status: 400 });
    const supabase = createServerClient();
    const { data, error } = await supabase.from('petty_cash_expenses')
      .delete().eq('id', id).eq('store_site_short_name', STORE).in('status', DELETABLE)
      .select('voucher_path, receipt_path');
    if (error) throw new Error(error.message);
    if (!data?.length) return NextResponse.json({ success: false, error: 'This entry is approved or no longer exists, so it cannot be deleted.' }, { status: 409 });
    await removePhotos(supabase, [data[0].voucher_path, data[0].receipt_path]);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Petty cash entry delete error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
