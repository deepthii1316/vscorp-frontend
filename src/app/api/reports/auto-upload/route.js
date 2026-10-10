/**
 * Auto-Upload API Endpoint
 * POST /api/reports/auto-upload - Trigger daily upload job
 * GET /api/reports/auto-upload/status - Check job status
 * GET /api/reports/auto-upload/health - Health check
 */

import { NextResponse } from 'next/server';
import { requireAuth } from '@/middleware/auth';
import { runDailyAutoUpload, healthCheck } from '@/jobs/dailyAutoUpload';
import {
  checkDuplicateUpload,
  getTodayUploadStats,
} from '@/lib/deduplicationService';
import { getGmailClient } from '@/lib/gmail/gmailServiceFactory';

export const dynamic = 'force-dynamic';

/**
 * POST /api/reports/auto-upload
 * Trigger the daily auto-upload job manually
 * Authorization: admin only
 */
export async function POST(request) {
  try {
    // Require admin authorization
    const auth = await requireAuth(request, ['admin']);
    if (auth.response) return auth.response;

    // Initialize Gmail client
    const gmailAuth = await getGmailClient();
    if (!gmailAuth) {
      return NextResponse.json(
        {
          success: false,
          error: 'Gmail authentication failed',
          message: 'Please configure Gmail API credentials',
        },
        { status: 503 }
      );
    }

    // Run the job
    const jobResult = await runDailyAutoUpload(gmailAuth);

    // Return results
    return NextResponse.json(
      {
        success: true,
        job: jobResult.summary,
        details: {
          uploaded: jobResult.uploadedFiles,
          skipped: jobResult.skippedDuplicates,
          failed: jobResult.failedUploads,
        },
        duration: `${jobResult.duration}ms`,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Auto-upload job error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/reports/auto-upload/status
 * Get upload status for today
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    // Health check endpoint (no auth required)
    if (action === 'health') {
      try {
        const gmailAuth = await getGmailClient();
        const health = await healthCheck(gmailAuth);
        return NextResponse.json(health, { status: health.healthy ? 200 : 503 });
      } catch (error) {
        return NextResponse.json(
          {
            healthy: false,
            error: error.message,
          },
          { status: 503 }
        );
      }
    }

    // Status endpoint (requires auth)
    const auth = await requireAuth(request, ['admin', 'manager']);
    if (auth.response) return auth.response;

    if (action === 'status') {
      // Get today's stats
      const stats = await getTodayUploadStats('gmail_automation');
      return NextResponse.json(
        {
          success: true,
          stats,
          message: `${stats.successful} uploaded, ${stats.failed} failed today`,
        },
        { status: 200 }
      );
    }

    // List recent auto-uploads
    return NextResponse.json(
      {
        success: true,
        message: 'Use ?action=status for today stats or ?action=health for health check',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Status check error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/reports/auto-upload
 * Update auto-upload settings
 */
export async function PUT(request) {
  try {
    const auth = await requireAuth(request, ['admin']);
    if (auth.response) return auth.response;

    const body = await request.json();

    // TODO: Store settings in database
    // - enabled: boolean
    // - schedule: cron expression
    // - emailAddress: string
    // - notificationEmail: string
    // etc.

    return NextResponse.json(
      {
        success: true,
        message: 'Settings updated (implementation pending)',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Settings update error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
