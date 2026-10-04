/**
 * gmailService.js — Gmail API integration for email ingestion
 *
 * Handles OAuth authentication and email fetching from Gmail inbox.
 * Uses server-side credentials (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN)
 */

import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import os from 'os';

let gmailAuth = null;
let gmail = null;

/**
 * Initialize Gmail API client using OAuth refresh token
 */
export function initGmailAuth() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Gmail OAuth credentials not configured. ' +
      'Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN in environment.'
    );
  }

  gmailAuth = new google.auth.OAuth2(clientId, clientSecret);
  gmailAuth.setCredentials({ refresh_token: refreshToken });
  gmail = google.gmail({ version: 'v1', auth: gmailAuth });

  return gmail;
}

/**
 * Get Gmail client (lazily initialize if needed)
 */
export function getGmailClient() {
  if (!gmail) {
    initGmailAuth();
  }
  return gmail;
}

/**
 * Search for unread report emails matching the configured criteria
 * Returns array of email message objects with minimal metadata
 *
 * Supports two modes:
 * 1. Specific sender: GMAIL_REPORT_SENDER (e.g., uppal.reebok@gmail.com) - searches ALL emails from this sender
 * 2. Pattern matching: REPORT_EMAIL_FROM_PATTERN - searches with regex pattern
 */
export async function findReportEmails() {
  const client = getGmailClient();
  const labels = (process.env.GMAIL_LABELS_TO_CHECK || 'INBOX').split(',').map(l => l.trim());
  const specificSender = process.env.GMAIL_REPORT_SENDER; // e.g., uppal.reebok@gmail.com
  const fromPattern = process.env.REPORT_EMAIL_FROM_PATTERN || '.*';
  const subjectPattern = process.env.REPORT_EMAIL_SUBJECT_PATTERN || '.*';

  console.log('[GMAIL] Searching for report emails...');
  console.log(`  Labels: ${labels.join(', ')}`);
  if (specificSender) {
    console.log(`  Specific sender: ${specificSender}`);
  } else {
    console.log(`  From pattern: ${fromPattern}`);
  }
  console.log(`  Subject pattern: ${subjectPattern}`);

  try {
    // Build Gmail search query
    let q = `${labels.map(l => `label:${l}`).join(' OR ')} has:attachment filename:(xlsx OR xls OR csv)`;

    // If specific sender configured, add to query (Gmail API handles sender filtering efficiently)
    if (specificSender) {
      q += ` from:${specificSender}`;
    }

    console.log(`[GMAIL] Query: ${q}`);

    // Get ALL emails matching criteria (use pagination with maxResults)
    const allMessages = [];
    let pageToken = null;
    let pageCount = 0;

    do {
      pageCount++;
      console.log(`[GMAIL] Fetching page ${pageCount}...`);

      const res = await client.users.messages.list({
        userId: 'me',
        q,
        maxResults: 100, // Get 100 per page (max allowed)
        pageToken,
        orderBy: 'newest',
      });

      const messageIds = res.data.messages || [];
      console.log(`[GMAIL]   Page ${pageCount}: Found ${messageIds.length} email(s)`);
      allMessages.push(...messageIds);

      pageToken = res.data.nextPageToken;
    } while (pageToken);

    console.log(`[GMAIL] Total found: ${allMessages.length} email(s) across all pages`);

    // Fetch full message details (headers, attachments)
    const emails = [];
    for (const msgRef of allMessages) {
      try {
        const msgRes = await client.users.messages.get({
          userId: 'me',
          id: msgRef.id,
          format: 'full',
        });

        const msg = msgRes.data;
        const headers = msg.payload.headers || [];
        const from = headers.find(h => h.name === 'From')?.value || '';
        const subject = headers.find(h => h.name === 'Subject')?.value || '';
        const date = headers.find(h => h.name === 'Date')?.value || '';

        // If specific sender configured, only exact match required
        // Otherwise use regex patterns
        let matches = true;
        if (specificSender) {
          matches = from.toLowerCase().includes(specificSender.toLowerCase());
        } else {
          const fromMatches = new RegExp(fromPattern, 'i').test(from);
          const subjectMatches = new RegExp(subjectPattern, 'i').test(subject);
          matches = fromMatches && subjectMatches;
        }

        if (matches) {
          emails.push({
            id: msg.id,
            threadId: msg.threadId,
            from,
            subject,
            date,
            payload: msg.payload,
            internalDate: msg.internalDate,
          });
          console.log(`  ✓ ${subject} (from: ${from.substring(0, 50)})`);
        } else {
          console.log(`  ✗ Skipped: ${subject} (filter mismatch)`);
        }
      } catch (err) {
        console.error(`  Error fetching message ${msgRef.id}:`, err.message);
      }
    }

    return emails;
  } catch (err) {
    console.error('[GMAIL] Search failed:', err.message);
    throw new Error(`Gmail search failed: ${err.message}`);
  }
}

