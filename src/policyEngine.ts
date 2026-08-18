import path from 'node:path';
import type { ActionRequest, PolicyDecision, TaskEnvelope } from './types.js';

/**
 * Simple glob-like pattern matcher (supports '*', '**', and exact matching)
 */
export function matchesPattern(targetPath: string, pattern: string): boolean {
  const normalizedTarget = targetPath.replace(/^\.\//, '').replace(/\\/g, '/');
  const normalizedPattern = pattern.replace(/^\.\//, '').replace(/\\/g, '/');

  if (normalizedPattern === '*' || normalizedPattern === '**' || normalizedPattern === '**/*') {
    return true;
  }

  // Exact match
  if (normalizedTarget === normalizedPattern) {
    return true;
  }

  // Prefix directory match with **
  if (normalizedPattern.endsWith('/**')) {
    const dirPrefix = normalizedPattern.slice(0, -3);
    return normalizedTarget === dirPrefix || normalizedTarget.startsWith(dirPrefix + '/');
  }

  // Basename extension match (e.g. *.ts, .env*)
  if (normalizedPattern.startsWith('*.')) {
    const ext = normalizedPattern.slice(1);
    return normalizedTarget.endsWith(ext);
  }

  if (normalizedPattern.includes('*')) {
    const regexPattern = '^' + normalizedPattern.replace(/\./g, '\\.').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$';
    return new RegExp(regexPattern).test(normalizedTarget);
  }

  // Path starts with pattern directory
  return normalizedTarget.startsWith(normalizedPattern);
}

/**
 * Normalizes a file path relative to the workspace root
 */
export function normalizeWorkspacePath(filePath: string, workspaceRoot: string = ''): string {
  let relative = filePath;
  if (workspaceRoot && path.isAbsolute(filePath)) {
    relative = path.relative(workspaceRoot, filePath);
  }
  return relative.replace(/^\.\//, '').replace(/\\/g, '/');
}

/**
 * Dangerous command patterns that should always be blocked in autonomous runs
 */
const DANGEROUS_COMMAND_PATTERNS = [
  /\brm\s+-rf\s+[\/~]/i,
  /\bDROP\s+DATABASE\b/i,
  /\bDROP\s+TABLE\b/i,
  /\bgcloud\s+projects\s+delete\b/i,
  /\bcurl\b.*\|\s*bash\b/i,
  /\bwget\b.*\|\s*bash\b/i,
  /\bcat\s+.*\.env\b/i,
];

/**
 * Evaluates whether an agent's requested action is permitted under the declared TaskEnvelope.
 */
export function evaluateAction(envelope: TaskEnvelope, action: ActionRequest, workspaceRoot: string = ''): PolicyDecision {
  // 1. Network Request Evaluation
  if (action.type === 'network_request') {
    if (!envelope.allowNetwork) {
      return {
        allowed: false,
        reason: 'NETWORK_EGRESS_BLOCKED: Outbound network access is disabled for this task.',
        ruleMatched: 'allowNetwork: false',
      };
    }
    return { allowed: true };
  }

  // 2. File Read / Write / List Evaluation
  if (action.type === 'read_file' || action.type === 'write_file' || action.type === 'list_dir') {
    if (!action.path) {
      return { allowed: false, reason: 'PATH_MISSING: Path must be specified for file operations.' };
    }

    const normPath = normalizeWorkspacePath(action.path, workspaceRoot);

    // Check Forbidden Paths First (Blacklist takes absolute priority)
    for (const forbiddenPattern of envelope.forbiddenPaths) {
      if (matchesPattern(normPath, forbiddenPattern)) {
        return {
          allowed: false,
          reason: `FORBIDDEN_PATH_ACCESS: Path '${normPath}' matches forbidden pattern '${forbiddenPattern}'.`,
          ruleMatched: forbiddenPattern,
        };
      }
    }

    // Check Allowed Paths (Whitelist)
    if (envelope.allowedPaths && envelope.allowedPaths.length > 0) {
      const isAllowed = envelope.allowedPaths.some(pattern => matchesPattern(normPath, pattern));
      if (!isAllowed) {
        return {
          allowed: false,
          reason: `UNPERMITTED_PATH_ACCESS: Path '${normPath}' is not in the declared allowedPaths scope [${envelope.allowedPaths.join(', ')}].`,
          ruleMatched: 'allowedPaths_whitelist',
        };
      }
    }

    return { allowed: true };
  }

  // 3. Command Execution Evaluation
  if (action.type === 'run_command') {
    if (!action.command) {
      return { allowed: false, reason: 'COMMAND_MISSING: Command string must be provided.' };
    }

    const cmd = action.command.trim();

    // Check for hard dangerous patterns
    for (const pattern of DANGEROUS_COMMAND_PATTERNS) {
      if (pattern.test(cmd)) {
        return {
          allowed: false,
          reason: `DANGEROUS_COMMAND_BLOCKED: Command matches security blocklist pattern: ${pattern}.`,
          ruleMatched: 'dangerous_command_blocklist',
        };
      }
    }

    // If allowedCommands whitelist is defined, enforce strict binary/prefix check
    if (envelope.allowedCommands && envelope.allowedCommands.length > 0) {
      const isWhitelisted = envelope.allowedCommands.some(allowedCmd => {
        return cmd === allowedCmd || cmd.startsWith(allowedCmd + ' ');
      });

      if (!isWhitelisted) {
        return {
          allowed: false,
          reason: `UNPERMITTED_COMMAND: Command '${cmd}' is not in allowedCommands whitelist [${envelope.allowedCommands.join(', ')}].`,
          ruleMatched: 'allowedCommands_whitelist',
        };
      }
    }

    return { allowed: true };
  }

  return { allowed: false, reason: `UNKNOWN_ACTION_TYPE: Action type '${action.type}' is unrecognized.` };
}
