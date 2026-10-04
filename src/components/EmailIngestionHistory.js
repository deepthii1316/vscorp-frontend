'use client';

import { useState, useEffect } from 'react';
import { Mail, RefreshCw, CheckCircle2, XCircle, AlertCircle, Clock } from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase';
import { apiFetch } from '@/lib/api';

export default function EmailIngestionHistory() {
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [pollResult, setPollResult] = useState(null);
  const [filter, setFilter] = useState('all'); // 'all', 'success', 'failed', 'duplicate', 'unknown'

  useEffect(() => {
    loadIngestionHistory();
  }, []);

  const loadIngestionHistory = async () => {
    try {
      setLoading(true);
      const supabase = createBrowserClient();
      const { data, error } = await supabase
        .from('email_attachment_audit')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setAttachments(data || []);
    } catch (err) {
      console.error('Error loading email ingestion history:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleManualPoll = async () => {
    try {
      setPolling(true);
      setPollResult(null);

      const response = await apiFetch('/api/email-ingestion/poll', {
        method: 'POST',
      });

      const result = await response.json();
      setPollResult(result);

      if (result.success) {
        // Reload history after a short delay
        setTimeout(loadIngestionHistory, 2000);
      }
    } catch (err) {
      console.error('Poll error:', err);
      setPollResult({
        success: false,
        error: err.message,
      });
    } finally {
      setPolling(false);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'success':
      case 'duplicate':
        return <CheckCircle2 className="status-icon success" />;
      case 'failed':
      case 'invalid':
        return <XCircle className="status-icon failed" />;
      case 'skipped':
      case 'unknown':
        return <AlertCircle className="status-icon unknown" />;
      default:
        return <Clock className="status-icon pending" />;
    }
  };

  const getStatusBadge = (status) => {
    const classMap = {
      received: 'badge badge-neutral',
      classified: 'badge badge-info',
      validated: 'badge badge-info',
      processing: 'badge badge-processing',
      success: 'badge badge-success',
      duplicate: 'badge badge-warning',
      failed: 'badge badge-failed',
      invalid: 'badge badge-failed',
      skipped: 'badge badge-warning',
    };
    return classMap[status] || 'badge badge-neutral';
  };

  const filteredAttachments = attachments.filter((att) => {
    if (filter === 'all') return true;
    if (filter === 'success') return att.processing_status === 'success';
    if (filter === 'failed') return ['failed', 'invalid'].includes(att.processing_status);
    if (filter === 'duplicate') return att.processing_status === 'duplicate';
    if (filter === 'unknown') return att.detected_report_type === 'unknown';
    return true;
  });

  return (
    <div className="email-ingestion-section">
      <div className="email-section-header">
        <div className="email-header-left">
          <div className="email-icon-box">
            <Mail className="email-icon" />
          </div>
          <div>
            <h2>Email Ingestion History</h2>
            <p>Automatic report uploads from Gmail</p>
          </div>
        </div>
        <button
          className={`poll-btn ${polling ? 'polling' : ''}`}
          onClick={handleManualPoll}
          disabled={polling}
          type="button"
        >
          {polling ? (
            <>
              <div className="spinner-sm" />
              <span>Checking emails...</span>
            </>
          ) : (
            <>
              <RefreshCw style={{ width: '14px', height: '14px' }} />
              <span>Check Now</span>
            </>
          )}
        </button>
      </div>

      {pollResult && (
        <div className={`poll-result ${pollResult.success ? 'success' : 'error'}`}>
          <div className="result-header">
            <strong>{pollResult.success ? '✓ Poll Complete' : '✗ Poll Failed'}</strong>
          </div>
          <div className="result-details">
            {pollResult.emailsFound !== undefined && (
              <p>
                Emails found: <strong>{pollResult.emailsFound}</strong>
              </p>
            )}
            {pollResult.attachmentsProcessed !== undefined && (
              <>
                <p>
                  Attachments processed: <strong>{pollResult.attachmentsProcessed}</strong>
                </p>
                <p>
                  Queued: <strong>{pollResult.attachmentsIngested}</strong> | Failed:{' '}
                  <strong>{pollResult.attachmentsFailed}</strong> | Duplicate:{' '}
                  <strong>{pollResult.attachmentsDuplicate}</strong> | Unknown:{' '}
                  <strong>{pollResult.attachmentsUnknown}</strong>
                </p>
              </>
            )}
            {pollResult.messages && pollResult.messages.length > 0 && (
              <div className="messages-list">
                {pollResult.messages.map((msg, i) => (
                  <p key={i}>• {msg}</p>
                ))}
              </div>
            )}
            {pollResult.errors && pollResult.errors.length > 0 && (
              <div className="errors-list" style={{ color: 'var(--negative)' }}>
                {pollResult.errors.map((err, i) => (
                  <p key={i}>✗ {err}</p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="filter-tabs">
        <button
          className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
          type="button"
        >
          All ({attachments.length})
        </button>
        <button
          className={`filter-tab ${filter === 'success' ? 'active' : ''}`}
          onClick={() => setFilter('success')}
          type="button"
        >
          Ingested ({attachments.filter(a => a.processing_status === 'success').length})
        </button>
        <button
          className={`filter-tab ${filter === 'failed' ? 'active' : ''}`}
          onClick={() => setFilter('failed')}
          type="button"
        >
          Failed ({attachments.filter(a => ['failed', 'invalid'].includes(a.processing_status)).length})
        </button>
        <button
          className={`filter-tab ${filter === 'duplicate' ? 'active' : ''}`}
          onClick={() => setFilter('duplicate')}
          type="button"
        >
          Duplicates ({attachments.filter(a => a.processing_status === 'duplicate').length})
        </button>
      </div>

      {/* Ingestion history table */}
      {loading ? (
        <div className="loading-state">Loading email history...</div>
      ) : filteredAttachments.length === 0 ? (
        <div className="empty-state">No email ingestions yet</div>
      ) : (
        <div className="email-history-table">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>File</th>
                <th>From</th>
                <th>Type</th>
                <th>Classification</th>
                <th>Validation</th>
                <th>Status</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {filteredAttachments.map((att) => {
                const createdDate = new Date(att.created_at).toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <tr key={att.id}>
                    <td className="date-cell">{createdDate}</td>
                    <td className="filename-cell">
                      <span className="filename">{att.attachment_filename}</span>
                      <br />
                      <span className="filesize-small">{att.file_hash?.substring(0, 12)}...</span>
                    </td>
                    <td className="sender-cell">
                      <span className="sender-email">{att.email_sender.substring(0, 30)}</span>
                      <br />
                      <span className="sender-subject">{att.email_subject.substring(0, 35)}</span>
                    </td>
                    <td className="type-cell">
                      <span className="report-type-badge">{att.detected_report_type || '—'}</span>
                    </td>
                    <td className="classification-cell">
                      <div>
                        <div>Confidence: {(att.classification_confidence * 100).toFixed(0)}%</div>
                        <div className="small-text">Method: {att.classification_method || '—'}</div>
                      </div>
                    </td>
                    <td className="validation-cell">
                      <div>
                        {att.validation_status === 'valid' ? (
                          <span className="badge badge-success">Valid</span>
                        ) : att.validation_status === 'invalid' ? (
                          <span className="badge badge-failed">Invalid</span>
                        ) : (
                          <span className="badge badge-neutral">—</span>
                        )}
                      </div>
                      {att.required_headers_found !== null && (
                        <div className="small-text">
                          Headers: {att.required_headers_found}/{att.required_headers_expected}
                        </div>
                      )}
                    </td>
                    <td className="status-cell">
                      <div className={getStatusBadge(att.processing_status)}>
                        {getStatusIcon(att.processing_status)}
                        {att.processing_status}
                      </div>
                      {att.row_count !== null && (
                        <div className="small-text">{att.row_count} rows</div>
                      )}
                    </td>
                    <td className="details-cell">
                      {att.processing_error && (
                        <div className="error-detail" title={att.processing_error}>
                          {att.processing_error.substring(0, 40)}
                        </div>
                      )}
                      {att.classification_details && (
                        <div className="detail-note" title={att.classification_details}>
                          {att.classification_details.substring(0, 30)}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <style jsx>{`
        .email-ingestion-section {
          margin-top: var(--space-8);
          padding: var(--space-6);
          background: var(--bg-elevated);
          border-radius: var(--r-lg);
          border: 1px solid var(--border);
        }

        .email-section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: var(--space-6);
          gap: var(--space-4);
        }

        .email-header-left {
          display: flex;
          align-items: flex-start;
          gap: var(--space-4);
        }

        .email-icon-box {
          width: 48px;
          height: 48px;
          background: var(--bg-subtle);
          border-radius: var(--r-md);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .email-icon {
          width: 24px;
          height: 24px;
          color: var(--green);
        }

        .email-section-header h2 {
          margin: 0;
          font-size: 1.25rem;
          color: var(--text);
        }

        .email-section-header p {
          margin: 2px 0 0 0;
          font-size: 0.875rem;
          color: var(--text-muted);
        }

        .poll-btn {
          padding: 10px 16px;
          background: var(--green);
          color: var(--text-inverse);
          border: none;
          border-radius: var(--r-md);
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.875rem;
          font-weight: 600;
          flex-shrink: 0;
          white-space: nowrap;
        }

        .poll-btn:hover:not(:disabled) {
          background: var(--green-hover);
        }

        .poll-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .poll-btn.polling {
          background: var(--green-hover);
        }

        .spinner-sm {
          width: 12px;
          height: 12px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .poll-result {
          padding: var(--space-4);
          margin-bottom: var(--space-5);
          border-radius: var(--r-md);
          border-left: 4px solid;
        }

        .poll-result.success {
          background: var(--green-soft);
          border-left-color: var(--green);
        }

        .poll-result.error {
          background: var(--rose-soft);
          border-left-color: var(--rose);
        }

        .result-header {
          margin-bottom: var(--space-3);
          color: inherit;
        }

        .result-details {
          font-size: 0.875rem;
          line-height: 1.6;
        }

        .result-details p {
          margin: 4px 0;
        }

        .messages-list,
        .errors-list {
          margin-top: var(--space-3);
          padding-left: var(--space-4);
        }

        .filter-tabs {
          display: flex;
          gap: var(--space-2);
          margin-bottom: var(--space-5);
          border-bottom: 1px solid var(--border);
        }

        .filter-tab {
          padding: var(--space-2) var(--space-4);
          background: transparent;
          border: none;
          border-bottom: 2px solid transparent;
          cursor: pointer;
          color: var(--text-muted);
          font-weight: 500;
          transition: all 0.2s;
        }

        .filter-tab:hover {
          color: var(--text);
        }

        .filter-tab.active {
          color: var(--green);
          border-bottom-color: var(--green);
        }

        .loading-state,
        .empty-state {
          text-align: center;
          padding: var(--space-8);
          color: var(--text-muted);
        }

        .email-history-table {
          overflow-x: auto;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.875rem;
        }

        th {
          text-align: left;
          padding: var(--space-3);
          background: var(--bg-subtle);
          color: var(--text-muted);
          font-weight: 600;
          border-bottom: 1px solid var(--border);
        }

        td {
          padding: var(--space-3);
          border-bottom: 1px solid var(--border);
          color: var(--text);
        }

        tr:hover {
          background: var(--bg-subtle);
        }

        .date-cell {
          white-space: nowrap;
          font-family: monospace;
        }

        .filename-cell {
          max-width: 180px;
          word-break: break-word;
        }

        .filename {
          font-weight: 500;
        }

        .filesize-small {
          font-size: 0.75rem;
          color: var(--text-muted);
          font-family: monospace;
        }

        .sender-cell {
          max-width: 200px;
        }

        .sender-email {
          font-weight: 500;
        }

        .sender-subject {
          font-size: 0.75rem;
          color: var(--text-muted);
          display: block;
          margin-top: 2px;
        }

        .type-cell {
          white-space: nowrap;
        }

        .report-type-badge {
          padding: 2px 8px;
          background: var(--bg-subtle);
          border-radius: var(--r-sm);
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          color: var(--text-muted);
        }

        .classification-cell,
        .validation-cell,
        .status-cell {
          font-size: 0.8rem;
        }

        .small-text {
          font-size: 0.75rem;
          color: var(--text-muted);
          margin-top: 2px;
        }

        .badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 8px;
          border-radius: var(--r-sm);
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
        }

        .badge-success {
          background: var(--green-soft);
          color: var(--green);
        }

        .badge-failed {
          background: var(--rose-soft);
          color: var(--rose);
        }

        .badge-warning {
          background: var(--amber-soft);
          color: var(--amber);
        }

        .badge-processing {
          background: var(--blue-soft);
          color: var(--blue);
        }

        .badge-info {
          background: var(--blue-soft);
          color: var(--blue);
        }

        .badge-neutral {
          background: var(--bg-subtle);
          color: var(--text-muted);
        }

        .status-icon {
          width: 14px;
          height: 14px;
        }

        .error-detail {
          color: var(--rose);
          font-size: 0.75rem;
          max-width: 150px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .detail-note {
          color: var(--text-muted);
          font-size: 0.75rem;
          max-width: 150px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      `}</style>
    </div>
  );
}
