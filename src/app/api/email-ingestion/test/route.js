/**
 * /api/email-ingestion/test — Testing & Debugging Endpoint
 *
 * Allows testing without real Gmail inbox
 * WARNING: Development/debugging only - remove in production
 */

import { NextResponse } from 'next/server';
import { requireAuth } from '@/middleware/auth';
import { createServerClient } from '@/lib/supabase';

/**
 * GET /api/email-ingestion/test?action=STATUS|CONFIG|LAST_POLL|OAUTH_INFO
 */
export async function GET(request) {
  // Test endpoints are public for debugging
  // const auth = await requireAuth(request);
  // if (auth.response) return auth.response;

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'STATUS';

  const supabase = createServerClient();

  try {
    switch (action.toUpperCase()) {
      case 'STATUS':
        return getIngestionStatus(supabase);

      case 'CONFIG':
        return getConfiguration();

      case 'LAST_POLL':
        return getLastPoll(supabase);

      case 'OAUTH_INFO':
        return getOAuthInfo();

      case 'STATS':
        return getStatistics(supabase);

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (err) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}

/**
 * Get current ingestion status
 */
async function getIngestionStatus(supabase) {
  const { data: state, error: stateError } = await supabase
    .from('email_ingestion_state')
    .select('*')
    .eq('id', 'gmail_default')
    .single();

  if (stateError) {
    return NextResponse.json(
      { error: 'No ingestion state found (migration may not be applied)' },
      { status: 500 }
    );
  }

  const { data: attachments, error: attachError } = await supabase
    .from('email_attachment_audit')
    .select('processing_status, COUNT(*)')
    .group_by('processing_status');

  const statusCounts = {};
  if (!attachError && attachments) {
    attachments.forEach(row => {
      statusCounts[row.processing_status] = row.count;
    });
  }

  return NextResponse.json({
    enabled: state.enabled,
    lastChecked: state.last_checked_at,
    pollInterval: state.poll_interval_minutes,
    lastProcessedMessage: state.last_processed_message_id,
    statusCounts,
    timestampNow: new Date().toISOString(),
  });
}

/**
 * Get configuration summary (safe values only)
 */
function getConfiguration() {
  const config = {
    gmailConfigured: !!(
      process.env.GMAIL_CLIENT_ID &&
      process.env.GMAIL_CLIENT_SECRET &&
      process.env.GMAIL_REFRESH_TOKEN
    ),
    emailIngestionEnabled: process.env.EMAIL_INGESTION_ENABLED !== 'false',
    pollIntervalMinutes: process.env.EMAIL_INGESTION_POLL_INTERVAL_MINUTES || 5,
    labelsToCheck: process.env.GMAIL_LABELS_TO_CHECK || 'INBOX',
    fromPatternConfigured: !!process.env.REPORT_EMAIL_FROM_PATTERN,
    subjectPatternConfigured: !!process.env.REPORT_EMAIL_SUBJECT_PATTERN,
    environment: process.env.NODE_ENV,
  };

  return NextResponse.json(config);
}

/**
 * Get last poll timestamp and results
 */
async function getLastPoll(supabase) {
  const { data: state } = await supabase
    .from('email_ingestion_state')
    .select('last_checked_at')
    .eq('id', 'gmail_default')
    .single();

  const { data: recentAttachments } = await supabase
    .from('email_attachment_audit')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  return NextResponse.json({
    lastPolledAt: state?.last_checked_at,
    recentAttachments: (recentAttachments || []).map(a => ({
      filename: a.attachment_filename,
      status: a.processing_status,
      type: a.detected_report_type,
      confidence: a.classification_confidence,
      timestamp: a.created_at,
      error: a.processing_error,
    })),
  });
}

/**
 * Get OAuth configuration status
 */
function getOAuthInfo() {
  const hasClientId = !!process.env.GMAIL_CLIENT_ID;
  const hasClientSecret = !!process.env.GMAIL_CLIENT_SECRET;
  const hasRefreshToken = !!process.env.GMAIL_REFRESH_TOKEN;

  return NextResponse.json({
    status: hasClientId && hasClientSecret && hasRefreshToken ? 'configured' : 'incomplete',
    clientIdConfigured: hasClientId,
    clientSecretConfigured: hasClientSecret,
    refreshTokenConfigured: hasRefreshToken,
    setupSteps: [
      '1. Visit: /api/email-ingestion/auth?step=1',
      '2. Authorize Google account',
      '3. Copy refreshToken from step 2',
      '4. Add to .env.local: GMAIL_REFRESH_TOKEN=<token>',
      '5. Restart server',
    ],
    oauthLink: '/api/email-ingestion/auth?step=1',
  });
}

/**
 * Get ingestion statistics
 */
async function getStatistics(supabase) {
  // Count by status
  const { data: statusStats } = await supabase.from('email_attachment_audit').select('processing_status', { count: 'exact' });

  // Count by type
  const { data: typeStats } = await supabase.from('email_attachment_audit').select('detected_report_type', { count: 'exact' });

  // Recent activity
  const { data: recentActivity } = await supabase
    .from('email_attachment_audit')
    .select('created_at, processing_status')
    .order('created_at', { ascending: false })
    .limit(100);

  // Calculate stats
  const stats = {
    totalAttachments: statusStats?.length || 0,
    byStatus: {},
    byType: {},
    successRate: 0,
    averageTimeToProcess: 0,
    last24Hours: 0,
    last7Days: 0,
  };

  if (recentActivity) {
    const now = new Date();
    const day = 24 * 60 * 60 * 1000;

    stats.last24Hours = recentActivity.filter(
      a => new Date(a.created_at).getTime() > now.getTime() - day
    ).length;

    stats.last7Days = recentActivity.filter(
      a => new Date(a.created_at).getTime() > now.getTime() - 7 * day
    ).length;
  }

  return NextResponse.json(stats);
}

/**
 * POST /api/email-ingestion/test?action=SIMULATE
 * Simulate ingestion without real Gmail (for testing)
 */
export async function POST(request) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'HELP';

  if (action.toUpperCase() !== 'SIMULATE') {
    return NextResponse.json(
      {
        error: 'Only SIMULATE action supported for POST',
        usage: 'POST /api/email-ingestion/test?action=SIMULATE',
        body: {
          simulationType: 'success|failure|duplicate|unknown',
          reportType: 'sales|account_dsr|inventory',
          attachmentCount: 1,
        },
      },
      { status: 400 }
    );
  }

  const body = await request.json();

  return NextResponse.json({
    message: 'Email ingestion simulation recorded',
    note: 'This is for testing UI only. Does not process real files.',
    simulated: body,
  });
}
