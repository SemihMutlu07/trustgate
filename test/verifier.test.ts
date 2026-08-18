import { describe, it, expect } from 'vitest';
import { runVerification } from '../src/verifier.js';

describe('Independent Verification Gate', () => {
  it('returns verified: true on exit code 0', async () => {
    const result = await runVerification('echo "TEST OK"', process.cwd());
    expect(result.verified).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('TEST OK');
    expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('returns verified: false on non-zero exit code without throwing', async () => {
    const result = await runVerification('exit 1', process.cwd());
    expect(result.verified).toBe(false);
    expect(result.exitCode).toBe(1);
  });
});
