/**
 * Deduplication Service
 * Prevents duplicate uploads by tracking file hashes
 * Supports both manual and auto uploads
 */

import { createServerClient } from './supabase';

/**
 * Check if file has already been uploaded
 * @param {String} fileHash - SHA-256 hash of file
 * @param {String} source - 'manual' or 'gmail_automation'
 * @param {Date} uploadDate - Date to check (default: today)
 * @returns {Promise<Object|null>} Existing upload record or null
 */
export async function checkDuplicateUpload(
  fileHash,
  source = 'manual',
  uploadDate = new Date()
) {
  try {
    const supabase = createServerClient();

    const startOfDay = new Date(uploadDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(uploadDate);
    endOfDay.setHours(23, 59, 59, 999);

    const { data, error } = await supabase
      .schema('public')
      .from('upload_audit_log')
      .select('*')
      .eq('file_sha256', fileHash)
      .eq('source', source)
      .gte('uploaded_at', startOfDay.toISOString())
      .lte('uploaded_at', endOfDay.toISOString())
      .maybeSingle();

    if (error) {
      console.error('Deduplication check error:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Deduplication service error:', err);
    return null;
  }
}

/**
 * Record a successful upload in audit log
 * @param {Object} uploadData - Upload information
 * @returns {Promise<Object|null>} Created audit log record
 */
export async function recordUpload(uploadData) {
  try {
    const supabase = createServerClient();

    const auditEntry = {
      file_sha256: uploadData.fileHash,
      original_file_name: uploadData.filename,
      renamed_file_name: uploadData.renamedFilename || uploadData.filename,
      report_type: uploadData.reportType || 'unknown',
      source: uploadData.source || 'manual',
      storage_path: uploadData.storagePath,
      row_count: uploadData.rowCount || 0,
      file_size_bytes: uploadData.fileSizeBytes || 0,
      uploaded_by: uploadData.uploadedBy || 'system',
      status: 'success',
      email_date: uploadData.emailDate,
      email_id: uploadData.emailId,
      auto_upload_attempt: uploadData.source === 'gmail_automation',
    };

    const { data, error } = await supabase
      .schema('public')
      .from('upload_audit_log')
      .insert([auditEntry])
      .select()
      .single();

    if (error) {
      console.error('Failed to record upload:', error);
      return null;
    }

    console.log(`✓ Recorded upload: ${uploadData.filename}`);
    return data;
  } catch (err) {
    console.error('Error recording upload:', err);
    return null;
  }
}

/**
 * Record a failed upload attempt
 * @param {String} filename - Original filename
 * @param {String} fileHash - File SHA-256 hash
 * @param {String} reason - Error reason
 * @param {String} source - 'manual' or 'gmail_automation'
 * @returns {Promise<Object|null>} Created audit log record
 */
export async function recordFailedUpload(
  filename,
  fileHash,
  reason,
  source = 'manual'
) {
  try {
    const supabase = createServerClient();

    const auditEntry = {
      file_sha256: fileHash,
      original_file_name: filename,
      renamed_file_name: filename,
      report_type: 'unknown',
      source: source,
      status: 'failed',
      error_message: reason,
      uploaded_by: source === 'gmail_automation' ? 'system' : 'user',
    };

    const { data, error } = await supabase
      .schema('public')
      .from('upload_audit_log')
      .insert([auditEntry])
      .select()
      .single();

    if (error) {
      console.error('Failed to record error:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Error recording failed upload:', err);
    return null;
  }
}

/**
 * Get upload history for a specific file
 * @param {String} filename - Filename to search
 * @param {Number} limit - Max results (default: 10)
 * @returns {Promise<Array>} Upload history
 */
export async function getUploadHistory(filename, limit = 10) {
  try {
    const supabase = createServerClient();

    const { data, error } = await supabase
      .schema('public')
      .from('upload_audit_log')
      .select('*')
      .or(
        `original_file_name.ilike.%${filename}%,renamed_file_name.ilike.%${filename}%`
      )
      .order('uploaded_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching upload history:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Error getting upload history:', err);
    return [];
  }
}

/**
 * Check if auto-upload of this file was attempted in the last N days
 * @param {String} fileHash - File SHA-256 hash
 * @param {Number} days - Days to look back (default: 7)
 * @returns {Promise<Object|null>} Most recent auto-upload attempt or null
 */
export async function getLastAutoUploadAttempt(fileHash, days = 7) {
  try {
    const supabase = createServerClient();

    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - days);

    const { data, error } = await supabase
      .schema('public')
      .from('upload_audit_log')
      .select('*')
      .eq('file_sha256', fileHash)
      .eq('source', 'gmail_automation')
      .gte('uploaded_at', daysAgo.toISOString())
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error checking last auto-upload:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Error in getLastAutoUploadAttempt:', err);
    return null;
  }
}

/**
 * Get upload stats for today
 * @param {String} source - 'manual', 'gmail_automation', or undefined for all
 * @returns {Promise<Object>} Upload statistics
 */
export async function getTodayUploadStats(source) {
  try {
    const supabase = createServerClient();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let query = supabase
      .schema('public')
      .from('upload_audit_log')
      .select('status, count', { count: 'exact' })
      .gte('uploaded_at', today.toISOString());

    if (source) {
      query = query.eq('source', source);
    }

    const { data: successCount, error: successError } = await supabase
      .schema('public')
      .from('upload_audit_log')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'success')
      .gte('uploaded_at', today.toISOString());

    const { data: failedCount, error: failedError } = await supabase
      .schema('public')
      .from('upload_audit_log')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'failed')
      .gte('uploaded_at', today.toISOString());

    return {
      date: today.toISOString().split('T')[0],
      successful: successCount?.length || 0,
      failed: failedCount?.length || 0,
      source: source || 'all',
    };
  } catch (err) {
    console.error('Error getting upload stats:', err);
    return {
      date: new Date().toISOString().split('T')[0],
      successful: 0,
      failed: 0,
      error: err.message,
    };
  }
}

export default {
  checkDuplicateUpload,
  recordUpload,
  recordFailedUpload,
  getUploadHistory,
  getLastAutoUploadAttempt,
  getTodayUploadStats,
};
