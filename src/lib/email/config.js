/**
 * Email configuration for VS Corp reports.
 *
 * SMTP credentials should be set via environment variables:
 *   SMTP_USER - Gmail SMTP username (e.g. palashrupani2621@gmail.com)
 *   SMTP_PASS - Gmail app password
 *
 * The full distribution list (ALL) includes all Skechers stores and VS Corp team members.
 * The test list (TEST) goes only to the two internal reviewers.
 */

/**
 * @type {string}
 */
export const EMAIL_FROM = `VS Corp Analytics <${process.env.SMTP_USER ?? 'palashrupani2621@gmail.com'}>`;

/**
 * Send mode: 'test' or 'all'.
 * @enum {string}
 */
export const SendMode = {
  TEST: 'test',
  ALL: 'all',
};

/**
 * Test recipients - only the two internal reviewers.
 * @type {string[]}
 */
export const TEST_RECIPIENTS = [
  'palashrupani2621@gmail.com',
  'adityapappu01@vscorp.in',
];

/**
 * Full distribution list - management, cluster heads, and all Skechers stores.
 * @type {string[]}
 */
export const ALL_RECIPIENTS = [
  'adityapappu01@vscorp.in',
  'adityapappu@vscorp.in',
  'srinivas.narsin@vscorp.in',
  'satish.mutyala@vscorp.in',
  'cluster2@vscorp.in',
  'sandeep.anumala@vscorp.in',
  'bharatparepalli@vscorp.in',
  'auditor1@vscorp.in',
  'ravishankar@vscorp.in',
  'trainer@vscorp.in',
  'adityapappu31@gmail.com',
  'skechers.jubileehills@gmail.com',
  'skechersmg.vizag@gmail.com',
  'skechers.gsmmall@gmail.com',
  'skechers.guntur@gmail.com',
  'skechers.kharkhana@gmail.com',
  'skechers.asraonagar@gmail.com',
  'skechers.panjagutta@gmail.com',
  'skechers.hmyt@gmail.com',
  'skechers.rajamahendravaram@gmail.com',
  'skechers.vijayawada@gmail.com',
  'skechers.nellore@gmail.com',
  'skechers.kakinada@gmail.com',
  'skechers.vijayawada2@gmail.com',
  'skecherscpr@gmail.com',
  'skechers.sccmall@gmail.com',
  'skechers.gvk@gmail.com',
  'skechers.kothapet@gmail.com',
  'skechersnallagandla@gmail.com',
  'skechers.inorbitvizag@gmail.com',
  'skechers.vijayawada3@gmail.com',
  'sreekar@vscorp.in',
  'nagendra@vscorp.in',
];

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