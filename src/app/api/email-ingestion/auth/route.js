/**
 * /api/email-ingestion/auth — Gmail OAuth setup
 *
 * Step 1: GET /api/email-ingestion/auth?step=1
 *   Returns authorization URL to visit
 *
 * Step 2: GET /api/email-ingestion/auth?step=2&code=...&state=...
 *   Exchanges auth code for refresh token
 *   Admin should add GMAIL_REFRESH_TOKEN to .env
 */

import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { requireAuth } from '@/middleware/auth';

const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  process.env.NEXTAUTH_URL || 'http://localhost:3000' + '/api/email-ingestion/auth'
);

/**
 * GET /api/email-ingestion/auth?step=1
 * Returns authorization URL
 */
async function handleStep1(request) {
  // OAuth flow is public, no auth required
  // const auth = await requireAuth(request);
  // if (auth.response) return auth.response;

  if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET) {
    return NextResponse.json(
      { error: 'Gmail OAuth credentials not configured in environment' },
      { status: 503 }
    );
  }

  // Generate authorization URL
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify', // For marking as processed
    ],
    prompt: 'consent', // Force consent screen to get refresh token
  });

  return NextResponse.json({
    step: 1,
    authUrl,
    message: 'Visit this URL to authorize Gmail access',
    nextStep: 'After authorizing, you will be redirected. Visit /api/email-ingestion/auth?step=2&code=<CODE>',
  });
}

/**
 * GET /api/email-ingestion/auth?step=2&code=...&state=...
 * Exchanges auth code for refresh token
 */
async function handleStep2(request) {
  // OAuth flow is public, no auth required
  // const auth = await requireAuth(request);
  // if (auth.response) return auth.response;

  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.json(
      { error: `Authorization failed: ${error}` },
      { status: 400 }
    );
  }

  if (!code) {
    return NextResponse.json(
      { error: 'Missing authorization code' },
      { status: 400 }
    );
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      return NextResponse.json(
        {
          error: 'No refresh token received',
          message: 'Make sure to include prompt=consent in the authorization request',
          accessToken: tokens.access_token,
        },
        { status: 400 }
      );
    }

    // Success! Return the refresh token
    return NextResponse.json({
      step: 2,
      success: true,
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
      expiresIn: tokens.expiry_date,
      message: 'OAuth authorization successful',
      nextSteps: [
        '1. Copy the refreshToken value below',
        '2. Add to your .env file: GMAIL_REFRESH_TOKEN=<VALUE>',
        '3. Restart the application',
        '4. Email ingestion will now be enabled',
      ],
    });
  } catch (err) {
    console.error('OAuth token exchange error:', err.message);
    return NextResponse.json(
      { error: `Token exchange failed: ${err.message}` },
      { status: 500 }
    );
  }
}

/**
 * GET /api/email-ingestion/auth
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const step = searchParams.get('step') || '1';
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  // If Google sent back a code or error, it's the OAuth callback (step 2)
  if (code || error) {
    return handleStep2(request);
  }

  if (step === '1') {
    return handleStep1(request);
  } else if (step === '2') {
    return handleStep2(request);
  } else {
    return NextResponse.json(
      { error: 'Invalid step parameter' },
      { status: 400 }
    );
  }
}

/**
 * POST /api/email-ingestion/auth
 * Not used in basic flow
 */
export async function POST(request) {
  return NextResponse.json({ error: 'Use GET for OAuth flow' }, { status: 405 });
}
