'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Database,
  Activity,
  CloudUpload,
  CheckCircle2,
  XCircle,
  UploadCloud,
  Play,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Terminal,
} from 'lucide-react';
import ReportTypeSelector from '@/components/ReportTypeSelector';
import FileDropZone from '@/components/FileDropZone';
import UploadProgress from '@/components/UploadProgress';
import RequireAuth from '@/components/RequireAuth';
import { SkeletonCard } from '@/components/Skeleton';
import { hashFile } from '@/lib/hashFile';
import { generateFileName } from '@/lib/fileRename';
import { createBrowserClient } from '@/lib/supabase';

const PIPELINE_STEPS = [
  { step: 'raw', name: 'Raw ingest', desc: '— Validated and stored in the raw layer' },
  { step: 'dimensions', name: 'Dimensions', desc: '— Conformed Calendar, Store, Product, Salesperson' },
  { step: 'facts', name: 'Facts', desc: '— Fact Sales & Fact Stock in Staging' },
  { step: 'gold', name: 'Gold tables', desc: '— Store x Day Summary & granular aggregates' },
];
const POLL_INTERVAL_MS = 3000;

function UploadPageContent() {
  const [selectedType, setSelectedType] = useState(null);
  const [file, setFile] = useState(null);
  const [sha256, setSha256] = useState(null);
  const [isHashing, setIsHashing] = useState(false);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState(null);
  const [renamedFileName, setRenamedFileName] = useState(null);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStep, setUploadStep] = useState('');
  const [uploadResult, setUploadResult] = useState(null);

  const [uploads, setUploads] = useState([]);
  const [uploadsLoading, setUploadsLoading] = useState(true);

  const [isProcessingPipeline, setIsProcessingPipeline] = useState(false);
  const [pipelineRun, setPipelineRun] = useState(null); // { id, status, stage, error_message }
  const [pipelineResult, setPipelineResult] = useState(null);
  const [showLogs, setShowLogs] = useState(false);
  const pipelineTriggeredRef = useRef(false);
  const pollTimerRef = useRef(null);
  const pollInFlightRef = useRef(false);

  useEffect(() => {
    loadRecentUploads();
    resumeActiveRun();
    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopPolling = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  // Ask the server how the run is actually doing (stage is written by the
  // GitHub Actions worker) and reflect it in the UI.
  const pollRun = async (runId) => {
    if (pollInFlightRef.current) return;
    pollInFlightRef.current = true;
    try {
      const res = await fetch(`/api/process?runId=${encodeURIComponent(runId)}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.run) return; // transient — try again next tick
      const run = json.run;
      setPipelineRun(run);
      await loadRecentUploads(false);

      if (run.status === 'completed' || run.status === 'failed') {
        stopPolling();
        setIsProcessingPipeline(false);
        pipelineTriggeredRef.current = false;
        setPipelineResult({
          success: run.status === 'completed',
          message: run.status === 'completed'
            ? 'Processing completed. Reports now reflect the uploaded data.'
            : run.error_message || 'Processing failed. Check the GitHub Actions run for details.',
          output: run.error_message || undefined,
          runTime: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        });
      }
    } catch {
      // network blip — keep polling
    } finally {
      pollInFlightRef.current = false;
    }
  };

  const startPolling = (runId) => {
    stopPolling();
    pollRun(runId);
    pollTimerRef.current = setInterval(() => pollRun(runId), POLL_INTERVAL_MS);
  };

  // After a page reload, pick up a run that is still in flight.
  const resumeActiveRun = async () => {
    try {
      const res = await fetch('/api/process', { cache: 'no-store' });
      const json = await res.json();
      if (res.ok && json.run) {
        pipelineTriggeredRef.current = true;
        setIsProcessingPipeline(true);
        setPipelineRun(json.run);
        startPolling(json.run.id);
      }
    } catch {
      // not fatal
    }
  };

  const loadRecentUploads = async (showLoading = true) => {
    try {
      if (showLoading) setUploadsLoading(true);
      const supabase = createBrowserClient();
      const { data, error } = await supabase
        .from('upload_audit_log')
        .select('*')
        .order('uploaded_at', { ascending: false });

      if (error) {
        setUploads([]);
      } else {
        setUploads(data || []);
      }
    } catch {
      setUploads([]);
    } finally {
      setUploadsLoading(false);
    }
  };

  const handleFileSelect = useCallback(async (selectedFile) => {
    // Allow a fresh pipeline trigger after the user selects a new file.
    pipelineTriggeredRef.current = false;

    setFile(selectedFile);
    setSha256(null);
    setIsDuplicate(false);
    setDuplicateInfo(null);
    setUploadResult(null);

    const newName = generateFileName(selectedType);
    setRenamedFileName(newName);

    setIsHashing(true);
    try {
      const hash = await hashFile(selectedFile);
      setSha256(hash);

      const supabase = createBrowserClient();
      const { data } = await supabase
        .from('upload_audit_log')
        .select('*')
        .eq('file_sha256', hash)
        .single();

      if (data) {
        setIsDuplicate(true);
        setDuplicateInfo(data);
      }
    } catch {
      // silent
    } finally {
      setIsHashing(false);
    }
  }, [selectedType]);

  const handleFileRemove = () => {
    setFile(null);
    setSha256(null);
    setIsDuplicate(false);
    setDuplicateInfo(null);
    setRenamedFileName(null);
    setUploadResult(null);
  };

  const handleTypeSelect = (type) => {
    setSelectedType(type);
    handleFileRemove();
  };

  const handleUpload = async () => {
    if (!file || !selectedType || !sha256 || isDuplicate) return;

    setIsUploading(true);
    setUploadProgress(10);
    setUploadStep('Preparing upload…');
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('reportType', selectedType);
      formData.append('sha256', sha256);
      formData.append('originalFileName', file.name);

      setUploadProgress(20);
      setUploadStep('Uploading to storage…');

      const response = await fetch('/api/upload', { method: 'POST', body: formData });

      setUploadProgress(60);
      setUploadStep('Processing data…');

      const result = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          setIsDuplicate(true);
          setDuplicateInfo(result.duplicateInfo || null);
          setUploadResult({ success: false, message: result.error || 'Duplicate file — upload blocked.' });
        } else {
          setUploadResult({ success: false, message: result.error || 'Upload failed.' });
        }
        return;
      }

      setUploadProgress(100);
      setUploadStep('Complete!');
      setUploadResult({ success: true, message: `Uploaded as "${result.renamedFileName}".` });
      await loadRecentUploads(false);

      setTimeout(() => handleFileRemove(), 3000);
    } catch {
      setUploadResult({ success: false, message: 'Network error. Please check your connection.' });
    } finally {
      setIsUploading(false);
    }
  };

  const canUpload = file && selectedType && sha256 && !isDuplicate && !isHashing && !isUploading;

  const handleRunProcessing = async () => {
    // Guard against multiple triggers — once a pipeline has been dispatched,
    // clicking again should not spawn a second GitHub Actions workflow.
    if (pipelineTriggeredRef.current) return;
    pipelineTriggeredRef.current = true;

    setIsProcessingPipeline(true);
    setPipelineResult(null);
    setPipelineRun({ id: null, status: 'queued', stage: null });

    const finishIdle = () => {
      setIsProcessingPipeline(false);
      pipelineTriggeredRef.current = false;
    };

    try {
      const res = await fetch('/api/process', { method: 'POST' });
      const json = await res.json();
      if (!json.success) {
        setPipelineRun({ id: null, status: 'failed', stage: null });
        setPipelineResult({
          success: false,
          message: [json.error, json.details].filter(Boolean).join(' — ') || 'Pipeline execution failed.',
        });
        finishIdle();
        return;
      }

      if (json.status === 'completed' || json.uploadCount === 0) {
        setPipelineRun(null);
        setPipelineResult({ success: true, message: 'Nothing to process — there are no queued uploads.' });
        finishIdle();
        await loadRecentUploads(false);
        return;
      }

      setPipelineRun({ id: json.runId, status: json.status || 'queued', stage: null });
      setPipelineResult({
        success: true,
        message: json.alreadyRunning
          ? 'A run is already in progress — showing its live progress.'
          : 'Queued in GitHub Actions. Progress below updates automatically.',
        output: json.output,
        runTime: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      });
      await loadRecentUploads(false);
      startPolling(json.runId); // stays "processing" until the run reaches a terminal state
    } catch {
      setPipelineRun({ id: null, status: 'failed', stage: null });
      setPipelineResult({ success: false, message: 'Failed to trigger batch processing pipeline.' });
      finishIdle();
    }
  };

  // New uploads are saved as 'queued', so it must count here or Pending stays at 0.
  const pendingCount = uploads.filter(
    (u) => u.status === 'queued' || u.status === 'pending' || u.status === 'uploaded'
  ).length;

  // Derive step states from the run's real stage, as written by the worker.
  const runStatus = pipelineRun?.status;
  const runActive = runStatus === 'queued' || runStatus === 'processing';
  const stageIndex = runStatus === 'completed'
    ? PIPELINE_STEPS.length
    : PIPELINE_STEPS.findIndex((st) => st.step === pipelineRun?.stage);
  const progressPct = runStatus === 'completed'
    ? 100
    : stageIndex >= 0
      ? Math.round(((stageIndex + 0.5) / PIPELINE_STEPS.length) * 100)
      : runActive ? 4 : 0;
  const statusPill = runStatus === 'completed'
    ? { cls: 'success', label: 'Completed' }
    : runStatus === 'failed'
      ? { cls: 'failed', label: 'Failed' }
      : runStatus === 'processing' || (runStatus === 'queued' && pipelineRun?.stage)
        ? { cls: 'processing', label: 'Processing' }
        : runStatus === 'queued'
          ? { cls: 'processing', label: 'Queued' }
          : { cls: 'ready', label: 'Ready' };
  const lastActivityDate = uploads[0]?.uploaded_at
    ? new Date(uploads[0].uploaded_at).toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
      })
    : '—';

  if (uploadsLoading) {
    return (
      <div className="upload-page-stack">
        <div className="page-header">
          <div className="page-header-icon-box">
            <Database className="page-header-icon-svg" />
          </div>
          <div className="page-header-text">
            <h1>Data Upload</h1>
            <p>Loading upload workspace…</p>
          </div>
        </div>
        <div className="upload-grid">
          <SkeletonCard rows={5} />
          <SkeletonCard rows={4} />
        </div>
        <SkeletonCard rows={3} />
      </div>
    );
  }

  return (
    <>
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-icon-box">
          <Database className="page-header-icon-svg" />
        </div>
        <div className="page-header-text">
          <h1>Data Upload</h1>
          <p>Upload SAP export files to the raw layer — Medallion pipeline promotes validated data to gold.</p>
        </div>
      </div>

      <div className="upload-page-stack">

        {/* Upper grid: Pipeline Status + Upload Card */}
        <div className="upload-grid">

          {/* Left: Pipeline Status */}
          <div className="card">
            <div className="card-header">
              <Activity className="card-header-icon-svg" />
              <h3>Pipeline Status</h3>
            </div>
            <div className="pipeline-status-list">
              {['Raw Layer', 'Silver Layer', 'Gold Layer'].map((label, i) => (
                <div className="pipeline-status-item" key={label}>
                  <span className="pipeline-status-label">{label}</span>
                  <span className="status-badge success">
                    <span className="status-dot" />
                    Ready
                  </span>
                </div>
              ))}
            </div>
            <div className="pipeline-stat-row">
              <span className="pipeline-stat-label">Pending Uploads</span>
              <span className="pipeline-stat-value">{pendingCount}</span>
            </div>
            <div className="pipeline-stat-row">
              <span className="pipeline-stat-label">Last Activity</span>
              <span className="pipeline-stat-date">{lastActivityDate}</span>
            </div>
          </div>

          {/* Right: Upload Card */}
          <div className="card">
            <div className="card-header">
              <CloudUpload className="card-header-icon-svg" />
              <h3>Upload Report</h3>
            </div>

            <ReportTypeSelector selectedType={selectedType} onSelect={handleTypeSelect} />

            <div style={{ marginTop: 'var(--space-5)' }}>
              <p className="section-label">File</p>
              <FileDropZone
                selectedType={selectedType}
                file={file}
                onFileSelect={handleFileSelect}
                onFileRemove={handleFileRemove}
                sha256={sha256}
                isHashing={isHashing}
                isDuplicate={isDuplicate}
                duplicateInfo={duplicateInfo}
                renamedFileName={renamedFileName}
                onRetryProcessing={handleRunProcessing}
                isProcessingPipeline={isProcessingPipeline}
              />
            </div>

            <button
              className="upload-btn"
              onClick={handleUpload}
              disabled={!canUpload}
              type="button"
            >
              {isUploading ? (
                <><div className="spinner" />Uploading…</>
              ) : (
                <><UploadCloud style={{ width: '14px', height: '14px' }} /> Upload to Raw Layer</>
              )}
            </button>

            {isUploading && <UploadProgress progress={uploadProgress} step={uploadStep} />}

            {uploadResult?.success && (
              <div className="upload-success">
                <CheckCircle2 style={{ width: 16, height: 16, color: 'var(--positive)', strokeWidth: 1.8 }} />
                <div className="success-text">
                  <strong>Upload successful!</strong>
                  {uploadResult.message}
                </div>
              </div>
            )}

            {uploadResult && !uploadResult.success && !isDuplicate && (
              <div className="duplicate-warning" style={{ background: 'var(--negative-soft)', borderColor: 'var(--negative)' }}>
                <XCircle style={{ width: 16, height: 16, color: 'var(--negative)', strokeWidth: 1.8 }} />
                <div className="warning-text">
                  <strong>Upload failed</strong>
                  {uploadResult.message}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Run Processing Card */}
        <div className="run-processing-card">
          <div className="run-processing-header">
            <div className="run-processing-title-group">
              <div className="run-processing-icon-box">
                <Sparkles className="run-processing-icon" />
              </div>
              <div>
                <h2>Run Processing</h2>
                <p className="run-processing-subtext">
                  Execute the Medallion pipeline — raw → dimensions → facts → gold.
                </p>
              </div>
            </div>

            <div className="run-processing-metrics">
              <div className="metric-item">
                <span className="metric-label">Status</span>
                <span className={`status-pill ${statusPill.cls}`}>
                  <span className="status-dot-inline" />
                  {statusPill.label}
                </span>
              </div>
              <div className="metric-item">
                <span className="metric-label">Pending</span>
                <span className="metric-value">{pendingCount}</span>
              </div>
              <div className="metric-item">
                <span className="metric-label">Last Run</span>
                <span className="metric-value-sub">{lastActivityDate}</span>
              </div>
            </div>
          </div>

          <button
            className={`run-processing-btn ${isProcessingPipeline ? 'processing' : ''}`}
            onClick={handleRunProcessing}
            disabled={isProcessingPipeline}
            type="button"
          >
            {isProcessingPipeline ? (
              <><div className="spinner white" /><span>Processing Pipeline…</span></>
            ) : (
              <><Play className="play-icon-filled" /><span>Run Processing</span></>
            )}
          </button>

          <div className="pipeline-progress-wrapper">
            <div className="pipeline-progress-header">
              <div className="pipeline-progress-title">
                <Activity className="activity-icon-sm" />
                <span>Pipeline Progress</span>
                {pipelineResult?.runTime && (
                  <span className="run-timestamp">· Run at {pipelineResult.runTime}</span>
                )}
              </div>
              {pipelineResult?.output && (
                <button type="button" className="logs-toggle-btn" onClick={() => setShowLogs(!showLogs)}>
                  <Terminal style={{ width: 13, height: 13 }} />
                  <span>Logs</span>
                  {showLogs ? <ChevronUp style={{ width: 13, height: 13 }} /> : <ChevronDown style={{ width: 13, height: 13 }} />}
                </button>
              )}
            </div>

            <div className="pipeline-progress-bar-container">
              <div className="pipeline-progress-bar-fill" style={{
                width: `${progressPct}%`,
              }} />
            </div>

            <div className="pipeline-steps-list">
              {PIPELINE_STEPS.map(({ step, name, desc }, i) => {
                const done = stageIndex > i;
                const current = stageIndex === i && runActive;
                const failed = stageIndex === i && runStatus === 'failed';
                return (
                  <div className="pipeline-step-item" key={step}>
                    <div className="step-icon-status">
                      {failed ? (
                        <XCircle className="step-check-icon" style={{ color: 'var(--negative)' }} />
                      ) : current ? (
                        <div className="spinner dark-sm" />
                      ) : done ? (
                        <CheckCircle2 className="step-check-icon" />
                      ) : (
                        <div className="step-dot-empty" />
                      )}
                    </div>
                    <div className="step-details">
                      <span className="step-name">{name}</span>
                      <span className="step-desc">{desc}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {runStatus === 'queued' && !pipelineRun?.stage && (
              <p className="run-processing-subtext" style={{ marginTop: 'var(--space-3)' }}>
                Waiting for a GitHub Actions runner to start…
              </p>
            )}
            {runStatus === 'failed' && pipelineResult?.message && (
              <p className="run-processing-subtext" style={{ marginTop: 'var(--space-3)', color: 'var(--negative)' }}>
                {pipelineResult.message}
              </p>
            )}

            {showLogs && pipelineResult?.output && (
              <div className="pipeline-logs-box">
                <pre>{pipelineResult.output}</pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default function UploadPage() {
  return (
    <RequireAuth>
      <UploadPageContent />
    </RequireAuth>
  );
}
