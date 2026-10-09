import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireAuth } from '@/middleware/auth';

// POST /api/petty-cash/expenses/decision — admin approves or rejects submitted entries.
//   body { ids: [1, 2, ...], action: 'approve' | 'reject', reason }   (reason is required to reject)
// One transaction in public.petty_cash_decide(); only entries still 'submitted' change, and the
// approver is the verified login, never a value from the browser. admin only.

export const dynamic = 'force-dynamic';

const ACTIONS = { approve: 'approved', reject: 'rejected' };
const MAX_IDS = 500;

export async function POST(request) {
  const auth = await requireAuth(request, ['admin']);
  if (auth.response) return auth.response;

  try {
    const body = await request.json().catch(() => ({}));
    const action = ACTIONS[body?.action];
    if (!action) return NextResponse.json({ success: false, error: 'Choose approve or reject.' }, { status: 400 });
    const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map(Number))] : [];
    if (ids.length === 0 || ids.length > MAX_IDS || ids.some((n) => !Number.isInteger(n) || n <= 0)) {
      return NextResponse.json({ success: false, error: 'Select the entries to decide.' }, { status: 400 });
    }
    const reason = String(body.reason ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (action === 'rejected' && !reason) return NextResponse.json({ success: false, error: 'Write why the entry is rejected.' }, { status: 400 });

    const { data, error } = await createServerClient().rpc('petty_cash_decide', {
      p_ids: ids, p_action: action, p_reason: reason || null, p_user: auth.user.id, p_email: auth.user.email || null,
    });
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    return NextResponse.json({ success: true, decided: data ?? 0, skipped: ids.length - (data ?? 0) });
  } catch (err) {
    console.error('Petty cash decision error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
