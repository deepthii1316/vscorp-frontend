// app/api/reports/reebok-export/route.js
// Reebok Sales — Excel download. The workbook is built by lib/email/reebokExcel.js
// (shared with the email sender) from the same table models as the on-screen report.

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { buildReebokWorkbook } from '@/lib/email/reebokExcel';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const { buffer, filename } = await buildReebokWorkbook(createServerClient(), searchParams.get('date') || null);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control':        'no-store',
      },
    });
  } catch (err) {
    console.error('[reebok-export] Error:', err);
    return NextResponse.json({
      error: err.message,
      stack: (err.stack || '').split(String.fromCharCode(10)).slice(0, 8).join(String.fromCharCode(10)),
    }, { status: 500 });
  }
}
