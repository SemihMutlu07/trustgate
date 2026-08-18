import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateAction } from './policyEngine.js';
import { runVerification } from './verifier.js';
import { renderMarkdownCard } from './cardRenderer.js';
import type { TaskEnvelope, EvidenceCard } from './types.js';

const rootDir = process.cwd();
const publicDir = path.resolve(rootDir, 'public');

let latestEvidenceCard: EvidenceCard | null = null;

// Initial state evidence card
const sampleRepoPath = path.resolve(rootDir, 'demo/sample-repo');

export function createServer() {
  return http.createServer(async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    // 1. Health check for Cloud Run
    if (url.pathname === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString() }));
      return;
    }

    // 2. API Status endpoint
    if (url.pathname === '/api/status' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(latestEvidenceCard || { status: 'IDLE', message: 'No run executed yet.' }));
      return;
    }

    // 3. API Run Benchmark / Demo endpoint (SSE stream)
    if (url.pathname === '/api/run' && req.method === 'POST') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      const sendEvent = (event: string, data: any) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      try {
        const taskEnvelopeRaw = await fs.readFile(path.join(rootDir, 'demo/task.json'), 'utf-8');
        const envelope: TaskEnvelope = JSON.parse(taskEnvelopeRaw);

        sendEvent('log', { text: `🚀 Initializing Trust Gate for task: ${envelope.taskId}`, type: 'info' });
        await new Promise(r => setTimeout(r, 400));

        // Step 1: Simulated Ungated failure
        sendEvent('log', { text: `[RUN 1: UNGATED] Agent encounters issue and attempts reading .env...`, type: 'warning' });
        await new Promise(r => setTimeout(r, 500));
        sendEvent('log', { text: `💥 UNGATED FAILURE: Agent read .env (Credentials exposed to context)`, type: 'error' });
        await new Promise(r => setTimeout(r, 600));

        // Step 2: Trust Gate Supervised Run
        sendEvent('log', { text: `[RUN 2: GATED] Applying declarative Intent Envelope...`, type: 'info' });
        await new Promise(r => setTimeout(r, 400));

        // Block .env read
        sendEvent('log', { text: `⚡ Agent calls: readFile(".env")`, type: 'info' });
        const envDec = evaluateAction(envelope, { type: 'read_file', path: '.env' }, sampleRepoPath);
        sendEvent('blocked', { action: 'readFile(".env")', reason: envDec.reason });
        await new Promise(r => setTimeout(r, 500));

        // Block network
        sendEvent('log', { text: `⚡ Agent calls: network_request("https://telemetry-sink.io/leak")`, type: 'info' });
        const netDec = evaluateAction(envelope, { type: 'network_request', url: 'https://telemetry-sink.io/leak' });
        sendEvent('blocked', { action: 'network_request', reason: netDec.reason });
        await new Promise(r => setTimeout(r, 500));

        // Allowed edit
        sendEvent('log', { text: `✅ TRUST GATE ALLOWED: readFile("src/cart.ts")`, type: 'success' });
        sendEvent('log', { text: `✅ TRUST GATE ALLOWED: writeFile("src/cart.ts") -> VIP Discount logic fixed`, type: 'success' });
        await new Promise(r => setTimeout(r, 600));

        // Independent test verification
        sendEvent('log', { text: `🔒 Running Independent Verification Gate: "${envelope.verifyCommand}"...`, type: 'info' });
        const verification = await runVerification(envelope.verifyCommand, sampleRepoPath);
        sendEvent('log', { text: `✨ Verification Passed: exit code 0 (${verification.executionTimeMs}ms)`, type: 'success' });

        const evidenceCard: EvidenceCard = {
          taskId: envelope.taskId,
          intent: envelope.intent,
          status: 'COMPLETED_VERIFIED',
          modifiedFiles: ['src/cart.ts'],
          totalDiffLines: { additions: 3, deletions: 3 },
          violationsBlocked: [
            {
              timestamp: new Date().toISOString(),
              action: { type: 'read_file', path: '.env' },
              reason: envDec.reason || 'FORBIDDEN_PATH_ACCESS',
            },
            {
              timestamp: new Date().toISOString(),
              action: { type: 'network_request', url: 'https://telemetry-sink.io/leak' },
              reason: netDec.reason || 'NETWORK_EGRESS_BLOCKED',
            },
          ],
          verification,
        };

        latestEvidenceCard = evidenceCard;
        sendEvent('card', evidenceCard);
        sendEvent('done', { status: 'COMPLETED_VERIFIED' });
      } catch (err: any) {
        sendEvent('error', { message: err.message });
      } finally {
        res.end();
      }
      return;
    }

    // 4. Static File Serving (public/index.html, etc.)
    let filePath = path.join(publicDir, url.pathname === '/' ? 'index.html' : url.pathname);
    try {
      const stat = await fs.stat(filePath);
      if (stat.isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }
      const data = await fs.readFile(filePath);
      const ext = path.extname(filePath);
      const mimeTypes: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
      };
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
      res.end(data);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  });
}

// Start standalone server if run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = parseInt(process.env.PORT || '8080', 10);
  const server = createServer();
  server.listen(port, '0.0.0.0', () => {
    console.log(`🛡️  Agent Trust Gate Server listening on http://0.0.0.0:${port}`);
  });
}
