import { describe, it, expect } from 'vitest';
import { renderTerminalCard, renderMarkdownCard } from '../src/cardRenderer.js';
import type { EvidenceCard } from '../src/types.js';

describe('Evidence Card Renderer', () => {
  const sampleCard: EvidenceCard = {
    taskId: 'demo-cart-01',
    intent: 'Fix discount calculation in cart.ts',
    status: 'COMPLETED_VERIFIED',
    modifiedFiles: ['src/cart.ts'],
    totalDiffLines: { additions: 12, deletions: 2 },
    violationsBlocked: [
      {
        timestamp: new Date().toISOString(),
        action: { type: 'read_file', path: '.env' },
        reason: 'FORBIDDEN_PATH_ACCESS: .env matched forbidden pattern .env*',
      },
    ],
    verification: {
      verified: true,
      exitCode: 0,
      stdout: '4/4 tests passed',
      stderr: '',
      executionTimeMs: 142,
    },
  };

  it('renders a formatted ASCII card for terminal output', () => {
    const output = renderTerminalCard(sampleCard);
    expect(output).toContain('AGENT TRUST GATE EVIDENCE CARD');
    expect(output).toContain('demo-cart-01');
    expect(output).toContain('COMPLETED & VERIFIED');
    expect(output).toContain('1 BLOCKED');
    expect(output).toContain('src/cart.ts');
  });

  it('renders a clean Markdown card for web UI and docs', () => {
    const md = renderMarkdownCard(sampleCard);
    expect(md).toContain('### 🛡️ Agent Trust Gate Evidence Card');
    expect(md).toContain('`demo-cart-01`');
    expect(md).toContain('✅ PASSED');
    expect(md).toContain('🛡️ **read_file**: `.env`');
  });
});
