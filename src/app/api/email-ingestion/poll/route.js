/**
 * /api/email-ingestion/poll — Email ingestion orchestrator
 *
 * Runs every 5 minutes (or on manual trigger)
 * 1. Finds unread report emails
 * 2. Downloads attachments
 * 3. Classifies each attachment
 * 4. Validates structure
 * 5. Ingests via existing pipeline
 * 6. Records success/failure
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireAuth } from '@/middleware/auth';
import crypto from 'crypto';

// Email service imports
import {
  initGmailAuth,
  findReportEmails,
  getMessageAttachments,
  saveAttachmentToTemp,
  deleteTempFile,
} from '@/lib/gmail/gmailService';
import { classifyReport } from '@/lib/email/reportClassifier';
import { validateReport, getValidationSummary } from '@/lib/email/reportValidator';

// Utilities
import { hashFile } from '@/lib/hashFile';

// Try to initialize Gmail (will fail gracefully if not configured)
let gmailConfigured = false;
try {
  initGmailAuth();
  gmailConfigured = true;
  console.log('[EMAIL-INGESTION] Gmail OAuth initialized');
} catch (err) {
  console.warn('[EMAIL-INGESTION] Gmail not configured:', err.message);
}

/**
 * Calculate SHA-256 hash of a file
 */
async function calculateFileHash(filepath) {
  const fs = await import('fs').then(m => m.promises);
  const buffer = await fs.readFile(filepath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * POST /api/email-ingestion/poll
 * Manually trigger email ingestion (requires authentication)
 */
export async function POST(request) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;

  if (!gmailConfigured) {
    return NextResponse.json(
      { error: 'Email ingestion is not configured. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN.' },
      { status: 503 }
    );
  }

  console.log('[EMAIL-INGESTION] Manual poll triggered by admin');

  try {
    const result = await performEmailIngestion();
    return NextResponse.json(result);
  } catch (err) {
    console.error('[EMAIL-INGESTION] Fatal error:', err.message);
    return NextResponse.json(
      { error: err.message, success: false },
      { status: 500 }
    );
  }
}

/**
 * GET /api/email-ingestion/poll?manual=true
 * Also allow GET for manual testing
 */
export async function GET(request) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;

  const { searchParams } = new URL(request.url);
  const manual = searchParams.get('manual') === 'true';

  if (!gmailConfigured) {
    return NextResponse.json(
      { error: 'Email ingestion not configured', success: false },
      { status: 503 }
    );
  }

  console.log('[EMAIL-INGESTION] Poll triggered (manual=' + manual + ')');

  try {
    const result = await performEmailIngestion();
    return NextResponse.json(result);
  } catch (err) {
    console.error('[EMAIL-INGESTION] Error:', err.message);
    return NextResponse.json(
      { error: err.message, success: false },
      { status: 500 }
    );
  }
}

/**
 * Main email ingestion workflow
 * Exported for use by scheduler and API routes
 */
export async function performEmailIngestion() {
  const supabase = createServerClient();
  const results = {
    success: true,
    emailsFound: 0,
    attachmentsProcessed: 0,
    attachmentsIngested: 0,
    attachmentsFailed: 0,
    attachmentsDuplicate: 0,
    attachmentsUnknown: 0,
    messages: [],
    errors: [],
  };

  try {
    console.log('[EMAIL-INGESTION] Step 1: Finding report emails...');
    const emails = await findReportEmails();
    results.emailsFound = emails.length;
    console.log(`[EMAIL-INGESTION] Found ${emails.length} email(s)`);

    if (emails.length === 0) {
      results.messages.push('No new report emails found');
      return results;
    }

    // Process each email
    for (const email of emails) {
      console.log(`\n[EMAIL-INGESTION] Processing email: ${email.subject}`);

      try {
        const attachments = await getMessageAttachments(email.id);
        console.log(`[EMAIL-INGESTION]   Found ${attachments.length} attachment(s)`);

        // Process each attachment
        for (const attachment of attachments) {
          results.attachmentsProcessed += 1;

          try {
            await processAttachment(
              supabase,
              email,
              attachment,
              results
            );
          } catch (err) {
            console.error(`[EMAIL-INGESTION] Attachment error: ${err.message}`);
            results.attachmentsFailed += 1;
            results.errors.push(`${attachment.filename}: ${err.message}`);
          }
        }
      } catch (err) {
        console.error(`[EMAIL-INGESTION] Email error: ${err.message}`);
        results.errors.push(`Email "${email.subject}": ${err.message}`);
      }
    }

    // Update ingestion state
    if (emails.length > 0) {
      const lastEmail = emails[0];
      await supabase.rpc('update_email_ingestion_state', {
        p_last_message_id: lastEmail.id,
        p_checked_at: new Date().toISOString(),
      });
    }

    return results;
  } catch (err) {
    results.success = false;
    results.errors.push(err.message);
    return results;
  }
}

