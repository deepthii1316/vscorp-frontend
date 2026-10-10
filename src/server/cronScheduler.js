/**
 * Cron Job Scheduler for Daily Auto-Upload
 * This runs the automation job on a daily schedule
 *
 * Usage:
 *   Import in your server startup file and call initializeCronJobs()
 *   or run: node src/server/cronScheduler.js
 */

import cron from 'node-cron';
import { runDailyAutoUpload, healthCheck } from '../jobs/dailyAutoUpload.js';
import { getGmailClient } from '../lib/gmail/gmailServiceFactory.js';

let cronJob = null;

/**
 * Initialize cron jobs
 * Starts the daily auto-upload at configured time
 */
export async function initializeCronJobs() {
  const schedule = process.env.AUTO_UPLOAD_SCHEDULE || '0 6 * * *'; // Default: 6 AM daily

  console.log(`⏰ Initializing cron scheduler: ${schedule}`);

  // Daily auto-upload job
  cronJob = cron.schedule(schedule, async () => {
    console.log('\n🔔 [CRON] Running scheduled auto-upload job...');
    const startTime = new Date();

    try {
      const gmailAuth = await getGmailClient();

      if (!gmailAuth) {
        console.error('❌ [CRON] Gmail authentication failed');
        return;
      }

      const result = await runDailyAutoUpload(gmailAuth);

      const duration = new Date() - startTime;
      console.log(`\n✅ [CRON] Job completed in ${duration}ms`);
      console.log(`📊 Summary:`);
      console.log(`   Uploaded: ${result.summary?.uploaded || 0}`);
      console.log(`   Skipped: ${result.summary?.skipped || 0}`);
      console.log(`   Failed: ${result.summary?.failed || 0}`);

      if (result.errors && result.errors.length > 0) {
        console.warn('⚠️  Errors encountered:');
        result.errors.forEach(err => console.warn(`   - ${err.type}: ${err.error}`));
      }
    } catch (error) {
      console.error('❌ [CRON] Job failed:', error.message);
    }
  });

  console.log('✓ Cron scheduler initialized');
  return cronJob;
}

/**
 * Stop the cron job
 */
export function stopCronJobs() {
  if (cronJob) {
    cronJob.stop();
    console.log('⏹ Cron scheduler stopped');
  }
}

/**
 * Get cron job status
 */
export function getCronStatus() {
  return {
    active: cronJob ? !cronJob._destroyed : false,
    schedule: process.env.AUTO_UPLOAD_SCHEDULE || '0 6 * * *',
  };
}

/**
 * Manual trigger (for testing)
 */
export async function triggerManualUpload() {
  console.log('🚀 Manually triggering auto-upload job...');

  try {
    const gmailAuth = await getGmailClient();

    if (!gmailAuth) {
      throw new Error('Gmail authentication failed');
    }

    const result = await runDailyAutoUpload(gmailAuth);
    return {
      success: true,
      result,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Run as standalone script
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🚀 Starting cron scheduler in standalone mode\n');

  await initializeCronJobs();

  // Keep process alive
  console.log('📌 Scheduler running. Press Ctrl+C to stop.\n');
  process.on('SIGINT', () => {
    console.log('\n\n⏹ Shutting down...');
    stopCronJobs();
    process.exit(0);
  });
}

export default {
  initializeCronJobs,
  stopCronJobs,
  getCronStatus,
  triggerManualUpload,
};
