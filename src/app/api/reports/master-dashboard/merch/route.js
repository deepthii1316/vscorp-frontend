import { NextResponse } from 'next/server';
import { requireAuth } from '@/middleware/auth';

export async function GET(request) {
  const auth = await requireAuth(request, ['admin']);
  if (auth.response) return auth.response;

  return NextResponse.json({
    success: true,
    merchMatrix: {
      fresh: { rsv: 36400000, qty: 7800, mdPct: 0.0, bills: 4850 },
      discounted: { rsv: 15600000, qty: 4510, mdPct: 35.5, bills: 2155 },
    },
  });
}
