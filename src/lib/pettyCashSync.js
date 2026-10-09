// Petty cash from the Account DSR that admin already uploads on the Data Upload page: the same
// workbook carries the "Petty cash" tab, so nobody has to upload it a second time.
// Called by /api/upload after an account_dsr file is stored. It REPLACES the ledger with the tab's
// lines (public.petty_cash_replace, one transaction). It never throws: a workbook without the tab,
// or with a line that fails validation, leaves the ledger as it was and reports why.

import { parsePettyCashWorkbook } from '@/lib/pettyCashExcel';
import { cleanEntry, STORE } from '@/lib/pettyCashShared';
import { BUCKET_NAME } from '@/lib/fileRename';

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

/**
 * Keeps the cash book on the latest Account DSR without anyone uploading twice. Called when the
 * Petty Cash page loads: if the newest Account DSR in the upload log is not the file the cash book
 * was last built from (or is newer than it), that file is read back from storage and the cash book
 * is rebuilt from its "Petty cash" tab. Covers Account DSRs uploaded before this sync existed, or a
 * sync that failed at upload time. Never throws; returns { synced, lines | reason }.
 */
export async function syncPettyCashIfStale(supabase) {
  try {
    const [dsr, last] = await Promise.all([
      supabase.from('upload_audit_log').select('original_file_name, storage_path, uploaded_at')
        .eq('report_type', 'account_dsr').order('uploaded_at', { ascending: false }).limit(1),
      supabase.from('petty_cash_uploads').select('file_name, uploaded_at')
        .eq('store_site_short_name', STORE).order('uploaded_at', { ascending: false }).limit(1),
    ]);
    if (dsr.error || last.error) return { synced: false, reason: (dsr.error || last.error).message };
    const latest = dsr.data?.[0];
    if (!latest?.storage_path) return { synced: false, reason: 'no Account DSR uploaded yet' };
    const current = last.data?.[0];
    if (current && current.file_name === latest.original_file_name && new Date(current.uploaded_at) >= new Date(latest.uploaded_at)) {
      return { synced: false, reason: 'up to date' };
    }

    const { data: blob, error } = await supabase.storage.from(BUCKET_NAME).download(latest.storage_path);
    if (error) return { synced: false, reason: `could not read ${latest.storage_path}: ${error.message}` };
    const result = await syncPettyCashFromDsr(supabase, Buffer.from(await blob.arrayBuffer()), { fileName: latest.original_file_name, user: null });
    if (!result.synced) console.warn('Petty cash not refreshed from the latest Account DSR:', result.reason);
    return result;
  } catch (err) {
    return { synced: false, reason: err.message };
  }
}
