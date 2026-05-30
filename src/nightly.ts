import childProcess from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function runNightly(argv0 = process.argv[1]) {
  const cli = path.resolve(argv0);
  childProcess.execFileSync(process.execPath, [cli, 'init'], { stdio: 'inherit' });
  childProcess.execFileSync(process.execPath, [cli, 'ingest', 'openclaw', '--since', '2d', '--privacy', 'redacted_text'], { stdio: 'inherit' });
  childProcess.execFileSync(process.execPath, [cli, 'insights', 'run', '--date', 'today'], { stdio: 'inherit' });
  childProcess.execFileSync(process.execPath, [cli, 'gbrain', 'ingest'], { stdio: 'inherit' });
}

export function installLaunchd(argv0 = process.argv[1]) {
  const cli = path.resolve(argv0);
  const label = 'local.agentscope.nightly';
  const plistDir = path.join(os.homedir(), 'Library', 'LaunchAgents');
  const logDir = path.join(os.homedir(), '.agentscope', 'logs');
  fs.mkdirSync(plistDir, { recursive: true });
  fs.mkdirSync(logDir, { recursive: true });
  const plistPath = path.join(plistDir, `${label}.plist`);
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key><array><string>${process.execPath}</string><string>${cli}</string><string>nightly</string><string>run</string></array>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>23</integer><key>Minute</key><integer>30</integer></dict>
  <key>StandardOutPath</key><string>${path.join(logDir, 'nightly.out.log')}</string>
  <key>StandardErrorPath</key><string>${path.join(logDir, 'nightly.err.log')}</string>
  <key>WorkingDirectory</key><string>${process.cwd()}</string>
</dict></plist>
`;
  fs.writeFileSync(plistPath, plist);
  const uid = typeof process.getuid === 'function' ? process.getuid() : Number(process.env.UID || 0);
  try { childProcess.execFileSync('launchctl', ['bootout', `gui/${uid}`, plistPath], { stdio: 'ignore' }); } catch {}
  childProcess.execFileSync('launchctl', ['bootstrap', `gui/${uid}`, plistPath], { stdio: 'inherit' });
  childProcess.execFileSync('launchctl', ['enable', `gui/${uid}/${label}`], { stdio: 'inherit' });
  return { label, plistPath, schedule: '23:30 local time daily' };
}

export function nightlyStatus() {
  const label = 'local.agentscope.nightly';
  const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', `${label}.plist`);
  const logDir = path.join(os.homedir(), '.agentscope', 'logs');
  const uid = typeof process.getuid === 'function' ? process.getuid() : Number(process.env.UID || 0);
  let launchctl = '';
  try {
    launchctl = childProcess.execFileSync('launchctl', ['print', `gui/${uid}/${label}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    launchctl = String((error as any).stderr || (error as Error).message);
  }
  const tail = (file: string) => fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split(/\r?\n/).slice(-20).join('\n') : '';
  return {
    label,
    plistPath,
    installed: fs.existsSync(plistPath),
    launchctl: launchctl.slice(0, 4000),
    stdoutTail: tail(path.join(logDir, 'nightly.out.log')),
    stderrTail: tail(path.join(logDir, 'nightly.err.log')),
  };
}
