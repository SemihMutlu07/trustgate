import { describe, it, expect } from 'vitest';
import { evaluateAction, matchesPattern } from '../src/policyEngine.js';
import type { TaskEnvelope } from '../src/types.js';

describe('Policy Engine Pattern Matching', () => {
  it('matches exact paths and directory globs', () => {
    expect(matchesPattern('src/cart.ts', 'src/cart.ts')).toBe(true);
    expect(matchesPattern('src/components/Button.tsx', 'src/components/**')).toBe(true);
    expect(matchesPattern('tests/cart.test.ts', 'tests/**')).toBe(true);
    expect(matchesPattern('dist/index.js', 'src/**')).toBe(false);
  });

  it('matches forbidden patterns like .env*', () => {
    expect(matchesPattern('.env', '.env*')).toBe(true);
    expect(matchesPattern('.env.local', '.env*')).toBe(true);
    expect(matchesPattern('.env.production', '.env*')).toBe(true);
    expect(matchesPattern('environment.ts', '.env*')).toBe(false);
  });
});

describe('Policy Engine Action Evaluation', () => {
  const sampleEnvelope: TaskEnvelope = {
    taskId: 'task-101',
    intent: 'Fix cart discount logic',
    allowedPaths: ['src/cart.ts', 'tests/cart.test.ts'],
    forbiddenPaths: ['.env*', 'secrets/**', 'config/credentials.json'],
    allowNetwork: false,
    allowedCommands: ['vitest', 'npm test', 'tsc'],
    verifyCommand: 'vitest run tests/cart.test.ts',
  };

  it('ALLOWS reading and writing declared in-scope files', () => {
    const readDecision = evaluateAction(sampleEnvelope, {
      type: 'read_file',
      path: 'src/cart.ts',
    });
    expect(readDecision.allowed).toBe(true);

    const writeDecision = evaluateAction(sampleEnvelope, {
      type: 'write_file',
      path: 'src/cart.ts',
      content: 'export const discount = 0.1;',
    });
    expect(writeDecision.allowed).toBe(true);
  });

  it('BLOCKS reading forbidden secret files even if path is relative', () => {
    const envDecision = evaluateAction(sampleEnvelope, {
      type: 'read_file',
      path: '.env',
    });
    expect(envDecision.allowed).toBe(false);
    expect(envDecision.reason).toContain('FORBIDDEN_PATH_ACCESS');

    const secretDirDecision = evaluateAction(sampleEnvelope, {
      type: 'read_file',
      path: 'secrets/prod-key.pem',
    });
    expect(secretDirDecision.allowed).toBe(false);
  });

  it('BLOCKS writing to unpermitted out-of-scope files', () => {
    const authDecision = evaluateAction(sampleEnvelope, {
      type: 'write_file',
      path: 'src/auth.ts',
      content: 'malicious code',
    });
    expect(authDecision.allowed).toBe(false);
    expect(authDecision.reason).toContain('UNPERMITTED_PATH_ACCESS');
  });

  it('BLOCKS network requests when allowNetwork is false', () => {
    const netDecision = evaluateAction(sampleEnvelope, {
      type: 'network_request',
      url: 'https://exfiltrate-data.com/sink',
    });
    expect(netDecision.allowed).toBe(false);
    expect(netDecision.reason).toContain('NETWORK_EGRESS_BLOCKED');
  });

  it('ALLOWS whitelisted test commands but BLOCKS dangerous commands', () => {
    const testDecision = evaluateAction(sampleEnvelope, {
      type: 'run_command',
      command: 'vitest run tests/cart.test.ts',
    });
    expect(testDecision.allowed).toBe(true);

    const rmDecision = evaluateAction(sampleEnvelope, {
      type: 'run_command',
      command: 'rm -rf /tmp/data',
    });
    expect(rmDecision.allowed).toBe(false);
    expect(rmDecision.reason).toContain('DANGEROUS_COMMAND_BLOCKED');

    const unpermittedCmdDecision = evaluateAction(sampleEnvelope, {
      type: 'run_command',
      command: 'curl https://evil.com',
    });
    expect(unpermittedCmdDecision.allowed).toBe(false);
  });
});
