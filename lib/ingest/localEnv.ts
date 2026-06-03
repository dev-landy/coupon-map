import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DEFAULT_ENV_FILES = ['.env.local', '.env.crawler.local'];

export function loadLocalEnvFiles(
  cwd = process.cwd(),
  files: readonly string[] = DEFAULT_ENV_FILES
): void {
  for (const file of files) {
    const path = resolve(cwd, file);
    if (!existsSync(path)) continue;
    loadEnvText(readFileSync(path, 'utf8'));
  }
}

export function loadEnvText(text: string): void {
  for (const line of text.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;
    const existing = process.env[parsed.key];
    if (existing && existing.trim().length > 0) continue;
    if (parsed.value.trim().length === 0) continue;
    process.env[parsed.key] = parsed.value;
  }
}

function parseEnvLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;

  const normalized = trimmed.startsWith('export ')
    ? trimmed.slice('export '.length).trim()
    : trimmed;
  const equalsIndex = normalized.indexOf('=');
  if (equalsIndex <= 0) return null;

  const key = normalized.slice(0, equalsIndex).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;

  return {
    key,
    value: parseEnvValue(normalized.slice(equalsIndex + 1).trim()),
  };
}

function parseEnvValue(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value
      .slice(1, -1)
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }
  const commentIndex = value.search(/\s+#/);
  return commentIndex === -1 ? value : value.slice(0, commentIndex).trimEnd();
}
