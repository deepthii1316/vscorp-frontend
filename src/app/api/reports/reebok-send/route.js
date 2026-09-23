// app/api/reports/reebok-send/route.js
// Emails the Uppal Reebok sales report: table screenshots (PNG, inline) + the Excel workbook.
//
// Pipeline (see public/EMAIL-REPORTS.md):
//   browser captures each table with html2canvas → POSTs the PNGs here (multipart)
//   → this route builds the Excel (same builder as the download) → sends one email.
//
// POST multipart/form-data: images[] (png), date (YYYY-MM-DD), mode ('test' | 'all'),
//   recipients (JSON array, mode 'all' only - the addresses picked in the confirm dialog)
// GET → { test: <count>, all: <count>, allRecipients: [<address>, ...] }
//   allRecipients feeds the Send to All picker; the test list is never sent to the client.
//
// mode 'test' always goes to config.js's fixed TEST_RECIPIENTS, no picker. mode 'all' sends
// only to whichever of ALL_RECIPIENTS the client selected - `recipients` is validated as a
// subset of that list server-side, so a request can never target an address outside it.

import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { createServerClient } from '@/lib/supabase';
import { requireAuth } from '@/middleware/auth';
import { EMAIL_FROM, recipientsFor, ALL_RECIPIENTS } from '@/lib/email/config';
import { ordinalDate } from '@/lib/email/reebokHelpers';
import { buildReebokWorkbook } from '@/lib/email/reebokExcel';

export const runtime = 'nodejs';
// Building the Excel + sending 8 images can exceed the default serverless timeout.
export const maxDuration = 60;

// Serverless request cap is ~4.5MB; leave headroom (images + Excel attachment together).
const MAX_BYTES = Math.floor(4.3 * 1024 * 1024);

let transporter = null;
function getTransporter(user, pass) {
  if (!transporter) {
    // Dev-only escape hatch for machines whose antivirus / proxy re-signs TLS traffic
    // ("self-signed certificate in certificate chain"). Never active in production.
    // Preferred fix: set NODE_EXTRA_CA_CERTS to that software's root certificate instead.
    const allowSelfSigned = process.env.SMTP_ALLOW_SELF_SIGNED === 'true' && process.env.NODE_ENV !== 'production';
    transporter = nodemailer.createTransport({
      service: 'gmail',
      pool: true,
      maxConnections: 3,
      auth: { user, pass },
      ...(allowSelfSigned ? { tls: { rejectUnauthorized: false } } : {}),
    });
  }
  return transporter;
}

export async function GET(req) {
  const auth = await requireAuth(req, ['admin', 'store_manager']);
  if (auth.response) return auth.response;

  return NextResponse.json({ test: recipientsFor('test').length, all: recipientsFor('all').length, allRecipients: ALL_RECIPIENTS });
}

export async function POST(req) {
  const auth = await requireAuth(req, ['admin', 'store_manager']);
  if (auth.response) return auth.response;

  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  if (!smtpUser || !smtpPass) {
    return NextResponse.json({ error: 'Email not configured (SMTP_USER / SMTP_PASS missing).' }, { status: 500 });
  }

  try {
    const form = await req.formData();
    const files = form.getAll('images').filter((f) => typeof f !== 'string');
    if (files.length === 0) return NextResponse.json({ error: 'Missing report image(s).' }, { status: 400 });
    const mode = form.get('mode') === 'all' ? 'all' : 'test';
    const dateParam = /^\d{4}-\d{2}-\d{2}$/.test(String(form.get('date') || '')) ? String(form.get('date')) : null;

    // mode 'all': the client picks a subset of ALL_RECIPIENTS in the confirm dialog. Whatever
    // it sends is filtered down to addresses actually in that list - never an arbitrary one.
    // No `recipients` field at all (an older/other caller) -> full list, same as before this
    // picker existed. An explicitly empty selection is rejected, not silently sent to everyone.
    let selectedRecipients = null;
    if (mode === 'all') {
      const raw = form.get('recipients');
      if (raw == null) {
        selectedRecipients = ALL_RECIPIENTS;
      } else {
        let picked;
        try { picked = JSON.parse(String(raw)); } catch { picked = null; }
        if (!Array.isArray(picked)) {
          return NextResponse.json({ error: 'Invalid recipients list.' }, { status: 400 });
        }
        selectedRecipients = ALL_RECIPIENTS.filter((r) => picked.includes(r));
        if (selectedRecipients.length === 0) {
          return NextResponse.json({ error: 'Select at least one recipient.' }, { status: 400 });
        }
      }
    }

    // Images → inline (CID) attachments, in the order the tables were captured.
    let totalBytes = 0;
    const attachments = [];
    for (const [i, f] of files.entries()) {
      const buf = Buffer.from(await f.arrayBuffer());
      totalBytes += buf.byteLength;
      attachments.push({ filename: `report-${i + 1}.png`, content: buf, cid: `report${i}`, contentType: 'image/png' });
    }

    // Excel workbook (same builder as the Download .xlsx button).
    const { buffer: xlsx, reportDate, filename } = await buildReebokWorkbook(createServerClient(), dateParam);
    totalBytes += xlsx.byteLength;

    if (totalBytes > MAX_BYTES) {
      return NextResponse.json(
        { error: `Report is too large to email (${(totalBytes / 1024 / 1024).toFixed(1)}MB, limit ${(MAX_BYTES / 1024 / 1024).toFixed(1)}MB).` },
        { status: 413 },
      );
    }
    attachments.push({
      filename,
      content: xlsx,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    // The date the report covers (reportDate, resolved above to the latest date with data),
    // not the date it's being sent - e.g. sending Sunday sends Saturday's report, subject
    // still reads Saturday's date. Client decision, 23-Sep-2026.
    const displayDate = ordinalDate(reportDate);
    const subject = `${mode === 'test' ? '[TEST] ' : ''}Daily Reports ${displayDate}`;
    const imgTags = attachments
      .filter((a) => a.cid)
      .map((a) => `<img src="cid:${a.cid}" alt="Uppal Reebok report" style="display:block;max-width:100%;height:auto;margin-bottom:16px;" />`)
      .join('');
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#222;">
        <p style="font-size:13px;color:#555;margin:0 0 12px;">
          Uppal Reebok sales report for <b>${displayDate}</b>. The Excel workbook is attached.
        </p>
        ${imgTags}
      </div>`;

    const recipients = mode === 'all' ? selectedRecipients : recipientsFor('test');
    const info = await getTransporter(smtpUser, smtpPass).sendMail({
      from: EMAIL_FROM,
      to: recipients.join(', '),
      subject,
      html,
      attachments,
    });

    return NextResponse.json({ success: true, messageId: info.messageId, recipients: recipients.length, mode, subject });
  } catch (err) {
    console.error('[reebok-send] Error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to send email' }, { status: 500 });
  }
}
