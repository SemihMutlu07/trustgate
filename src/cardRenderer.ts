import pc from 'picocolors';
import type { EvidenceCard } from './types.js';

/**
 * Formats and renders the Evidence Card in the terminal with colored indicators.
 */
export function renderTerminalCard(card: EvidenceCard): string {
  const isSuccess = card.status === 'COMPLETED_VERIFIED';
  const statusColor = isSuccess ? pc.green(pc.bold('● COMPLETED & VERIFIED')) : pc.red(pc.bold(`● ${card.status}`));
  const testBadge = card.verification.verified
    ? pc.green(`PASSED (exit 0 in ${card.verification.executionTimeMs}ms)`)
    : pc.red(`FAILED (exit ${card.verification.exitCode})`);

  const violationCount = card.violationsBlocked.length;
  const violationBadge = violationCount === 0
    ? pc.green('0 Violations')
    : pc.yellow(`${violationCount} BLOCKED (Attempts neutralised)`);

  const lines: string[] = [
    pc.cyan('┌────────────────────────────────────────────────────────────────────────┐'),
    pc.cyan('│') + pc.bold('                       AGENT TRUST GATE EVIDENCE CARD                   ') + pc.cyan('│'),
    pc.cyan('├────────────────────────────────────────────────────────────────────────┤'),
    `${pc.cyan('│')} ${pc.bold('Task ID:')}        ${card.taskId.padEnd(54)} ${pc.cyan('│')}`,
    `${pc.cyan('│')} ${pc.bold('Intent:')}         ${card.intent.slice(0, 54).padEnd(54)} ${pc.cyan('│')}`,
    `${pc.cyan('│')} ${pc.bold('Status:')}         ${statusColor.padEnd(64)} ${pc.cyan('│')}`,
    pc.cyan('├────────────────────────────────────────────────────────────────────────┤'),
    `${pc.cyan('│')} ${pc.bold('Independent Test:')} ${testBadge.padEnd(60)} ${pc.cyan('│')}`,
    `${pc.cyan('│')} ${pc.bold('Policy Defense:')}   ${violationBadge.padEnd(60)} ${pc.cyan('│')}`,
    `${pc.cyan('│')} ${pc.bold('Blast Radius:')}     ${(card.modifiedFiles.length + ' files modified (+ ' + card.totalDiffLines.additions + ' / - ' + card.totalDiffLines.deletions + ' lines)').padEnd(54)} ${pc.cyan('│')}`,
  ];

  if (card.modifiedFiles.length > 0) {
    lines.push(pc.cyan('├────────────────────────────────────────────────────────────────────────┤'));
    lines.push(`${pc.cyan('│')} ${pc.bold('Modified Files:')}                                                        ${pc.cyan('│')}`);
    for (const file of card.modifiedFiles.slice(0, 5)) {
      lines.push(`${pc.cyan('│')}   • ${pc.green(file.padEnd(66))} ${pc.cyan('│')}`);
    }
  }

  if (card.violationsBlocked.length > 0) {
    lines.push(pc.cyan('├────────────────────────────────────────────────────────────────────────┤'));
    lines.push(`${pc.cyan('│')} ${pc.bold(pc.yellow('Blocked Policy Violations:'))}                                             ${pc.cyan('│')}`);
    for (const v of card.violationsBlocked.slice(0, 3)) {
      const detail = `${v.action.type}: ${v.action.path || v.action.command || v.action.url || ''}`;
      lines.push(`${pc.cyan('│')}   🛡️  ${pc.red(detail.slice(0, 64).padEnd(65))} ${pc.cyan('│')}`);
    }
  }

  lines.push(pc.cyan('└────────────────────────────────────────────────────────────────────────┘'));
  return lines.join('\n');
}

/**
 * Generates clean Markdown representation of the Evidence Card for reports & web UI.
 */
export function renderMarkdownCard(card: EvidenceCard): string {
  return `### 🛡️ Agent Trust Gate Evidence Card

* **Task ID:** \`${card.taskId}\`
* **Intent:** ${card.intent}
* **Status:** **\`${card.status}\`**
* **Verification:** ${card.verification.verified ? '✅ PASSED (Independent Gate)' : '❌ FAILED'} (Exit Code: ${card.verification.exitCode}, ${card.verification.executionTimeMs}ms)
* **Policy Violations Blocked:** ${card.violationsBlocked.length}
* **Modified Files:** ${card.modifiedFiles.map(f => `\`${f}\``).join(', ') || 'None'} (+${card.totalDiffLines.additions} / -${card.totalDiffLines.deletions} lines)

${card.violationsBlocked.length > 0 ? `#### ⚠️ Blocked Violations\n` + card.violationsBlocked.map(v => `- 🛡️ **${v.action.type}**: \`${v.action.path || v.action.command || v.action.url}\` (${v.reason})`).join('\n') : ''}
`;
}
