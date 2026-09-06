import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const REPO_OWNER = process.env.GITHUB_REPO_OWNER || 'deepthii1316';
    const REPO_NAME  = process.env.GITHUB_REPO_NAME  || 'vscorp-frontend';
    const WORKFLOW_ID = 'run-pipeline.yml';

    if (!GITHUB_TOKEN) {
      return NextResponse.json(
        {
          success: false,
          error: 'GITHUB_TOKEN secret not configured. Add it to Vercel environment variables.',
        },
        { status: 500 }
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
      const error = await response.json().catch(() => ({}));
      console.error('GitHub API error:', error);
      return NextResponse.json(
        {
          success: false,
          error: `GitHub API error: ${response.status} ${response.statusText}`,
          details: error.message || '',
        },
        { status: 500 }
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
      },
      { status: 500 }
    );
  }
}
