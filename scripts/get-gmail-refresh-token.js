#!/usr/bin/env node

/**
 * Gmail OAuth2 Refresh Token Generator
 * Run this once to get the refresh token for virata.operations@gmail.com
 *
 * Usage:
 *   node scripts/get-gmail-refresh-token.js
 *
 * This will:
 * 1. Open a browser for Google login
 * 2. Ask for permissions
 * 3. Print the refresh token
 * 4. Save credentials to .env.local
 */

import { google } from 'googleapis';
import { open } from 'open';
import * as fs from 'fs';
import * as path from 'path';
import readline from 'readline';

const CLIENT_ID = process.env.GMAIL_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET || '';
const REDIRECT_URI = 'http://localhost:3000/api/auth/google/callback';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function main() {
  console.log('\n📧 Gmail OAuth2 Refresh Token Generator\n');

  // Check if credentials are available
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.log(
      '⚠️  ERROR: Missing Gmail API credentials\n' +
      'You need to:\n' +
      '1. Go to https://console.cloud.google.com/\n' +
      '2. Create a new project: "Virata Reports Automation"\n' +
      '3. Enable Gmail API\n' +
      '4. Create OAuth 2.0 credentials (Desktop app)\n' +
      '5. Download JSON and extract:\n' +
      '   - client_id\n' +
      '   - client_secret\n' +
      '6. Set as environment variables:\n' +
      '   GMAIL_CLIENT_ID=<your_id>\n' +
      '   GMAIL_CLIENT_SECRET=<your_secret>\n'
    );
    process.exit(1);
  }

  // Create OAuth2 client
  const oauth2Client = new google.auth.OAuth2(
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT_URI
  );

  // Generate auth URL
  const scopes = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.modify',
  ];

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent', // Force consent screen to get refresh token
  });

  console.log('🔗 Opening browser for Google login...\n');
  console.log('If browser doesn\'t open, visit this URL:\n');
  console.log(`${authUrl}\n`);

  // Try to open browser
  try {
    await open(authUrl);
  } catch (err) {
    console.log('⚠️  Could not open browser automatically');
  }

  // Wait for user to complete auth
  console.log(
    '📝 After you authorize, Google will redirect to a localhost URL.\n' +
    'Copy the full URL from your browser address bar and paste it here:\n'
  );

  const redirectUrl = await question('\n🔗 Paste the redirect URL: ');

  // Extract auth code from URL
  let authCode;
  try {
    const url = new URL(redirectUrl);
    authCode = url.searchParams.get('code');

    if (!authCode) {
      throw new Error('No authorization code found');
    }
  } catch (error) {
    console.error('\n❌ Invalid URL. Could not extract authorization code.');
    process.exit(1);
  }

  console.log('\n✓ Authorization code received\n');

  // Exchange code for tokens
  try {
    console.log('🔄 Exchanging code for tokens...\n');
    const { tokens } = await oauth2Client.getToken(authCode);

    const refreshToken = tokens.refresh_token;

    if (!refreshToken) {
      console.error(
        '❌ Failed to get refresh token. This usually means:\n' +
        '   - You didn\'t click "Allow" in the consent screen\n' +
        '   - Or the app was already authorized before\n' +
        '\n' +
        'Try:\n' +
        '1. Go to https://myaccount.google.com/permissions\n' +
        '2. Find "Virata Reports Automation" and remove it\n' +
        '3. Run this script again\n'
      );
      process.exit(1);
    }

    console.log('✅ Tokens received!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📋 Your Refresh Token:\n');
    console.log(refreshToken);
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Ask to save to .env.local
    const save = await question('Save to .env.local? (y/n): ');

    if (save.toLowerCase() === 'y') {
      const envLocalPath = path.join(process.cwd(), '.env.local');
      let envContent = '';

      // Read existing .env.local if it exists
      if (fs.existsSync(envLocalPath)) {
        envContent = fs.readFileSync(envLocalPath, 'utf-8');
      }

      // Update or add Gmail variables
      const gmailVars = {
        GMAIL_CLIENT_ID: CLIENT_ID,
        GMAIL_CLIENT_SECRET: CLIENT_SECRET,
        GMAIL_REFRESH_TOKEN: refreshToken,
        GMAIL_REDIRECT_URI: REDIRECT_URI,
      };

      // Parse existing variables
      const lines = envContent.split('\n');
      const updated = new Set();

      const newLines = lines
        .map((line) => {
          for (const [key, value] of Object.entries(gmailVars)) {
            if (line.startsWith(`${key}=`)) {
              updated.add(key);
              return `${key}=${value}`;
            }
          }
          return line;
        })
        .filter((line) => line.trim()); // Remove empty lines

      // Add missing variables
      for (const [key, value] of Object.entries(gmailVars)) {
        if (!updated.has(key)) {
          newLines.push(`${key}=${value}`);
        }
      }

      // Write to file
      fs.writeFileSync(envLocalPath, newLines.join('\n') + '\n');

      console.log(`✅ Saved to .env.local\n`);
      console.log('Next steps:');
      console.log('1. Run: npm run build');
      console.log('2. Run database migrations (see GMAIL_AUTOMATION_SETUP.md)');
      console.log('3. Test: curl http://localhost:3000/api/reports/auto-upload/status?action=health\n');
    } else {
      console.log(
        '\nManually add to .env.local:\n' +
        `GMAIL_CLIENT_ID=${CLIENT_ID}\n` +
        `GMAIL_CLIENT_SECRET=${CLIENT_SECRET}\n` +
        `GMAIL_REFRESH_TOKEN=${refreshToken}\n` +
        `GMAIL_REDIRECT_URI=${REDIRECT_URI}\n`
      );
    }
  } catch (error) {
    console.error('❌ Error getting tokens:', error.message);
    process.exit(1);
  }

  rl.close();
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
