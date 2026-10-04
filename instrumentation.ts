/**
 * Next.js instrumentation - Runs on server startup
 * Initialize email ingestion scheduler
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startEmailIngestionScheduler } = await import('@/lib/scheduler');
    startEmailIngestionScheduler();
  }
}
