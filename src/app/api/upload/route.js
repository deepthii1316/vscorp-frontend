import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { createServerClient } from '@/lib/supabase';
import { requireAuth } from '@/middleware/auth';
import { generateFileName, getStoragePath, BUCKET_NAME } from '@/lib/fileRename';

// export const dynamic = 'force-dynamic';


async function legacyPOST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const reportType = formData.get('reportType');
    const sha256 = formData.get('sha256');
    const originalFileName = formData.get('originalFileName');

    // Validate inputs
    if (!file || !reportType || !sha256) {
      return NextResponse.json(
        { error: 'Missing required fields: file, reportType, sha256' },
        { status: 400 }
      );
    }

    const validTypes = ['sales', 'inventory', 'account_dsr'];
    if (!validTypes.includes(reportType)) {
      return NextResponse.json(
        { error: `Invalid report type. Must be one of: ${validTypes.join(', ')}` },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // ─── Step 1: Dedup check ───────────────────────────────
    const { data: existing } = await supabase
      .from('upload_audit_log')
      .select('*')
      .eq('file_sha256', sha256)
      .single();

    if (existing) {
      return NextResponse.json(
        {
          error: 'Duplicate file — this exact file has already been uploaded.',
          duplicateInfo: {
            uploaded_at: existing.uploaded_at,
            renamed_file_name: existing.renamed_file_name,
            report_type: existing.report_type,
            status: existing.status,
          },
        },
        { status: 409 }
      );
    }

    // ─── Step 2: Generate storage filename & path ──────────
    const renamedFileName = generateFileName(reportType);
    const storagePath = getStoragePath(reportType, renamedFileName);

    // ─── Step 3: Read file buffer ──────────────────────────
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileSize = buffer.length;

    // ─── Step 4: Upload raw file to Supabase Storage ───────
    const { error: storageError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });

    if (storageError) {
      throw new Error(`Storage upload failed: ${storageError.message}`);
    }

    // ─── Step 5: Log audit record ──────────────────────────
    // Try status 'pending', fallback to 'uploaded' if remote database check constraint rejects 'pending'
    // If this step fails for ANY reason, we must ROLL BACK the storage upload
    // so the file is not orphaned in the bucket without an audit trail.
    let auditEntry = null;
    let auditError = null;

    const insertPayload = {
      file_sha256: sha256,
      original_file_name: originalFileName || file.name,
      renamed_file_name: renamedFileName,
      report_type: reportType,
      storage_path: storagePath,
      file_size_bytes: fileSize,
      uploaded_by: 'admin',
      status: 'pending',
      row_count: 0,
    };

    try {
      const res1 = await supabase
        .from('upload_audit_log')
        .insert(insertPayload)
        .select()
        .single();

      auditEntry = res1.data;
      auditError = res1.error;

      if (auditError && auditError.code === '23514') {
        // Retry with status 'uploaded' if 'pending' was rejected by constraint
        insertPayload.status = 'uploaded';
        const res2 = await supabase
          .from('upload_audit_log')
          .insert(insertPayload)
          .select()
          .single();

        auditEntry = res2.data;
        auditError = res2.error;
      }
    } catch (err) {
      auditError = err;
    }

    if (auditError) {
      // Roll back the storage upload so the file is not orphaned in the bucket.
      try {
        await supabase.storage.from(BUCKET_NAME).remove([storagePath]);
      } catch (cleanupErr) {
        console.error('Failed to clean up orphaned storage file:', cleanupErr);
      }

      if (auditError.code === '23505') {
        return NextResponse.json(
          { error: 'Duplicate file — upload blocked (concurrent upload detected).' },
          { status: 409 }
        );
      }
      throw new Error(`Audit log insert failed: ${auditError.message}`);
    }

    return NextResponse.json({
      success: true,
      renamedFileName,
      storagePath,
      status: 'pending',
      message: `File uploaded to cloud storage successfully. Queued as pending for batch processing.`,
      auditId: auditEntry.id,
    });
  } catch (error) {
    console.error('Upload API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;

  let storagePath = null;
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const reportType = formData.get('reportType');
    const clientHash = formData.get('sha256');
    const originalFileName = formData.get('originalFileName');
    const validTypes = ['sales', 'inventory', 'account_dsr'];

    if (!file || !validTypes.includes(reportType)) {
      return NextResponse.json({ error: 'A file and a valid report type are required.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileSha256 = createHash('sha256').update(buffer).digest('hex');
    if (clientHash && clientHash !== fileSha256) {
      return NextResponse.json({ error: 'File hash validation failed. Select the file again.' }, { status: 400 });
    }

    const supabase = createServerClient();
    const { data: duplicate, error: duplicateError } = await supabase
      .from('upload_audit_log')
      .select('id, uploaded_at, renamed_file_name, report_type, status')
      .eq('file_sha256', fileSha256)
      .maybeSingle();
    if (duplicateError) throw new Error(`Duplicate check failed: ${duplicateError.message}`);
    if (duplicate) {
      return NextResponse.json({
        error: 'This exact file has already been uploaded.',
        duplicateInfo: duplicate,
      }, { status: 409 });
    }

    const renamedFileName = generateFileName(reportType);
    storagePath = getStoragePath(reportType, renamedFileName);
    const { error: storageError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });
    if (storageError) throw new Error(`Storage upload failed: ${storageError.message}`);

    const { data: audit, error: auditError } = await supabase
      .from('upload_audit_log')
      .insert({
        file_sha256: fileSha256,
        original_file_name: originalFileName || file.name,
        renamed_file_name: renamedFileName,
        report_type: reportType,
        storage_path: storagePath,
        file_size_bytes: buffer.length,
        uploaded_by: 'admin',
        status: 'queued',
        row_count: 0,
      })
      .select('id, status')
      .single();

    if (auditError) {
      if (auditError.code === '23505') {
        await supabase.storage.from(BUCKET_NAME).remove([storagePath]);
        return NextResponse.json({ error: 'This exact file was uploaded concurrently.' }, { status: 409 });
      }
      throw new Error(`Could not queue upload: ${auditError.message}`);
    }

    return NextResponse.json({
      success: true,
      auditId: audit.id,
      status: audit.status,
      renamedFileName,
      storagePath,
      message: 'Upload stored and queued for processing.',
    }, { status: 201 });
  } catch (error) {
    console.error('Upload API error:', error);
    if (storagePath) {
      try {
        await createServerClient().storage.from(BUCKET_NAME).remove([storagePath]);
      } catch (cleanupError) {
        console.error('Could not remove orphaned storage object:', cleanupError);
      }
    }
    return NextResponse.json({ error: error.message || 'Upload failed.' }, { status: 500 });
  }
}
