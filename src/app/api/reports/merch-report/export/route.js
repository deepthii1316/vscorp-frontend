// app/api/reports/merch-report/export/route.js
// Reebok Merchandiser Report — Excel download. The workbook is built by
// lib/email/merchReportExcel.js from the same table models as the on-screen report.

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireAuth } from '@/middleware/auth';
import { buildMerchWorkbook } from '@/lib/email/merchReportExcel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const auth = await requireAuth(req, ['admin']);
  if (auth.response) return auth.response;

  try {
    const { buffer, reportDate, filename } = await buildMerchWorkbook(createServerClient());
    if (!reportDate) return NextResponse.json({ error: 'No stock report loaded yet.' }, { status: 404 });
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[merch-report/export] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
