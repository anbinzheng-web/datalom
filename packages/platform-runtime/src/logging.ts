import { appendFileSync, mkdirSync, existsSync, statSync, renameSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
const sensitive = /authorization|cookie|token|password|secret|api.?key|credential|device.?code/i;
const knownSecrets = new Set<string>();
export function registerSecret(value: string) {
  if (value.length >= 4) knownSecrets.add(value);
}
export function redact(value: unknown, key = '', depth = 0): unknown {
  if (sensitive.test(key)) return '[REDACTED]';
  if (depth > 8) return '[TRUNCATED]';
  if (value instanceof Error)
    return { name: value.name, message: redact(value.message), stack: redact(value.stack) };
  if (typeof value === 'string') {
    let text = value;
    for (const secret of knownSecrets) text = text.split(secret).join('[REDACTED]');
    for (const [name, secret] of Object.entries(process.env)) {
      if (sensitive.test(name) && secret && secret.length >= 4)
        text = text.split(secret).join('[REDACTED]');
    }
    text = text
      .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]')
      .replace(/([?&](?:token|key|api_key|access_token)=)[^&\s]+/gi, '$1[REDACTED]');
    return text.length > 4096 ? text.slice(0, 4096) + '[TRUNCATED]' : text;
  }
  if (Array.isArray(value)) return value.slice(0, 100).map((v) => redact(v, '', depth + 1));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 100)
        .map(([k, v]) => [k, redact(v, k, depth + 1)]),
    );
  return value;
}
export function createLogger(component: string, path: string) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  return (event: string, data: Record<string, unknown> = {}, level = 'info') => {
    let row = JSON.stringify({
      schemaVersion: 1,
      timestamp: new Date().toISOString(),
      component,
      level,
      event,
      data: redact(data),
    });
    if (Buffer.byteLength(row) > 16_384)
      row = JSON.stringify({
        timestamp: new Date().toISOString(),
        component,
        level,
        event,
        data: { truncated: true },
      });
    try {
      if (existsSync(path) && statSync(path).size > 5 * 1024 * 1024) {
        rmSync(`${path}.1`, { force: true });
        renameSync(path, `${path}.1`);
      }
      appendFileSync(path, row + '\n', { mode: 0o600 });
    } catch {
      process.stderr.write(`[${component}] log.write.failed\n`);
    }
    process.stdout.write(row + '\n');
  };
}
