import os from 'node:os';
import path from 'node:path';

export function dataDir(): string {
  return process.env.AGENTSCOPE_HOME || path.join(os.homedir(), '.agentscope');
}

export function dbPath(): string {
  return process.env.AGENTSCOPE_DB || path.join(dataDir(), 'agentscope.db');
}

export function archivePath(): string {
  return path.join(dataDir(), 'events.jsonl');
}
