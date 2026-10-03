import { expect, it } from 'vitest';
import { mkdtemp, rm, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { LocalJournal } from '../storage/local-journal.ts';
import { Diagnostics } from '../storage/diagnostics.ts';
import { Vault } from '../storage/crypto.ts';
import { MemoryRate } from '../storage/memory-rate.ts';
import { Metrics } from '../storage/metrics.ts';

it('handles concurrent log batches, stores plain JSON and reads after reopening', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'datalom-journal-'));
  const vault = new Vault(randomBytes(32));
  const writer = new Diagnostics(vault, dir);
  try {
    const ids = await Promise.all(
      Array.from({ length: 2000 }, (_, i) =>
        writer.event({ requestId: `run-${i}` }, 'http', 'completed', { token: 'secret-token', i }),
      ),
    );
    for (let i = 0; i < 20; i++) await writer.event({}, 'sequential', 'completed', { i });
    await writer.close();
    const reader = new Diagnostics(vault, dir);
    expect(await reader.rawEvent(ids[1999])).toEqual({ token: 'secret-token', i: 1999 });
    expect(await reader.events('run-1900')).toHaveLength(1);
    const path = join(dir, 'diagnostics/records');
    for (const file of await readdir(path))
      expect(await readFile(join(path, file), 'utf8')).toContain('secret-token');
    await reader.close();
  } finally {
    await writer.close();
    await rm(dir, { recursive: true, force: true });
  }
});
it('bounds log memory and rejects unavailable disk without silent loss', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'datalom-journal-failure-'));
  try {
    const journal = new LocalJournal(join(dir, 'records'), 100);
    await expect(journal.append({ content: 'x'.repeat(100) })).rejects.toThrow('缓冲');
    await journal.close();
    await writeFile(join(dir, 'blocked'), 'not-a-directory');
    const blocked = new LocalJournal(join(dir, 'blocked', 'records'));
    await expect(blocked.append({ id: 'a' })).rejects.toThrow();
    await expect(blocked.append({ id: 'b' })).rejects.toThrow();
    await blocked.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
it('reserves quotas atomically without I/O and expires bounded scope state', async () => {
  const rate = new MemoryRate(2);
  expect(
    Array.from({ length: 10000 }, () => rate.consume('a', 1, 100, 0)).filter(Boolean),
  ).toHaveLength(100);
  expect(rate.consume('b', 1, 1, 0)).toBe(true);
  expect(rate.consume('c', 1, 1, 0)).toBe(false);
  expect(rate.consume('c', 2, 1, 120001)).toBe(true);
  expect(
    rate.reserve(
      [
        ['account', 100],
        ['proxy', 10],
      ],
      0,
      0,
    ),
  ).toBe(0);
  expect(
    rate.reserve(
      [
        ['account', 100],
        ['proxy', 10],
      ],
      0,
      0,
    ),
  ).toBe(100);
});
it('aggregates metrics in memory and flushes locally on shutdown', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'datalom-metrics-'));
  const metrics = new Metrics(dir);
  try {
    for (let i = 0; i < 10000; i++) metrics.record('GET /api/test', '200', 5);
    metrics.record('GET /api/test', '500', 15);
    expect(metrics.snapshot().rows[0]).toMatchObject({ calls: 10000, averageMs: 5 });
    await metrics.close();
    const files = await readdir(join(dir, 'metrics'));
    expect(files).toHaveLength(1);
    expect(
      JSON.parse((await readFile(join(dir, 'metrics', files[0]), 'utf8')).trim()).rows,
    ).toHaveLength(2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
