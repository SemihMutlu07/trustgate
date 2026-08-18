/**
 * Agent Trust Gate - Core Type Definitions
 */

export interface TaskEnvelope {
  /** Task identifier */
  taskId: string;
  /** Human-readable intent */
  intent: string;
  /** Glob patterns of paths the agent is explicitly allowed to read/write */
  allowedPaths: string[];
  /** Glob patterns of paths strictly forbidden from read/write (e.g. ['.env*', 'secrets/**']) */
  forbiddenPaths: string[];
  /** Whether outbound network access is permitted */
  allowNetwork: boolean;
  /** Whitelisted commands the agent can execute (e.g. ['vitest', 'npm test', 'tsc']) */
  allowedCommands?: string[];
  /** Command to independently verify task completion (run by Gate, not LLM) */
  verifyCommand: string;
  /** Maximum number of tool iterations allowed */
  maxIterations?: number;
}

export type ActionType = 'read_file' | 'write_file' | 'list_dir' | 'run_command' | 'network_request';

export interface ActionRequest {
  type: ActionType;
  path?: string;
  command?: string;
  url?: string;
  content?: string;
}

export interface PolicyDecision {
  allowed: boolean;
  reason?: string;
  ruleMatched?: string;
}

export interface PolicyViolationEvent {
  timestamp: string;
  action: ActionRequest;
  reason: string;
}

export interface VerificationResult {
  verified: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  executionTimeMs: number;
}

export interface EvidenceCard {
  taskId: string;
  intent: string;
  status: 'COMPLETED_VERIFIED' | 'FAILED_VERIFICATION' | 'BLOCKED_POLICY' | 'EXECUTION_ERROR';
  modifiedFiles: string[];
  totalDiffLines: { additions: number; deletions: number };
  violationsBlocked: PolicyViolationEvent[];
  verification: VerificationResult;
  tokenTelemetry?: {
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
  };
}
