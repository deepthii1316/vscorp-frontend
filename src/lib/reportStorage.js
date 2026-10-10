/**
 * Report Storage Service
 * Handles uploading reports to Supabase storage
 */

import { createServerClient } from './supabase';

/**
 * Upload report file to storage
 * @param {Object} report - Report with fileBuffer, filename, reportType
 * @returns {Promise<Object>} Upload result with success, filename, path
 */
export async function uploadReportToStorage(report) {
  try {
    const supabase = createServerClient();

    if (!report.fileBuffer) {
      return {
        success: false,
        error: 'No file buffer provided',
      };
    }

    // Generate storage path based on report type and date
    const date = report.emailDate || new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    const reportType = (report.reportType || 'unknown').toLowerCase();
    const storagePath = `reports/${reportType}/${year}/${month}/${day}/${report.filename}`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('reports')
      .upload(storagePath, report.fileBuffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        upsert: false, // Don't overwrite existing files
      });

    if (error) {
      console.error(`Storage upload error: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }

    console.log(`✓ Uploaded to storage: ${storagePath}`);

    return {
      success: true,
      filename: report.filename,
      path: storagePath,
      size: report.fileBuffer.length,
      rowCount: report.rowCount || 0,
    };
  } catch (error) {
    console.error('Upload service error:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Download report from storage
 * @param {String} storagePath - Storage path from upload_audit_log
 * @returns {Promise<Buffer|null>} File buffer or null if not found
 */
export async function downloadReportFromStorage(storagePath) {
  try {
    const supabase = createServerClient();

    const { data, error } = await supabase.storage
      .from('reports')
      .download(storagePath);

    if (error) {
      console.error(`Download error: ${error.message}`);
      return null;
    }

    // Convert Blob to Buffer
    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error('Download service error:', error.message);
    return null;
  }
}

/**
 * Delete report from storage
 * @param {String} storagePath - Storage path to delete
 * @returns {Promise<Boolean>} Success status
 */
export async function deleteReportFromStorage(storagePath) {
  try {
    const supabase = createServerClient();

    const { error } = await supabase.storage
      .from('reports')
      .remove([storagePath]);

    if (error) {
      console.error(`Delete error: ${error.message}`);
      return false;
    }

    console.log(`✓ Deleted from storage: ${storagePath}`);
    return true;
  } catch (error) {
    console.error('Delete service error:', error.message);
    return false;
  }
}

/**
 * List reports in storage
 * @param {String} folder - Folder path (e.g., 'reports/sales/2026/10')
 * @returns {Promise<Array>} List of files
 */
export async function listReportsInStorage(folder) {
  try {
    const supabase = createServerClient();

    const { data, error } = await supabase.storage
      .from('reports')
      .list(folder);

    if (error) {
      console.error(`List error: ${error.message}`);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('List service error:', error.message);
    return [];
  }
}

export default {
  uploadReportToStorage,
  downloadReportFromStorage,
  deleteReportFromStorage,
  listReportsInStorage,
};
