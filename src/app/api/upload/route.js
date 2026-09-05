import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { generateFileName, getStoragePath, BUCKET_NAME } from '@/lib/fileRename';

// export const dynamic = 'force-dynamic';


export async function POST(request) {
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

    if (auditError) {
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
