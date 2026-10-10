/**
 * Email ingestion scheduler
 * Runs once per day at 2:00 AM (can be configured)
 */

import cron from 'node-cron';
import { performEmailIngestion } from '@/app/api/email-ingestion/poll/route';

let scheduledTask = null;

/**
 * Start email ingestion scheduler
 * Runs daily at 2:00 AM
 */
export function startEmailIngestionScheduler() {
  if (scheduledTask) {
    console.log('[SCHEDULER] Email ingestion already scheduled');
    return;
  }

  // Run every day at 2:00 AM
  scheduledTask = cron.schedule('0 2 * * *', async () => {
    console.log('[SCHEDULER] Starting scheduled email ingestion...');
    try {
      const result = await performEmailIngestion();
      console.log('[SCHEDULER] ✓ Ingestion complete:', {
        emailsFound: result.emailsFound,
        attachmentsProcessed: result.attachmentsProcessed,
        attachmentsIngested: result.attachmentsIngested,
        attachmentsFailed: result.attachmentsFailed,
      });
    } catch (err) {
      console.error('[SCHEDULER] ✗ Ingestion failed:', err.message);
    }
  });

  console.log('[SCHEDULER] Email ingestion scheduled for 2:00 AM daily');
}

/**
 * Stop scheduler (for cleanup)
 */
export function stopEmailIngestionScheduler() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log('[SCHEDULER] Email ingestion scheduler stopped');
  }
}
