import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);


export async function POST() {
  try {
    const workspaceRoot = path.resolve(process.cwd(), '..');
    const pipelineDir = path.join(workspaceRoot, 'pipeline');
    const scriptPath = path.join(pipelineDir, 'run_pipeline.py');

    // Use .venv Python for reproducibility & portability (has all required packages)
    // Falls back to system python if .venv doesn't exist
    let venvPython;
    const venvCandidate = path.join(pipelineDir, '.venv', 'Scripts', 'python.exe');
    try {
      require('fs').accessSync(venvCandidate);
      venvPython = venvCandidate;
    } catch {
      venvPython = 'python';
    }

    // Forward env vars to the Python process so it can find SUPABASE_DB_URL, etc.
    const childEnv = { ...process.env };

    console.log('Triggering batch processing pipeline script:', scriptPath);
    console.log('Using Python:', venvPython);

    // Execute python pipeline/run_pipeline.py
    const { stdout, stderr } = await execAsync(`"${venvPython}" "${scriptPath}"`, {
      cwd: pipelineDir,
      timeout: 600000, // 10 minute timeout to prevent infinite hang
      env: childEnv,
    });

    console.log('Pipeline stdout:', stdout);
    if (stderr) console.warn('Pipeline stderr:', stderr);

    return NextResponse.json({
      success: true,
      message: 'Batch processing pipeline executed successfully.',
      output: stdout,
    });
  } catch (error) {
    console.error('Process API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Pipeline execution failed',
        details: error.killed ? 'Process timed out after 10 minutes' : '',
        stderr: error.stderr || '',
      },
      { status: 500 }
    );
  }
}
