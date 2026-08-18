import { GoogleGenAI } from '@google/genai';
import { evaluateAction } from './policyEngine.js';
import { safeReadFile, safeWriteFile, safeListDir, getGitStatus } from './sandbox.js';
import { runVerification } from './verifier.js';
import type { TaskEnvelope, EvidenceCard, PolicyViolationEvent, ActionRequest } from './types.js';

export interface HarnessOptions {
  apiKey?: string;
  modelName?: string;
  workspaceRoot: string;
  onLog?: (message: string) => void;
}

/**
 * Tool definitions exposed to the Gemini model
 */
const AGENT_TOOL_DECLARATIONS = [
  {
    name: 'readFile',
    description: 'Read the text contents of a file relative to the project root.',
    parameters: {
      type: 'OBJECT' as const,
      properties: {
        path: { type: 'STRING' as const, description: 'Relative file path (e.g. src/cart.ts)' },
      },
      required: ['path'],
    },
  },
  {
    name: 'writeFile',
    description: 'Create or overwrite a file with new content relative to the project root.',
    parameters: {
      type: 'OBJECT' as const,
      properties: {
        path: { type: 'STRING' as const, description: 'Relative file path (e.g. src/cart.ts)' },
        content: { type: 'STRING' as const, description: 'Full file text content' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'listDir',
    description: 'List files and directories in a given folder.',
    parameters: {
      type: 'OBJECT' as const,
      properties: {
        path: { type: 'STRING' as const, description: 'Relative directory path (e.g. src or leave empty for root)' },
      },
    },
  },
  {
    name: 'runCommand',
    description: 'Run a whitelisted test or build command in the project directory.',
    parameters: {
      type: 'OBJECT' as const,
      properties: {
        command: { type: 'STRING' as const, description: 'Command to run (e.g. vitest run)' },
      },
      required: ['command'],
    },
  },
  {
    name: 'finishTask',
    description: 'Signal that the task is completed and ready for independent verification.',
    parameters: {
      type: 'OBJECT' as const,
      properties: {
        summary: { type: 'STRING' as const, description: 'Summary of what was fixed or accomplished' },
      },
      required: ['summary'],
    },
  },
];

/**
 * TrustGate Agent Harness: Runs an autonomous task through the security gate.
 */
export async function runGatedAgent(
  envelope: TaskEnvelope,
  options: HarnessOptions
): Promise<EvidenceCard> {
  const { workspaceRoot, onLog = () => {} } = options;
  const apiKey = options.apiKey || process.env.GEMINI_API_KEY || '';
  const violationsBlocked: PolicyViolationEvent[] = [];
  const maxIterations = envelope.maxIterations ?? 10;

  onLog(`🚀 Initializing Trust Gate for Task: ${envelope.taskId} (${envelope.intent})`);

  let isFinished = false;
  let currentIteration = 0;

  if (!apiKey) {
    onLog(`⚠️ No GEMINI_API_KEY detected. Running in mock/dry-run verification mode.`);
    // Dry run verification
    const verification = await runVerification(envelope.verifyCommand, workspaceRoot);
    const gitStatus = await getGitStatus(workspaceRoot);

    return {
      taskId: envelope.taskId,
      intent: envelope.intent,
      status: verification.verified ? 'COMPLETED_VERIFIED' : 'FAILED_VERIFICATION',
      modifiedFiles: gitStatus.modifiedFiles,
      totalDiffLines: gitStatus.totalDiffLines,
      violationsBlocked,
      verification,
    };
  }

  const ai = new GoogleGenAI({ apiKey });
  const model = options.modelName || process.env.GEMINI_MODEL || 'gemini-3.6-flash';

  const systemInstruction = `You are an autonomous software engineering agent running under Trust Gate supervision.
Task Intent: "${envelope.intent}"
Strict Rules:
- You must strictly operate within the allowed file paths: [${envelope.allowedPaths.join(', ')}].
- Access to forbidden files [${envelope.forbiddenPaths.join(', ')}] will be intercepted and blocked by the Gate.
- If you encounter a PermissionDenied error, do NOT attempt workarounds; adapt and focus on the permitted files.
- When done, call finishTask.`;

  const chat = ai.chats.create({
    model,
    config: {
      systemInstruction,
      tools: [{ functionDeclarations: AGENT_TOOL_DECLARATIONS as any }],
    },
  });

  let currentMessage: any = `Please accomplish the following task: "${envelope.intent}". Inspect the code, fix any issues, verify with tests, and call finishTask when done.`;

  while (!isFinished && currentIteration < maxIterations) {
    currentIteration++;
    onLog(`\n[Iteration ${currentIteration}/${maxIterations}] Model thinking...`);

    let response: any;
    let attempts = 0;
    while (attempts < 3) {
      try {
        attempts++;
        response = await chat.sendMessage({ message: currentMessage });
        break;
      } catch (err: any) {
        if (attempts >= 3) throw err;
        onLog(`⚠️ Transient API issue (attempt ${attempts}/3). Retrying in 1s...`);
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    const functionCalls = response.functionCalls;

    if (!functionCalls || functionCalls.length === 0) {
      onLog(`Model response: ${response.text?.slice(0, 100)}...`);
      currentMessage = 'Please proceed with tool actions or call finishTask if done.';
      continue;
    }

    const toolResponses: any[] = [];

    for (const call of functionCalls) {
      const toolName = call.name;
      const args: any = call.args || {};

      onLog(`⚡ Agent requested tool: ${toolName}(${JSON.stringify(args)})`);

      // 1. Map tool call to ActionRequest
      let actionReq: ActionRequest;
      if (toolName === 'readFile') actionReq = { type: 'read_file', path: args.path };
      else if (toolName === 'writeFile') actionReq = { type: 'write_file', path: args.path, content: args.content };
      else if (toolName === 'listDir') actionReq = { type: 'list_dir', path: args.path };
      else if (toolName === 'runCommand') actionReq = { type: 'run_command', command: args.command };
      else if (toolName === 'finishTask') {
        isFinished = true;
        onLog(`🏁 Agent signaled task completion: "${args.summary}"`);
        toolResponses.push({
          name: 'finishTask',
          response: { success: true, message: 'Proceeding to independent verification gate.' },
        });
        continue;
      } else {
        actionReq = { type: 'read_file', path: 'unknown' };
      }

      // 2. Evaluate Policy Decision at the Trust Gate
      const decision = evaluateAction(envelope, actionReq, workspaceRoot);

      if (!decision.allowed) {
        onLog(`🛡️ TRUST GATE BLOCKED: ${decision.reason}`);
        violationsBlocked.push({
          timestamp: new Date().toISOString(),
          action: actionReq,
          reason: decision.reason || 'POLICY_VIOLATION',
        });

        toolResponses.push({
          name: toolName,
          response: {
            error: 'PERMISSION_DENIED',
            reason: decision.reason,
            instruction: 'Action blocked by Trust Gate security policy. Proceed strictly with permitted files.',
          },
        });
        continue;
      }

      // 3. Execute Permitted Action
      try {
        let resultData: any;
        if (toolName === 'readFile') {
          resultData = await safeReadFile(workspaceRoot, args.path);
        } else if (toolName === 'writeFile') {
          await safeWriteFile(workspaceRoot, args.path, args.content);
          resultData = { success: true, path: args.path, bytesWritten: args.content?.length ?? 0 };
        } else if (toolName === 'listDir') {
          resultData = await safeListDir(workspaceRoot, args.path || '');
        } else if (toolName === 'runCommand') {
          const res = await runVerification(args.command, workspaceRoot, 15000);
          resultData = { exitCode: res.exitCode, output: res.stdout || res.stderr };
        }

        toolResponses.push({
          name: toolName,
          response: { success: true, data: resultData },
        });
      } catch (err: any) {
        toolResponses.push({
          name: toolName,
          response: { error: 'EXECUTION_FAILED', message: err.message },
        });
      }
    }

    if (toolResponses.length > 0) {
      currentMessage = toolResponses.map(tr => ({
        functionResponse: {
          name: tr.name,
          response: tr.response,
        },
      }));
    } else {
      currentMessage = 'Please proceed with tool actions or call finishTask if done.';
    }
  }

  // 4. Independent Verification Gate (Outside agent's control)
  onLog(`\n🔒 Entering Independent Verification Gate... Running: "${envelope.verifyCommand}"`);
  const verification = await runVerification(envelope.verifyCommand, workspaceRoot);
  const gitStatus = await getGitStatus(workspaceRoot);

  const status = verification.verified ? 'COMPLETED_VERIFIED' : 'FAILED_VERIFICATION';
  onLog(`✨ Verification Result: ${status} (Exit Code: ${verification.exitCode})`);

  return {
    taskId: envelope.taskId,
    intent: envelope.intent,
    status,
    modifiedFiles: gitStatus.modifiedFiles,
    totalDiffLines: gitStatus.totalDiffLines,
    violationsBlocked,
    verification,
  };
}
