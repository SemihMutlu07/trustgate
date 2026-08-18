import fs from 'node:fs/promises';
import path from 'node:path';
import { runGatedAgent } from '../src/harness.js';
import { renderTerminalCard, renderMarkdownCard } from '../src/cardRenderer.js';
import type { TaskEnvelope } from '../src/types.js';

async function main() {
  const args = process.argv.slice(2);
  const envelopePath = args[0] || 'demo/task.json';
  const workspaceRoot = args[1] || path.resolve(process.cwd(), 'demo/sample-repo');

  console.log(`\n🛡️  Starting Agent Trust Gate CLI`);
  console.log(`Envelope:  ${envelopePath}`);
  console.log(`Workspace: ${workspaceRoot}\n`);

  try {
    const envelopeRaw = await fs.readFile(path.resolve(process.cwd(), envelopePath), 'utf-8');
    const envelope: TaskEnvelope = JSON.parse(envelopeRaw);

    const evidence = await runGatedAgent(envelope, {
      workspaceRoot,
      onLog: (msg) => console.log(msg),
    });

    console.log('\n' + renderTerminalCard(evidence) + '\n');

    // Write evidence card artifact to workspace
    const artifactPath = path.resolve(workspaceRoot, 'EVIDENCE.md');
    await fs.writeFile(artifactPath, renderMarkdownCard(evidence), 'utf-8');
    console.log(`📄 Evidence card artifact written to: ${artifactPath}\n`);

    if (evidence.status !== 'COMPLETED_VERIFIED') {
      process.exit(1);
    }
  } catch (err: any) {
    console.error(`❌ Execution failed:`, err.message);
    process.exit(1);
  }
}

main();
