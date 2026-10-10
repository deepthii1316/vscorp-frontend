/**
 * Daily Auto-Upload Job
 * Runs daily to fetch reports from virata.operations@gmail.com and upload them
 * This is triggered by a Cloud Scheduler or similar cron service
 */

import { fetchDailyReports } from '@/lib/gmail/automationService';
import {
  checkDuplicateUpload,
  recordUpload,
  recordFailedUpload,
} from '@/lib/deduplicationService';
import { uploadReportToStorage } from '@/lib/reportStorage';
import { createServerClient } from '@/lib/supabase';

/**
 * Main job function - runs daily
 * @param {Object} gmailAuth - Authenticated Gmail client
 * @returns {Promise<Object>} Job result summary
 */
export async function runDailyAutoUpload(gmailAuth) {
  const jobResult = {
    startTime: new Date(),
    uploadedFiles: [],
    skippedDuplicates: [],
    failedUploads: [],
    errors: [],
  };

  try {
    console.log('🟢 Starting daily auto-upload job...');

    // Step 1: Fetch reports from Gmail
    const { reports, errors: fetchErrors } = await fetchDailyReports(gmailAuth, {
      maxEmails: 10,
      labelProcessed: 'AutoProcessed',
    });

    if (fetchErrors && fetchErrors.length > 0) {
      console.warn(`⚠️  Fetch errors: ${fetchErrors.length}`);
      jobResult.errors.push(...fetchErrors);
    }

    if (!reports || reports.length === 0) {
      console.log('ℹ️  No reports to upload');
      jobResult.endTime = new Date();
      return jobResult;
    }

    console.log(`📧 Fetched ${reports.length} reports from Gmail`);

    // Step 2: Process each report
    for (const report of reports) {
      try {
        // Check for duplicates
        const existingUpload = await checkDuplicateUpload(
          report.fileHash,
          'gmail_automation',
          report.emailDate
        );

        if (existingUpload) {
          console.log(`⊘ Duplicate detected: ${report.filename}`);
          jobResult.skippedDuplicates.push({
            filename: report.filename,
            reason: 'Duplicate upload today',
            existingUploadId: existingUpload.id,
          });
          continue;
        }

        // Upload to storage
        const uploadResult = await uploadReportToStorage(report);

        if (!uploadResult.success) {
          throw new Error(uploadResult.error || 'Upload failed');
        }

        // Record in audit log
        const auditRecord = await recordUpload({
          fileHash: report.fileHash,
          filename: report.filename,
          renamedFilename: uploadResult.filename,
          reportType: report.reportType,
          source: 'gmail_automation',
          storagePath: uploadResult.path,
          fileSizeBytes: report.fileBuffer.length,
          uploadedBy: 'system',
          emailDate: report.emailDate,
          emailId: report.messageId,
          rowCount: uploadResult.rowCount,
        });

        console.log(`✓ Uploaded: ${report.filename}`);
        jobResult.uploadedFiles.push({
          filename: report.filename,
          reportType: report.reportType,
          auditId: auditRecord?.id,
          storagePath: uploadResult.path,
        });
      } catch (uploadError) {
        console.error(`✗ Failed to upload ${report.filename}:`, uploadError.message);

        // Record failure
        await recordFailedUpload(
          report.filename,
          report.fileHash,
          uploadError.message,
          'gmail_automation'
        );

        jobResult.failedUploads.push({
          filename: report.filename,
          error: uploadError.message,
        });
      }
    }

    // Step 3: Send summary notification
    const summary = {
      uploaded: jobResult.uploadedFiles.length,
      skipped: jobResult.skippedDuplicates.length,
      failed: jobResult.failedUploads.length,
      total: reports.length,
    };

    console.log(`\n📊 Job Summary:`);
    console.log(`   ✓ Uploaded: ${summary.uploaded}`);
    console.log(`   ⊘ Skipped: ${summary.skipped}`);
    console.log(`   ✗ Failed: ${summary.failed}`);
    console.log(`   Total: ${summary.total}`);

    // Send notification if there are uploads or failures
    if (jobResult.uploadedFiles.length > 0 || jobResult.failedUploads.length > 0) {
      await sendJobNotification(summary, jobResult);
    }

    jobResult.summary = summary;
  } catch (error) {
    console.error('❌ Critical job error:', error.message);
    jobResult.errors.push({
      type: 'job_fatal',
      error: error.message,
    });
  }

  jobResult.endTime = new Date();
  jobResult.duration = jobResult.endTime - jobResult.startTime;

  console.log(`\n🏁 Job completed in ${jobResult.duration}ms`);
  return jobResult;
}

/**
 * Send notification about upload job completion
 * Can be extended to send emails, Slack messages, etc.
 * @param {Object} summary - Upload summary
 * @param {Object} jobResult - Full job result
 */
async function sendJobNotification(summary, jobResult) {
  try {
    // TODO: Implement notification channel
    // Options:
    // - Email to store manager
    // - Slack message to operations channel
    // - Database notification table
    // - Cloud Logging

    console.log('📬 Notification sent (implementation pending)');
  } catch (error) {
    console.error('Notification error:', error.message);
    // Don't fail the job if notification fails
  }
}

/**
 * Health check - verify job can run
 * @param {Object} gmailAuth - Authenticated Gmail client
 * @returns {Promise<Object>} Health status
 */
export async function healthCheck(gmailAuth) {
  const checks = {
    timestamp: new Date(),
    gmailConnected: false,
    databaseConnected: false,
    storageConnected: false,
    errors: [],
  };

  try {
    // Check Gmail connection
    if (!gmailAuth) {
      checks.errors.push('Gmail: Client not initialized. Check GMAIL_* environment variables');
      checks.gmailConnected = false;
    } else {
      try {
        const { data, error } = await gmailAuth.users.messages.list({
          userId: 'me',
          maxResults: 1,
        });
        checks.gmailConnected = !error;
        if (error) checks.errors.push(`Gmail: ${error.message}`);
      } catch (gmailErr) {
        checks.errors.push(`Gmail: ${gmailErr.message}`);
      }
    }

    // Check database connection
    try {
      const supabase = createServerClient();
      const { error: dbError } = await supabase
        .schema('public')
        .from('upload_audit_log')
        .select('count(*)')
        .limit(1);
      checks.databaseConnected = !dbError;
      if (dbError) checks.errors.push(`Database: ${dbError.message}`);
    } catch (dbErr) {
      checks.errors.push(`Database: ${dbErr.message}`);
    }

    // Check storage connection (if implemented)
    checks.storageConnected = true; // Assume connected for now

    checks.healthy =
      checks.gmailConnected && checks.databaseConnected && checks.storageConnected;
  } catch (error) {
    checks.errors.push(`Health check: ${error.message}`);
    checks.healthy = false;
  }

  return checks;
}

export default {
  runDailyAutoUpload,
  healthCheck,
};
