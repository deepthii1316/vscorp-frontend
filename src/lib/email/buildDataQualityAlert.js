/**
 * Data Quality Alert — reusable component for DAY email reports
 *
 * Shows a prominent warning banner when stores are missing data for the
 * selected reporting date, plus a small section note below affected sections.
 *
 * Uses the SAME expected-stores logic as the Data Coverage admin page
 * (staging.dim_store as the source of truth for active stores).
 *
 * Usage:
 *   const alert = buildDataQualityAlert(reportDate, expectedStores, storesWithData)
 *   // alert.banner → full warning HTML (shown once near top of email)
 *   // alert.sectionNote → small note for each affected section
 *   // alert.hasMissing → boolean flag
 */

/**
 * @typedef {Object} ExpectedStore
 * @property {string} store_name
 * @property {boolean} has_data
 * @property {string | null} cluster_name
 */

/**
 * @typedef {Object} DataQualityAlert
 * @property {boolean} hasMissing
 * @property {string} banner
 * @property {string} sectionNote
 * @property {{expected: number, withData: number, missing: number, coveragePct: number, missingStores: string[]}} stats
 */

/**
 * @param {string} name
 * @returns {string}
 */
function shortName(name) {
  return name
    .replace(/^V\s*S\s*CORP\s*[-–—]\s*/i, '')
    .replace(/^V\s*S\s*CORP-/i, '')
    .trim();
}

/**
 * @param {string} iso
 * @returns {string}
 */
function formatDate(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Build the data quality alert.
 * @param {string} reportDate
 * @param {ExpectedStore[]} stores
 * @returns {DataQualityAlert}
 */
export function buildDataQualityAlert(reportDate, stores) {
  const expected = stores.length;
  const withData = stores.filter((s) => s.has_data).length;
  const missing = expected - withData;
  const coveragePct = expected > 0 ? Math.round((withData / expected) * 1000) / 10 : 0;
  const missingStores = stores
    .filter((s) => !s.has_data)
    .map((s) => shortName(s.store_name));

  const hasMissing = missing > 0;

  if (!hasMissing) {
    return {
      hasMissing: false,
      banner: '',
      sectionNote: '',
      stats: { expected, withData, missing, coveragePct, missingStores },
    };
  }

  const missingListHtml = missingStores
    .map((name) => `      <li style="margin:2px 0;font-size:13px;">• ${name}</li>`)
    .join('\n');

  const banner = `
  <div style="font-family:Arial,Helvetica,sans-serif;margin:12px 0;border:2px solid #d97706;border-radius:6px;background:#fffbeb;padding:14px 16px;">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
      <span style="font-size:20px;">⚠</span>
      <span style="font-weight:bold;font-size:15px;color:#92400e;">DATA QUALITY ALERT</span>
    </div>
    <table style="border-collapse:collapse;font-size:13px;color:#78350f;width:100%;">
      <tr>
        <td style="padding:2px 8px 2px 0;font-weight:600;white-space:nowrap;vertical-align:top;">Reporting Date:</td>
        <td style="padding:2px 0;">${formatDate(reportDate)}</td>
      </tr>
      <tr>
        <td style="padding:2px 8px 2px 0;font-weight:600;white-space:nowrap;">Expected Stores:</td>
        <td style="padding:2px 0;">${expected}</td>
      </tr>
      <tr>
        <td style="padding:2px 8px 2px 0;font-weight:600;white-space:nowrap;">Stores with Data:</td>
        <td style="padding:2px 0;">${withData}</td>
      </tr>
      <tr>
        <td style="padding:2px 8px 2px 0;font-weight:600;white-space:nowrap;">Coverage:</td>
        <td style="padding:2px 0;font-weight:bold;color:${coveragePct >= 90 ? '#15803d' : coveragePct >= 70 ? '#d97706' : '#dc2626'};">${coveragePct}%</td>
      </tr>
      <tr>
        <td style="padding:2px 8px 2px 0;font-weight:600;white-space:nowrap;vertical-align:top;">Missing Stores:</td>
        <td style="padding:2px 0;">
          <ul style="margin:2px 0;padding-left:16px;list-style:none;">
${missingListHtml}
          </ul>
        </td>
      </tr>
    </table>
    <div style="margin-top:10px;padding:8px 10px;background:#fef3c7;border-radius:4px;font-size:12px;color:#92400e;">
      <strong>Reason:</strong> No data was received from SupplyMint for the selected reporting date.<br>
      <strong>Action Required:</strong> Please verify the SupplyMint upload before using this report for operational decisions.
    </div>
  </div>`;

  const sectionNote = `
  <div style="font-family:Arial,Helvetica,sans-serif;margin:6px 0;padding:6px 10px;background:#fffbeb;border:1px solid #fde68a;border-radius:4px;font-size:11px;color:#92400e;">
    ⚠ One or more stores were excluded because no data was received for the selected reporting date.
    Refer to the Data Quality Alert above.
  </div>`;

  return {
    hasMissing,
    banner,
    sectionNote,
    stats: { expected, withData, missing, coveragePct, missingStores },
  };
}