/**
 * Process a single attachment
 */
async function processAttachment(supabase, email, attachment, results) {
  let tmpPath = null;

  try {
    const emailDate = new Date(parseInt(email.internalDate)).toISOString();
    console.log(`\n[EMAIL-INGESTION] Processing attachment: ${attachment.filename}`);

    // Step 1: Save to temp file
    tmpPath = await saveAttachmentToTemp(attachment.filename, attachment.data);
    console.log(`[EMAIL-INGESTION]   Saved to: ${tmpPath}`);

    // Step 2: Calculate hash
    const fileHash = await calculateFileHash(tmpPath);
    console.log(`[EMAIL-INGESTION]   Hash: ${fileHash.substring(0, 16)}...`);

    // Step 3: Classify report
    const classification = await classifyReport(tmpPath, attachment.filename);
    console.log(`[EMAIL-INGESTION]   Classification: ${classification.reportType} (${(classification.confidence * 100).toFixed(0)}%)`);

    // Email ingestion whitelist: only process these three report types
    const ALLOWED_EMAIL_TYPES = ['sales', 'account_dsr', 'inventory'];

    if (classification.reportType === 'unknown' || !ALLOWED_EMAIL_TYPES.includes(classification.reportType)) {
      results.attachmentsUnknown += 1;

      // Record as unknown
      await supabase.from('email_attachment_audit').insert({
        email_message_id: email.id,
        email_attachment_id: attachment.id,
        email_received_at: emailDate,
        email_sender: email.from,
        email_subject: email.subject,
        attachment_filename: attachment.filename,
        file_hash: fileHash,
        detected_report_type: classification.reportType,
        classification_confidence: classification.confidence,
        classification_method: classification.method,
        classification_details: classification.details,
        validation_status: 'skipped',
        processing_status: 'skipped',
      });

      console.log(`[EMAIL-INGESTION]   ⚠ SKIPPED - Not in allowed types (${classification.reportType})`);
      results.messages.push(`${attachment.filename}: Skipped - type not in whitelist for email ingestion`);
      return;
    }

    // Step 4: Validate report (optional - skip if classification is confident)
    let validation = null;
    let skipValidation = false;

    if (classification.confidence >= 0.85) {
      // Highly confident classification - skip strict validation
      console.log(`[EMAIL-INGESTION]   Skipping validation (high confidence: ${(classification.confidence * 100).toFixed(0)}%)`);
      skipValidation = true;
      validation = { isValid: true, dataRowCount: 0, headerCount: 0, requiredHeadersFound: 0, requiredHeadersExpected: 0, errors: [] };
    } else {
      validation = await validateReport(tmpPath, classification.reportType);
      console.log(`[EMAIL-INGESTION]   Validation: ${validation.isValid ? 'PASS ✓' : 'FAIL ✗'}`);
      console.log(getValidationSummary(validation, attachment.filename).split('\n').map(l => `[EMAIL-INGESTION]     ${l}`).join('\n'));

      if (!validation.isValid) {
        results.attachmentsFailed += 1;

        // Record as failed validation
        const errorMsg = validation.errors.join('; ');
        await supabase.from('email_attachment_audit').insert({
          email_message_id: email.id,
          email_attachment_id: attachment.id,
          email_received_at: emailDate,
          email_sender: email.from,
          email_subject: email.subject,
          attachment_filename: attachment.filename,
          file_hash: fileHash,
          detected_report_type: classification.reportType,
          classification_confidence: classification.confidence,
          validation_status: 'invalid',
          processing_status: 'failed',
          processing_error: errorMsg,
          required_headers_found: validation.requiredHeadersFound,
          required_headers_expected: validation.requiredHeadersExpected,
        });

        console.log(`[EMAIL-INGESTION]   ✗ VALIDATION FAILED`);
        results.messages.push(`${attachment.filename}: Validation failed - ${errorMsg}`);
        return;
      }
    }

    // Step 5: Check for duplicate
    const { data: existing } = await supabase
      .from('upload_audit_log')
      .select('id, renamed_file_name, status')
      .eq('file_sha256', fileHash)
      .maybeSingle();

    if (existing) {
      results.attachmentsDuplicate += 1;

      // Record as duplicate
      await supabase.from('email_attachment_audit').insert({
        email_message_id: email.id,
        email_attachment_id: attachment.id,
        email_received_at: emailDate,
        email_sender: email.from,
        email_subject: email.subject,
        attachment_filename: attachment.filename,
        file_hash: fileHash,
        upload_audit_id: existing.id,
        detected_report_type: classification.reportType,
        classification_confidence: classification.confidence,
        validation_status: 'valid',
        processing_status: 'duplicate',
      });

      console.log(`[EMAIL-INGESTION]   ⚠ DUPLICATE - Skipped (previously: ${existing.renamed_file_name})`);
      results.messages.push(`${attachment.filename}: Duplicate file (matches ${existing.renamed_file_name})`);
      return;
    }

    // Step 6: Ingest via existing pipeline
    console.log(`[EMAIL-INGESTION]   Calling database ingest function...`);
    const { data: ingestionResult, error: ingestionError } = await supabase.rpc(
      'ingest_email_attachment',
      {
        p_email_message_id: email.id,
        p_email_attachment_id: attachment.id,
        p_filename: attachment.filename,
        p_file_hash: fileHash,
        p_report_type: classification.reportType,
        p_sender: email.from,
        p_subject: email.subject,
        p_received_at: emailDate,
      }
    );

    if (ingestionError || !ingestionResult || ingestionResult.length === 0) {
      results.attachmentsFailed += 1;
      const errorMsg = ingestionError?.message || 'Unknown error';
      console.error(`[EMAIL-INGESTION]   ✗ INGEST ERROR: ${errorMsg}`);
      results.errors.push(`${attachment.filename}: ${errorMsg}`);
      return;
    }

    const ingestionData = ingestionResult[0];
    if (ingestionData.status === 'duplicate') {
      results.attachmentsDuplicate += 1;
      console.log(`[EMAIL-INGESTION]   ⚠ DUPLICATE (by hash)`);
      results.messages.push(`${attachment.filename}: Duplicate detected in database`);
      return;
    }

    if (ingestionData.status === 'error' || ingestionData.status === 'failed') {
      results.attachmentsFailed += 1;
      console.error(`[EMAIL-INGESTION]   ✗ INGEST FAILED: ${ingestionData.error_message}`);
      results.errors.push(`${attachment.filename}: ${ingestionData.error_message}`);
      return;
    }

    // Success!
    results.attachmentsIngested += 1;
    console.log(`[EMAIL-INGESTION]   ✓ QUEUED FOR PROCESSING`);
    console.log(`[EMAIL-INGESTION]     Upload ID: ${ingestionData.upload_audit_id}`);
    results.messages.push(`${attachment.filename}: Queued for processing (${classification.reportType})`);

  } finally {
    // Clean up temp file
    if (tmpPath) {
      try {
        await deleteTempFile(tmpPath);
      } catch (err) {
        console.warn('[EMAIL-INGESTION] Could not delete temp file:', err.message);
      }
    }
  }
}
