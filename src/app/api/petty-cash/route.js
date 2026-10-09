import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireAuth } from '@/middleware/auth';
import { syncPettyCashIfStale } from '@/lib/pettyCashSync';
import { STORE, ENTRY_COLUMNS, toEntry, EXPENSE_COLUMNS, toExpense } from '@/lib/pettyCashShared';

// GET /api/petty-cash — everything the Petty Cash page needs for Uppal Reebok:
//   entries   the cash book lines from the Account DSR Excel (public.petty_cash_entries)
//   expenses  the entries made in the app, every status (public.petty_cash_expenses)
//   targetFloat, lastUpload (the last Account DSR the cash book came from), role
// admin and store_manager. Balances are worked out on the page (src/lib/pettyCashShared.js).
// The Excel lines are only ever written from the Account DSR: at upload (/api/upload), or here
// when a newer Account DSR is found that the cash book has not been built from yet.

export const dynamic = 'force-dynamic';

const PAGE = 1000; // PostgREST row cap per request

async function readAll(build) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

export async function GET(request) {
  const auth = await requireAuth(request, ['admin', 'store_manager']);
  if (auth.response) return auth.response;

  try {
    const supabase = createServerClient();
    // Make sure the cash book is from the latest Account DSR before reading it.
    await syncPettyCashIfStale(supabase);
    const [entries, expenses, uploads, settings] = await Promise.all([
      readAll(() => supabase.from('petty_cash_entries').select(ENTRY_COLUMNS)
        .eq('store_site_short_name', STORE).order('entry_date').order('line_no').order('id')),
      readAll(() => supabase.from('petty_cash_expenses').select(EXPENSE_COLUMNS)
        .eq('store_site_short_name', STORE).order('expense_date', { ascending: false }).order('id', { ascending: false })),
      supabase.from('petty_cash_uploads').select('file_name, sheet_title, line_count, uploaded_by_email, uploaded_at')
        .eq('store_site_short_name', STORE).order('uploaded_at', { ascending: false }).limit(1),
      supabase.from('petty_cash_settings').select('target_float').eq('store_site_short_name', STORE).maybeSingle(),
    ]);
    if (uploads.error) throw new Error(`petty_cash_uploads: ${uploads.error.message}`);
    if (settings.error) throw new Error(`petty_cash_settings: ${settings.error.message}`);

    return NextResponse.json({
      success: true,
      entries: entries.map(toEntry),
      expenses: expenses.map(toExpense),
      targetFloat: Number(settings.data?.target_float ?? 15000),
      lastUpload: uploads.data?.[0] || null,
      role: auth.role,
    });
  } catch (err) {
    console.error('Petty cash API error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
