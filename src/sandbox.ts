import fs from 'node:fs/promises';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export interface SandboxStatus {
  modifiedFiles: string[];
  totalDiffLines: { additions: number; deletions: number };
}

/**
 * Reads a file safely within the workspace boundary
 */
export async function safeReadFile(workspaceRoot: string, relPath: string): Promise<string> {
  const fullPath = path.resolve(workspaceRoot, relPath);
  return await fs.readFile(fullPath, 'utf-8');
}

/**
 * Writes a file safely, creating parent directories if needed
 */
export async function safeWriteFile(workspaceRoot: string, relPath: string, content: string): Promise<void> {
  const fullPath = path.resolve(workspaceRoot, relPath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, 'utf-8');
}

/**
 * Lists directory entries
 */
export async function safeListDir(workspaceRoot: string, relPath: string = ''): Promise<string[]> {
  const fullPath = path.resolve(workspaceRoot, relPath);
  const entries = await fs.readdir(fullPath, { withFileTypes: true });
  return entries.map(e => (e.isDirectory() ? `${e.name}/` : e.name));
}

/**
 * Inspects git diff and status to determine exactly what files were modified by the agent.
 */
export async function getGitStatus(workspaceRoot: string): Promise<SandboxStatus> {
  try {
    // 1. Get list of modified / untracked files
    const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd: workspaceRoot });
    const modifiedFiles = statusOutput
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => line.slice(3).trim());

    // 2. Get line additions and deletions
    let additions = 0;
    let deletions = 0;
    const { stdout: diffOutput } = await execAsync('git diff --numstat', { cwd: workspaceRoot });
    for (const line of diffOutput.split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 3) {
        const added = parseInt(parts[0], 10);
        const deleted = parseInt(parts[1], 10);
        if (!isNaN(added)) additions += added;
        if (!isNaN(deleted)) deletions += deleted;
      }
    }

    return {
      modifiedFiles,
      totalDiffLines: { additions, deletions },
    };
  } catch (error) {
    return {
      modifiedFiles: [],
      totalDiffLines: { additions: 0, deletions: 0 },
    };
  }
}
