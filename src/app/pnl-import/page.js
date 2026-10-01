'use client';

import { useState, useRef } from 'react';
import { Upload, AlertCircle, CheckCircle, Loader } from 'lucide-react';
import RequireAuth from '@/components/RequireAuth';
import { parsePnLWorkbook, generateImportPreview } from '@/lib/pnlExcelImport';
import { apiFetch } from '@/lib/api';

const IMPORT_STEPS = {
  UPLOAD: 'upload',
  PREVIEW: 'preview',
  IMPORTING: 'importing',
  DONE: 'done',
};

function UploadStep({ onFile, loading }) {
  const fileInputRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const parsed = await parsePnLWorkbook(buffer);
      onFile(parsed, file.name);
    } catch (err) {
      alert('Error reading file: ' + err.message);
    }
  };

  return (
    <div className="pnl-import-step">
      <div className="pnl-upload-zone">
        <Upload style={{ width: 48, height: 48, color: 'var(--text-muted)' }} />
        <h3>Upload P&L Report</h3>
        <p>Select an Excel file with P&L data (.xlsx, .xls)</p>
        <button
          type="button"
          className="pnl-btn primary"
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
        >
          {loading ? 'Reading...' : 'Choose File'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFile}
          style={{ display: 'none' }}
        />
      </div>
    </div>
  );
}

function PreviewStep({ data, fileName, onConfirm, onBack, loading }) {
  return (
    <div className="pnl-import-step">
      <div className="pnl-preview-header">
        <h3>Preview: {fileName}</h3>
        <p className="pnl-preview-summary">
          Found <strong>{data.summary.totalMonths}</strong> months of data ({data.summary.dateRange})
        </p>
      </div>

      {data.warnings.length > 0 && (
        <div className="pnl-warning-box">
          <AlertCircle style={{ width: 18, height: 18 }} />
          <div>
            <strong>Warnings:</strong>
            <ul>
              {data.warnings.slice(0, 5).map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="pnl-preview-table">
        <table>
          <thead>
            <tr>
              <th>Month</th>
              <th>Gross Sale</th>
              <th>Income Margin</th>
              <th>ROI</th>
              <th>Expenses</th>
            </tr>
          </thead>
          <tbody>
            {data.preview.map((row, idx) => (
              <tr key={idx}>
                <td>{row.month}</td>
                <td className="pnl-table-value">₹{(row.sale || 0).toLocaleString('en-IN')}</td>
                <td className="pnl-table-value">₹{(row.incomeMargin || 0).toLocaleString('en-IN')}</td>
                <td className="pnl-table-value">{(row.roi || 0).toFixed(2)}%</td>
                <td className="pnl-table-value">{row.expenseCount} categories</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pnl-import-actions">
        <button
          type="button"
          className="pnl-btn secondary"
          onClick={onBack}
          disabled={loading}
        >
          Back
        </button>
        <button
          type="button"
          className="pnl-btn primary"
          onClick={onConfirm}
          disabled={loading}
        >
          {loading ? 'Importing...' : 'Import Data'}
        </button>
      </div>
    </div>
  );
}

function ImportingStep() {
  return (
    <div className="pnl-import-step">
      <div className="pnl-status-center">
        <Loader style={{ width: 48, height: 48, animation: 'spin 2s linear infinite', color: 'var(--green)' }} />
        <h3>Importing Data...</h3>
        <p>Processing and storing P&L data. This may take a moment.</p>
      </div>
    </div>
  );
}

function DoneStep({ result, onReset }) {
  return (
    <div className="pnl-import-step">
      <div className="pnl-status-center">
        <CheckCircle style={{ width: 48, height: 48, color: 'var(--green)' }} />
        <h3>Import Complete!</h3>
        <div className="pnl-result-summary">
          <div className="pnl-result-row">
            <span>Successfully imported:</span>
            <strong style={{ color: 'var(--green)' }}>{result.successful} months</strong>
          </div>
          {result.failed > 0 && (
            <div className="pnl-result-row">
              <span>Failed:</span>
              <strong style={{ color: 'var(--rose)' }}>{result.failed}</strong>
            </div>
          )}
          {result.errors.length > 0 && (
            <div className="pnl-result-errors">
              <h4>Errors:</h4>
              <ul>
                {result.errors.slice(0, 5).map((err, i) => (
                  <li key={i} style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {err}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <button
          type="button"
          className="pnl-btn primary"
          onClick={onReset}
        >
          Import Another File
        </button>
      </div>
    </div>
  );
}

function PnLImportInner() {
  const [step, setStep] = useState(IMPORT_STEPS.UPLOAD);
  const [parsedData, setParsedData] = useState(null);
  const [fileName, setFileName] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleFileSelected = (data, name) => {
    setParsedData(generateImportPreview(data));
    setFileName(name);
    setStep(IMPORT_STEPS.PREVIEW);
  };

  const handleImport = async () => {
    if (!parsedData) return;

    setStep(IMPORT_STEPS.IMPORTING);
    setLoading(true);

    try {
      const res = await apiFetch('/api/pnl/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monthlyData: parsedData.preview.map((p) => ({
            periodMonth: new Date(p.month),
            grossSale: p.sale,
            incomeMargin: p.incomeMargin,
            roi: p.roi,
            depreciation: 0, // These come from the full data, not preview
            fundsCost: 0,
            expenses: {},
          })),
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Import failed');

      setResult(json);
      setStep(IMPORT_STEPS.DONE);
    } catch (err) {
      alert('Error: ' + err.message);
      setStep(IMPORT_STEPS.PREVIEW);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setStep(IMPORT_STEPS.UPLOAD);
    setParsedData(null);
    setFileName(null);
    setResult(null);
  };

  return (
    <div className="pnl-import-wrapper">
      <div className="pnl-import-container">
        <div className="pnl-import-header">
          <h1>Import P&L Data</h1>
          <p>Upload Excel reports to update store P&L metrics</p>
        </div>

        <div className="pnl-import-progress">
          {Object.values(IMPORT_STEPS).map((s, idx) => (
            <div
              key={s}
              className={`pnl-progress-step ${step === s ? 'active' : ''} ${
                Object.values(IMPORT_STEPS).indexOf(s) < Object.values(IMPORT_STEPS).indexOf(step)
                  ? 'done'
                  : ''
              }`}
            >
              <div className="pnl-progress-dot">{idx + 1}</div>
              <span>{s.charAt(0).toUpperCase() + s.slice(1)}</span>
            </div>
          ))}
        </div>

        {step === IMPORT_STEPS.UPLOAD && <UploadStep onFile={handleFileSelected} loading={loading} />}
        {step === IMPORT_STEPS.PREVIEW && parsedData && (
          <PreviewStep
            data={parsedData}
            fileName={fileName}
            onConfirm={handleImport}
            onBack={() => setStep(IMPORT_STEPS.UPLOAD)}
            loading={loading}
          />
        )}
        {step === IMPORT_STEPS.IMPORTING && <ImportingStep />}
        {step === IMPORT_STEPS.DONE && result && (
          <DoneStep result={result} onReset={handleReset} />
        )}
      </div>
    </div>
  );
}

export default function PnLImportPage() {
  return (
    <RequireAuth roles={['admin']}>
      <PnLImportInner />
    </RequireAuth>
  );
}
