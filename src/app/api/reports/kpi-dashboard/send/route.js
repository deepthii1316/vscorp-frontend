import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { createServerClient } from '@/lib/supabase';
import { EMAIL_FROM, recipientsFor } from '@/lib/email/config';

// SEND step: receives one or more report screenshots (data URLs) from the
// browser and emails them as INLINE (CID) images, one after another. The email
// HTML stays tiny, so Gmail never clips it, and the images show inline the
// moment the mail opens.
// Body: { images: ['data:image/png;base64,...', ...], subject, displayDate?, mode? }
//   mode 'test' (default) → you + Aditya; 'all' → full distribution list.
//   (also accepts legacy single { imageBase64 })

// Reuse one pooled SMTP transporter across (warm) invocations so back-to-back
// sends skip the Gmail connect / TLS / auth handshake each time.
let transporter = null;
function getTransporter(user, pass) {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      pool: true,
      maxConnections: 3,
      auth: { user, pass },
    });
  }
  return transporter;
}

export async function POST(req) {
  const supabase = await createServerClient();

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (!profile || profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  if (!smtpUser || !smtpPass) {
    return NextResponse.json(
      { error: 'Email not configured (SMTP_USER / SMTP_PASS missing).' },
      { status: 500 }
    );
  }

  // Two input formats:
  //  • multipart/form-data (preferred) — binary images. No base64 +33% bloat, so
  //    e.g. the 6-image YoY report stays under the ~4.5MB serverless request cap.
  //  • JSON { images: ['data:image/...;base64,...'] } — legacy fallback.
  const attachments = [];
  let totalBytes = 0;
  let subject = 'VS Corp Report';
  let displayDate;
  let mode = 'test';

  const push = (buffer, ext) => {
    totalBytes += buffer.byteLength;
    attachments.push({
      filename: `report-${attachments.length + 1}.${ext}`,
      content: buffer,
      cid: `report${attachments.length}`,
      contentType: `image/${ext}`,
    });
  };

  if ((req.headers.get('content-type') || '').includes('multipart/form-data')) {
    const form = await req.formData();
    const files = form.getAll('images').filter((f) => f instanceof File);
    if (files.length === 0) return NextResponse.json({ error: 'Missing image(s).' }, { status: 400 });
    subject = (form.get('subject')) || subject;
    displayDate = form.get('displayDate') || undefined;
    mode = form.get('mode') === 'all' ? 'all' : 'test';
    for (const f of files) {
      push(Buffer.from(await f.arrayBuffer()), f.type.includes('jpeg') ? 'jpeg' : 'png');
    }
  } else {
    const body = await req.json().catch(() => null);
    const images = body?.images ?? (body?.imageBase64 ? [body.imageBase64] : []);
    if (images.length === 0) return NextResponse.json({ error: 'Missing image(s).' }, { status: 400 });
    subject = body?.subject || subject;
    displayDate = body?.displayDate;
    mode = body?.mode === 'all' ? 'all' : 'test';
    for (const img of images) {
      const m = img.match(/^data:image\/(png|jpeg);base64,(.+)$/);
      if (!m) return NextResponse.json({ error: 'Invalid image data.' }, { status: 400 });
      push(Buffer.from(m[2], 'base64'), m[1]);
    }
  }

  const recipients = recipientsFor(mode);

  // Guard total size against the ~4.5MB serverless request cap (binary → allow
  // closer to the ceiling than the old base64 path could).
  const MAX_BYTES = Math.floor(4.3 * 1024 * 1024);
  if (totalBytes > MAX_BYTES) {
    return NextResponse.json(
      { error: `Report image(s) too large to email (${(totalBytes / 1024 / 1024).toFixed(1)}MB).` },
      { status: 413 }
    );
  }

  const imgTags = attachments
    .map((a) => `<img src="cid:${a.cid}" alt="report" width="1650" style="display:block;width:100%;max-width:100%;height:auto;border:1px solid #ddd;margin-bottom:16px;" />`)
    .join('');
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#222;">
      <p style="font-size:13px;color:#555;margin:0 0 8px;">
        ${displayDate ? `VS Corp Report for <b>${displayDate}</b>` : 'VS Corp Report'}. Full report below (tap to zoom for detail).
      </p>
      ${imgTags}
    </div>`;

  try {
    const info = await getTransporter(smtpUser, smtpPass).sendMail({
      from: EMAIL_FROM,
      to: recipients.join(', '),
      subject,
      html,
      attachments,
    });
    return NextResponse.json({
      success: true,
      messageId: info.messageId,
      recipients: recipients.length,
      mode,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to send email' },
      { status: 500 }
    );
  }
}