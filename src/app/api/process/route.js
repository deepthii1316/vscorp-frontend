import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireAuth } from '@/middleware/auth';

async function legacyPOST() {
  try {
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.MEDALLION_GITHUB_TOKEN;
    const REPO_OWNER = process.env.GITHUB_REPO_OWNER || 'deepthii1316';
    const REPO_NAME  = process.env.GITHUB_REPO_NAME  || 'vscorp-frontend';
    const WORKFLOW_ID = 'run-pipeline.yml';

    if (!GITHUB_TOKEN) {
      return NextResponse.json(
        {
          success: false,
          error: 'Pipeline is not configured: GITHUB_TOKEN is missing from the deployed environment.',
        },
        { status: 503 }
      );
    }

    // Trigger GitHub Actions workflow_dispatch
    const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${WORKFLOW_ID}/dispatches`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: {},
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let error = {};
      try {
        error = errorText ? JSON.parse(errorText) : {};
      } catch {
        error = { message: errorText };
      }
      console.error('GitHub API error:', error);
      return NextResponse.json(
        {
          success: false,
          error: `GitHub API error: ${response.status} ${response.statusText}`,
          details: error.message || error.documentation_url || 'Workflow dispatch was rejected. Check token Actions: write permission and repository name.',
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Pipeline triggered successfully. Check the Actions tab on GitHub for status.',
      output: `Workflow dispatched at ${new Date().toISOString()} — monitor progress in GitHub Actions.`,
    });
  } catch (error) {
    console.error('Process API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to trigger pipeline',
        details: 'Check the deployed Supabase and GitHub Actions environment variables.',
      },
      { status: 503 }
    );
  }
}

export async function POST(request) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;

  try {
    const token = process.env.GITHUB_TOKEN || process.env.MEDALLION_GITHUB_TOKEN;
    const owner = process.env.GITHUB_REPO_OWNER || 'deepthii1316';
    const repo = process.env.GITHUB_REPO_NAME || 'vscorp-frontend';
    if (!token) {
      return NextResponse.json({ error: 'GITHUB_TOKEN is not configured.' }, { status: 503 });
    }

    const supabase = createServerClient();
    const { data, error } = await supabase.rpc('claim_processing_run', { p_created_by: null });
    if (error) throw new Error(`Could not claim queued uploads: ${error.message}`);
    const run = data?.[0];
    if (!run) throw new Error('Could not create a processing run.');

    if (run.already_active) {
      return NextResponse.json({
        success: true,
        accepted: true,
        alreadyRunning: true,
        runId: run.run_id,
        status: run.run_status,
        uploadCount: run.upload_count,
      }, { status: 202 });
    }
    if (run.upload_count === 0) {
      return NextResponse.json({
        success: true,
        accepted: true,
        runId: run.run_id,
        status: 'completed',
        uploadCount: 0,
      });
    }

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/workflows/run-pipeline.yml/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({ ref: 'main', inputs: { run_id: run.run_id } }),
      }
    );

    if (!response.ok) {
      const details = await response.text();
      await supabase.rpc('release_processing_run', {
        p_run_id: run.run_id,
        p_error_message: `GitHub dispatch failed: ${response.status} ${details.slice(0, 3000)}`,
      });
      return NextResponse.json({
        error: 'The worker could not be dispatched. The uploads were returned to the queue.',
        details,
      }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      accepted: true,
      runId: run.run_id,
      status: 'queued',
      uploadCount: run.upload_count,
      message: 'Processing is queued. Use the returned run ID to retrieve actual completion status.',
    }, { status: 202 });
  } catch (error) {
    console.error('Process API error:', error);
    return NextResponse.json({ error: error.message || 'Failed to queue processing.' }, { status: 500 });
  }
}

export async function GET(request) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;

  let runId = new URL(request.url).searchParams.get('runId');
  const supabase = createServerClient();

  // No runId: report the latest in-flight run (if any) so a reloaded page can
  // resume showing live progress.
  if (!runId) {
    const { data: active, error: activeError } = await supabase
      .from('processing_runs')
      .select('id')
      .in('status', ['queued', 'processing'])
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (activeError) return NextResponse.json({ error: activeError.message }, { status: 500 });
    if (!active) return NextResponse.json({ run: null, uploads: [] });
    runId = active.id;
  }

  const [{ data: run, error: runError }, { data: uploads, error: uploadsError }] = await Promise.all([
    supabase.from('processing_runs').select('*').eq('id', runId).single(),
    supabase.from('upload_audit_log')
      .select('id, original_file_name, report_type, status, row_count, error_message, uploaded_at')
      .eq('processing_run_id', runId)
      .order('uploaded_at'),
  ]);
  if (runError || !run) {
    return NextResponse.json({ error: runError?.message || 'Processing run not found.' }, { status: 404 });
  }
  if (uploadsError) return NextResponse.json({ error: uploadsError.message }, { status: 500 });
  return NextResponse.json({ run, uploads: uploads || [] });
}