/**
 * Get attachments from a Gmail message
 * Returns array of {id, filename, mimeType, size, data: Buffer}
 */
export async function getMessageAttachments(messageId) {
  const client = getGmailClient();

  try {
    const res = await client.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });

    const msg = res.data;
    const parts = msg.payload.parts || [];
    const attachments = [];

    for (const part of parts) {
      // Check if this part is an attachment
      if (part.filename && part.filename.length > 0) {
        const mimeType = part.mimeType;
        const isExcel = mimeType.includes('spreadsheet') ||
                        mimeType.includes('excel') ||
                        ['application/vnd.ms-excel',
                         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                         'application/vnd.ms-excel.sheet.macroEnabled.12',
                         'text/csv'].includes(mimeType);

        if (!isExcel) {
          console.log(`  Skipping non-Excel attachment: ${part.filename}`);
          continue;
        }

        try {
          // Download attachment data
          const attRes = await client.users.messages.attachments.get({
            userId: 'me',
            messageId,
            id: part.body.attachmentId,
          });

          const data = Buffer.from(attRes.data.data, 'base64');

          attachments.push({
            id: part.body.attachmentId,
            filename: part.filename,
            mimeType,
            size: data.length,
            data,
          });

          console.log(`  ✓ Downloaded: ${part.filename} (${data.length} bytes)`);
        } catch (err) {
          console.error(`  Error downloading attachment ${part.filename}:`, err.message);
        }
      }
    }

    return attachments;
  } catch (err) {
    console.error(`[GMAIL] Failed to get attachments for message ${messageId}:`, err.message);
    throw err;
  }
}

/**
 * Save attachment buffer to temporary file
 * Returns filepath
 */
export async function saveAttachmentToTemp(filename, buffer) {
  const tmpDir = os.tmpdir();
  const tmpFile = path.join(tmpDir, `email-attachment-${Date.now()}-${filename}`);

  return new Promise((resolve, reject) => {
    fs.writeFile(tmpFile, buffer, (err) => {
      if (err) reject(err);
      else resolve(tmpFile);
    });
  });
}

/**
 * Delete temporary file
 */
export async function deleteTempFile(filepath) {
  return new Promise((resolve) => {
    fs.unlink(filepath, (err) => {
      if (err) console.warn(`Could not delete temp file ${filepath}:`, err.message);
      resolve();
    });
  });
}

/**
 * Mark email as processed (move to archive label or similar)
 * Optional: call this after successful ingestion
 */
export async function markEmailProcessed(messageId) {
  const client = getGmailClient();
  try {
    // Add 'Processed' label and remove 'INBOX' if configured
    await client.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        addLabelIds: ['PROCESSED'],
        removeLabelIds: ['INBOX'],
      },
    });
    console.log(`[GMAIL] Marked message ${messageId} as processed`);
  } catch (err) {
    console.warn(`Could not mark message as processed (label may not exist): ${err.message}`);
  }
}
