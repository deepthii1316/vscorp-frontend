// Petty cash from the Account DSR that admin already uploads on the Data Upload page: the same
// workbook carries the "Petty cash" tab, so nobody has to upload it a second time.
// Called by /api/upload after an account_dsr file is stored. It REPLACES the ledger with the tab's
// lines (public.petty_cash_replace, one transaction). It never throws: a workbook without the tab,
// or with a line that fails validation, leaves the ledger as it was and reports why.

import { parsePettyCashWorkbook } from '@/lib/pettyCashExcel';
import { cleanEntry } from '@/lib/pettyCashShared';

/** Returns { synced: true, lines } or { synced: false, reason }. */
export async function syncPettyCashFromDsr(supabase, fileBytes, { fileName, user }) {
  try {
    const parsed = parsePettyCashWorkbook(fileBytes);
    if (parsed.entries.length === 0) return { synced: false, reason: `tab "${parsed.sheet}" has no petty cash lines` };

    const rows = [];
    for (let i = 0; i < parsed.entries.length; i++) {
      const { entry, error } = cleanEntry(parsed.entries[i]);
      if (error) return { synced: false, reason: `line ${i + 1}: ${error}` };
      rows.push({ ...entry, line_no: i + 1 });
    }

    const { data, error } = await supabase.rpc('petty_cash_replace', {
      p_rows: rows,
      p_file_name: String(fileName || 'Account DSR').slice(0, 200),
      p_sheet_title: parsed.title ? parsed.title.slice(0, 200) : null,
      p_user: user?.id || null,
      p_email: user?.email || null,
    });
    if (error) return { synced: false, reason: error.message };
    return { synced: true, lines: data?.lines ?? rows.length, warnings: parsed.warnings };
  } catch (err) {
    return { synced: false, reason: err.message };
  }
}
