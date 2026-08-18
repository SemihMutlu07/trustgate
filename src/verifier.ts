import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { VerificationResult } from './types.js';

const execAsync = promisify(exec);

/**
 * Independently executes the declared verification command outside the agent's control.
 */
export async function runVerification(
  verifyCommand: string,
  cwd: string,
  timeoutMs: number = 30000
): Promise<VerificationResult> {
  const startTime = Date.now();

  try {
    const { stdout, stderr } = await execAsync(verifyCommand, {
      cwd,
      timeout: timeoutMs,
      env: { ...process.env, CI: 'true' },
    });

    const executionTimeMs = Date.now() - startTime;
    return {
      verified: true,
      exitCode: 0,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      executionTimeMs,
    };
  } catch (error: any) {
    const executionTimeMs = Date.now() - startTime;
    return {
      verified: false,
      exitCode: error.code ?? 1,
      stdout: (error.stdout ?? '').trim(),
      stderr: (error.stderr ?? error.message ?? '').trim(),
      executionTimeMs,
    };
  }
}
