/**
 * Gmail Automation Service
 * Reads emails from virata.operations@gmail.com and extracts daily reports
 * Supports auto-upload of Sales, Stock, and Account DSR reports
 */

import { google } from 'googleapis';
import { Readable } from 'stream';
import crypto from 'crypto';

const gmail = google.gmail('v1');

// Report types we're looking for
const REPORT_TYPES = {
  sales: ['MFL Day Wise Sal', 'MFL Day Wise Sale'],
  billwise: ['MFL Bill Wise Ite', 'MFL Bill Wise Item'],
  stock: ['Stock Balance Re', 'Stock Balance Report'],
  accountDsr: ['ACC DSR', 'Account DSR', 'Oct-26 ACC DSR'],
  dsr: ['DSR', 'DSR Oct'],
};

/**
 * Initialize Gmail API with OAuth2 credentials
 * @param {Object} credentials - OAuth2 credentials from env
 * @returns {Object} Authorized Gmail client
 */
export function initializeGmailClient(credentials) {
  const oauth2Client = new google.auth.OAuth2(
    credentials.client_id,
    credentials.client_secret,
    credentials.redirect_uris?.[0]
  );

  oauth2Client.setCredentials({
    refresh_token: credentials.refresh_token,
  });

  return google.gmail({
    version: 'v1',
    auth: oauth2Client,
  });
}

/**
 * Fetch unread emails from virata.operations@gmail.com
 * @param {Object} auth - Authenticated Gmail client
 * @param {Number} maxResults - Max emails to fetch (default 10)
 * @returns {Promise<Array>} List of email objects
 */
export async function fetchUnreadEmails(auth, maxResults = 10) {
  try {
    const response = await auth.users.messages.list({
      userId: 'me',
      q: 'from:virata.operations@gmail.com is:unread',
      maxResults,
    });

    if (!response.data.messages) {
      console.log('No unread emails from virata.operations@gmail.com');
      return [];
    }

    return response.data.messages;
  } catch (error) {
    console.error('Error fetching emails:', error.message);
    throw new Error(`Gmail fetch failed: ${error.message}`);
  }
}

/**
 * Get full email details including attachments
 * @param {Object} auth - Authenticated Gmail client
 * @param {String} messageId - Gmail message ID
 * @returns {Promise<Object>} Full email with attachments metadata
 */
export async function getEmailDetails(auth, messageId) {
  try {
    const response = await auth.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });

    const message = response.data;
    const headers = message.payload.headers;
    const subject = headers.find(h => h.name === 'Subject')?.value || '';
    const from = headers.find(h => h.name === 'From')?.value || '';
    const date = headers.find(h => h.name === 'Date')?.value || '';

    // Extract attachments
    const attachments = [];
    const parts = message.payload.parts || [];

    for (const part of parts) {
      if (part.filename && part.body.attachmentId) {
        attachments.push({
          filename: part.filename,
          mimeType: part.mimeType,
          attachmentId: part.body.attachmentId,
          messageId: messageId,
          partId: part.partId,
        });
      }
    }

    return {
      messageId,
      subject,
      from,
      date,
      attachments,
      labels: message.labelIds || [],
    };
  } catch (error) {
    console.error(`Error getting email ${messageId}:`, error.message);
    throw error;
  }
}

/**
 * Download attachment from Gmail
 * @param {Object} auth - Authenticated Gmail client
 * @param {String} messageId - Gmail message ID
 * @param {String} attachmentId - Attachment ID
 * @returns {Promise<Buffer>} Attachment file buffer
 */
export async function downloadAttachment(auth, messageId, attachmentId) {
  try {
    const response = await auth.users.messages.attachments.get({
      userId: 'me',
      messageId,
      id: attachmentId,
    });

    const data = response.data.data;
    // Attachment data is base64url encoded
    const buffer = Buffer.from(data, 'base64url');
    return buffer;
  } catch (error) {
    console.error(
      `Error downloading attachment ${attachmentId}:`,
      error.message
    );
    throw error;
  }
}

/**
 * Classify report type based on filename
 * @param {String} filename - Filename from email attachment
 * @returns {String} Report type (sales|billwise|stock|accountDsr|dsr|unknown)
 */
export function classifyReport(filename) {
  const lowerName = filename.toLowerCase();

  for (const [type, patterns] of Object.entries(REPORT_TYPES)) {
    for (const pattern of patterns) {
      if (lowerName.includes(pattern.toLowerCase())) {
        return type;
      }
    }
  }

  return 'unknown';
}

/**
 * Calculate SHA-256 hash of file buffer
 * @param {Buffer} buffer - File buffer
 * @returns {String} Hex-encoded SHA-256 hash
 */
export function calculateFileHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Classify and prepare report for upload
 * @param {Object} attachment - Attachment metadata
 * @param {Buffer} fileBuffer - File contents
 * @param {String} emailDate - Email sent date
 * @returns {Object} Prepared report object
 */
