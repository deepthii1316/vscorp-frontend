import { NextResponse } from 'next/server';

export async function POST() {
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
