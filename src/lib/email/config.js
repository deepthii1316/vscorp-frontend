/**
 * Email configuration for the Uppal Reebok sales reports.
 *
 * SMTP credentials are set via environment variables:
 *   SMTP_USER - Gmail SMTP username
 *   SMTP_PASS - Gmail app password
 *
 * Reebok has a single store (no clusters), so there is one recipient list.
 * For now both modes go to the developer's own address only; replace
 * RECIPIENTS with the real Reebok distribution list when it is confirmed.
 */

/**
 * @type {string}
 */
export const EMAIL_FROM = `Virata Retail Analytics <${process.env.SMTP_USER ?? ''}>`;

/**
 * Send mode: 'test' or 'all'.
 * @enum {string}
 */
export const SendMode = {
  TEST: 'test',
  ALL: 'all',
};

/** Test recipients. */
export const TEST_RECIPIENTS = ['deepthialter@gmail.com'];

/** Full distribution list (temporarily the same single address as test). */
export const ALL_RECIPIENTS = ['deepthialter@gmail.com'];

/**
 * Get recipients for the specified send mode.
 * @param {string} mode - 'test' or 'all'
 * @returns {string[]} Array of recipient email addresses
 */
export function recipientsFor(mode) {
  return mode === 'all' ? ALL_RECIPIENTS : TEST_RECIPIENTS;
}

/**
 * Backward-compat: existing callers that don't pass a mode get the test list.
 * @type {string[]}
 */
export const DAILY_REPORT_RECIPIENTS = TEST_RECIPIENTS;
