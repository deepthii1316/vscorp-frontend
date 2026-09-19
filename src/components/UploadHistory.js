'use client';

import { Clock, ClipboardList } from 'lucide-react';

export default function UploadHistory({ uploads, loading, showHeader = true }) {
  const formatReportTypeLabel = (type) => {
    switch (type) {
      case 'sales':         return 'Sales';
      case 'inventory': case 'stock': return 'Stock';
      case 'account_dsr':   return 'Account DSR';
      default: return type || 'Report';
    }
  };

  if (loading) {
    return (
      <div>
        {showHeader && (
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-5)', paddingBottom: 'var(--space-4)', borderBottom: '1px solid var(--border)' }}>
              <Clock style={{ width: '15px', height: '15px', color: 'var(--text)', strokeWidth: 1.6 }} />
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>Upload History</h3>
            </div>
          </div>
        )}
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: 'var(--space-8)', textAlign: 'center' }}>
          <div className="spinner dark" style={{ margin: '0 auto var(--space-3)' }} />
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Loading upload history…</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {showHeader && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-5)', paddingBottom: 'var(--space-4)', borderBottom: '1px solid var(--border)' }}>
          <Clock style={{ width: '15px', height: '15px', color: 'var(--text)', strokeWidth: 1.6 }} />
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>Upload History</h3>
          {uploads?.length > 0 && (
            <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>
              {uploads.length} file{uploads.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
        {!uploads || uploads.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-9)', gap: 'var(--space-3)' }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--bg-inset)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ClipboardList style={{ width: 18, height: 18, color: 'var(--text-muted)', strokeWidth: 1.6 }} />
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 500 }}>No uploaded reports found</p>
          </div>
        ) : (
          <div className="history-table-wrapper">
            <table className="history-table">
              <thead>
                <tr>
                  <th>Report Type</th>
                  <th>Filename</th>
                  <th>Uploaded By</th>
                  <th>Date & Time</th>
                  <th>Status</th>
                  <th>Storage Path</th>
                </tr>
              </thead>
              <tbody>
                {uploads.map((u) => {
                  const isSuccess = u.status === 'success' || u.status === 'completed' || u.status === 'processed';
                  const isFailed  = u.status === 'failed' || u.status === 'error';
                  const storagePath = u.storage_path || `${u.report_type || 'raw'}/${u.renamed_file_name || u.original_file_name || ''}`;
                  return (
                    <tr key={u.id}>
                      <td>
                        <span className="report-type-badge">{formatReportTypeLabel(u.report_type)}</span>
                      </td>
                      <td className="file-name-cell" title={u.original_file_name || u.renamed_file_name}>
                        {u.original_file_name || u.renamed_file_name}
                      </td>
                      <td className="uploaded-by-cell">
                        {u.uploaded_by && u.uploaded_by !== 'admin' ? u.uploaded_by : '—'}
                      </td>
                      <td className="uploaded-at-cell">
                        {u.uploaded_at
                          ? new Date(u.uploaded_at).toLocaleDateString('en-IN', {
                              day: '2-digit', month: 'short', year: 'numeric',
                              hour: '2-digit', minute: '2-digit',
                            })
                          : '—'}
                      </td>
                      <td>
                        <span className={`status-badge-pill ${isSuccess ? 'processed' : isFailed ? 'failed' : 'pending'}`}>
                          <span className="status-dot-sm" />
                          {isSuccess ? 'Processed' : isFailed ? 'Failed' : 'Pending'}
                        </span>
                      </td>
                      <td className="storage-path-cell" title={storagePath}>{storagePath}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