export function prepareReport(attachment, fileBuffer, emailDate) {
  const reportType = classifyReport(attachment.filename);
  const fileHash = calculateFileHash(fileBuffer);

  // Map report type to upload form value
  const reportTypeMap = {
    sales: 'sales',
    billwise: 'sales',
    stock: 'inventory',
    accountDsr: 'account_dsr',
    dsr: 'account_dsr',
    unknown: 'unknown',
  };

  return {
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    fileBuffer,
    reportType: reportTypeMap[reportType] || reportType,
    fileHash,
    emailDate: new Date(emailDate),
    source: 'gmail_automation',
    originalReportType: reportType,
  };
}

/**
 * Mark email as read in Gmail
 * @param {Object} auth - Authenticated Gmail client
 * @param {String} messageId - Gmail message ID
 * @returns {Promise<void>}
 */
export async function markEmailAsRead(auth, messageId) {
  try {
    await auth.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        removeLabelIds: ['UNREAD'],
      },
    });
    console.log(`Marked email ${messageId} as read`);
  } catch (error) {
    console.error(`Error marking email as read:`, error.message);
    // Don't throw - continue processing even if marking read fails
  }
}

/**
 * Add label to email (for tracking processed emails)
 * @param {Object} auth - Authenticated Gmail client
 * @param {String} messageId - Gmail message ID
 * @param {String} labelName - Label name (e.g., "AutoProcessed")
 * @returns {Promise<void>}
 */
export async function addLabelToEmail(auth, messageId, labelName) {
  try {
    // First, create label if it doesn't exist
    const labelsResponse = await auth.users.labels.list({
      userId: 'me',
    });

    let labelId = labelsResponse.data.labels?.find(
      l => l.name === labelName
    )?.id;

    if (!labelId) {
      const createLabelResponse = await auth.users.labels.create({
        userId: 'me',
        requestBody: {
          name: labelName,
          labelListVisibility: 'labelShow',
          messageListVisibility: 'show',
        },
      });
      labelId = createLabelResponse.data.id;
    }

    // Add label to message
    await auth.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        addLabelIds: [labelId],
      },
    });

    console.log(`Added label "${labelName}" to email ${messageId}`);
  } catch (error) {
    console.error(`Error adding label:`, error.message);
    // Don't throw - continue processing
  }
}

/**
 * Main function: Fetch daily reports from Gmail and prepare for upload
 * @param {Object} gmailAuth - Authenticated Gmail client
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} { reports: [...], errors: [...], emailIds: [...] }
 */
export async function fetchDailyReports(gmailAuth, options = {}) {
  const { maxEmails = 5, labelProcessed = 'AutoProcessed' } = options;

  const results = {
    reports: [],
    errors: [],
    emailIds: [],
    skipped: 0,
  };

  try {
    // Fetch unread emails
    const emails = await fetchUnreadEmails(gmailAuth, maxEmails);

    if (emails.length === 0) {
      console.log('No unread emails to process');
      return results;
    }

    console.log(`Found ${emails.length} unread emails from virata.operations`);

    // Process each email
    for (const email of emails) {
      try {
        const emailDetails = await getEmailDetails(gmailAuth, email.id);
        console.log(`Processing email: ${emailDetails.subject}`);

        // Download and prepare each attachment
        for (const attachment of emailDetails.attachments) {
          try {
            const fileBuffer = await downloadAttachment(
              gmailAuth,
              email.id,
              attachment.attachmentId
            );

            const report = prepareReport(
              attachment,
              fileBuffer,
              emailDetails.date
            );

            // Only add reports we recognize (not unknown types)
            if (report.reportType !== 'unknown') {
              results.reports.push(report);
              console.log(
                `✓ Prepared: ${report.filename} (${report.reportType})`
              );
            } else {
              results.skipped++;
              console.log(`⊘ Skipped unknown report type: ${report.filename}`);
            }
          } catch (attachmentError) {
            results.errors.push({
              type: 'attachment_download',
              messageId: email.id,
              attachmentId: attachment.attachmentId,
              error: attachmentError.message,
            });
          }
        }

        // Mark email as processed
        results.emailIds.push(email.id);
        await markEmailAsRead(gmailAuth, email.id);
        await addLabelToEmail(gmailAuth, email.id, labelProcessed);
      } catch (emailError) {
        results.errors.push({
          type: 'email_processing',
          messageId: email.id,
          error: emailError.message,
        });
      }
    }

    console.log(
      `Completed: ${results.reports.length} reports, ${results.errors.length} errors, ${results.skipped} skipped`
    );
    return results;
  } catch (error) {
    results.errors.push({
      type: 'fatal',
      error: error.message,
    });
    throw error;
  }
}

export default {
  initializeGmailClient,
  fetchUnreadEmails,
  getEmailDetails,
  downloadAttachment,
  classifyReport,
  calculateFileHash,
  prepareReport,
  markEmailAsRead,
  addLabelToEmail,
  fetchDailyReports,
};
