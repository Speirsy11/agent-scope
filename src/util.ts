import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function ensureDir(dir: string) { fs.mkdirSync(dir, { recursive: true }); }
export function sha256(value: string): string { return crypto.createHash('sha256').update(value).digest('hex'); }
export function nowIso(): string { return new Date().toISOString(); }
export function jsonStringify(value: unknown): string { return JSON.stringify(value ?? {}); }
export function parseJson<T = unknown>(value: string | null | undefined, fallback: T): T { if (!value) return fallback; try { return JSON.parse(value) as T; } catch { return fallback; } }
export function appendJsonl(file: string, value: unknown) { ensureDir(path.dirname(file)); fs.appendFileSync(file, `${JSON.stringify(value)}\n`); }
export function localDateKey(date: string): string {
  const d = date === 'today' ? new Date() : new Date(`${date}T00:00:00`);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function dayBounds(date: string): { start: string; end: string; day: string } {
  const d = date === 'today' ? new Date() : new Date(`${date}T00:00:00`);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString(), day: localDateKey(date) };
}
export function sinceToIso(since = 'today'): string {
  const now = new Date();
  if (since === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const m = since.match(/^(\d+)d$/);
  if (m) return new Date(now.getTime() - Number(m[1]) * 86400000).toISOString();
  return new Date(since).toISOString();
}
