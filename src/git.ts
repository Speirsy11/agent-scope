import childProcess from 'node:child_process';

function git(cwd: string, args: string[]): string | undefined {
  try { return childProcess.execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || undefined; } catch { return undefined; }
}

export function gitMetadata(cwd?: string) {
  if (!cwd) return {};
  return {
    git_remote: git(cwd, ['config', '--get', 'remote.origin.url']),
    git_branch: git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']),
    git_commit: git(cwd, ['rev-parse', 'HEAD']),
  };
}
