import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    success: true,
    merchMatrix: {
      fresh: { rsv: 36400000, qty: 7800, mdPct: 0.0, bills: 4850 },
      discounted: { rsv: 15600000, qty: 4510, mdPct: 35.5, bills: 2155 },
    },
  });
}
