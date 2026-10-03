import { randomUUID, createHash } from 'node:crypto';
import { mkdirSync, openSync, writeSync, fsyncSync, closeSync } from 'node:fs';
import { mkdir, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Vault } from './crypto.ts';
import { LocalJournal } from './local-journal.ts';
import { DatalomError } from '../runtime/contracts.ts';
import { assessment, type TraceContext } from '../runtime/diagnostics.ts';

export class Diagnostics {
  readonly journal: LocalJournal;
  private seq = 0;
  constructor(
    private vault: Vault,
    private dir: string,
  ) {
    this.journal = new LocalJournal(join(dir, 'diagnostics', 'records'));
  }
  async event(
    context: TraceContext,
    stage: string,
    outcome: string,
    payload: unknown = {},
    code?: string,
  ) {
    const id = randomUUID();
    const row = {
      kind: 'event',
      id,
      seq: ++this.seq,
      ...context,
      stage,
      outcome,
      code,
      createdAt: Date.now(),
      digest: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
      payload: this.vault.seal(payload, `diagnostic:${id}`),
    };
    await this.journal.append(row);
    return id;
  }
  // Fatal-process path only. Ordinary events never perform synchronous disk writes.
  emergency(payload: unknown) {
    const id = randomUUID();
    const folder = join(this.dir, 'diagnostics');
    mkdirSync(folder, { recursive: true, mode: 0o700 });
    const fd = openSync(join(folder, 'emergency.jsonl'), 'a', 0o600);
    try {
      writeSync(
        fd,
        JSON.stringify({
          id,
          createdAt: Date.now(),
          payload: this.vault.seal(payload, `emergency:${id}`),
        }) + '\n',
      );
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  }
  async evidence(accountId: string | null, kind: string, summary: string, payload: unknown) {
    const id = randomUUID();
    await this.journal.append({
      kind: 'evidence',
      id,
      accountId,
      evidenceKind: kind,
      createdAt: Date.now(),
      payload: this.vault.seal({ summary, payload }, `evidence:${id}`),
    });
    return id;
  }
  async listEvidence() {
    const rows: any[] = [];
    for await (const row of this.journal.records())
      if (row.kind === 'evidence') {
        const { payload, ...meta } = row;
        rows.push({
          ...meta,
          kind: row.evidenceKind,
          summary: this.vault.open<{ summary: string }>(payload, `evidence:${row.id}`).summary,
        });
        rows.sort((a, b) => b.createdAt - a.createdAt);
        rows.length = Math.min(rows.length, 100);
      }
    return rows;
  }
  private cache = new Map<string, any>();
  private cacheBytes = 0;
  private remember(row: any) {
    if (!row.id || !row.payload || this.cache.has(row.id)) return;
    const size = Buffer.byteLength(row.payload);
    if (size > 16 * 1024 * 1024) return;
    while (this.cacheBytes + size > 16 * 1024 * 1024) {
      const first = this.cache.keys().next().value!;
      this.cacheBytes -= Buffer.byteLength(this.cache.get(first).payload);
      this.cache.delete(first);
    }
    this.cache.set(row.id, row);
    this.cacheBytes += size;
  }
  private searches = new Map<string, { until: number; value: Promise<any[]> }>();
  async findCached(key: string, predicate: (row: any) => boolean, limit: number) {
    const now = Date.now();
    const old = this.searches.get(key);
    if (old && old.until > now) return old.value;
    if (this.searches.size >= 1000) this.searches.delete(this.searches.keys().next().value!);
    const value = this.find(predicate, limit, true);
    this.searches.set(key, { until: now + 30000, value });
    try {
      return await value;
    } catch (error) {
      this.searches.delete(key);
      throw error;
    }
  }
  async find(predicate: (row: any) => boolean, limit = 10000, descending = false): Promise<any[]> {
    const rows: any[] = [];
    for await (const row of this.journal.records())
      if (predicate(row)) {
        this.remember(row);
        const { payload, ...meta } = row;
        rows.push(meta);
        rows.sort(
          (a, b) =>
            (descending ? -1 : 1) * (a.createdAt - b.createdAt || (a.seq ?? 0) - (b.seq ?? 0)),
        );
        rows.length = Math.min(rows.length, limit);
      }
    return rows;
  }
  async events(reference?: string) {
    const rows = await this.find(
      (row) =>
        row.kind === 'event' &&
        (!reference || row.requestId === reference || row.taskId === reference),
      200,
      true,
    );
    return reference ? rows.reverse() : rows;
  }
  async rawEvent(id: string): Promise<unknown> {
    let row = this.cache.get(id);
    if (!row)
      for await (const item of this.journal.records())
        if (item.id === id) {
          row = item;
          this.remember(row);
          break;
        }
    if (row?.kind === 'event') return this.vault.open(row.payload, `diagnostic:${id}`);
    if (row?.kind === 'evidence') return this.vault.open(row.payload, `evidence:${id}`);
    throw new DatalomError('INVALID_INPUT', '事件不存在');
  }
  private async incidentRow(id: string) {
    let latest: any;
    for await (const row of this.journal.records())
      if (
        row.kind === 'incident' &&
        row.reference === id &&
        (!latest || row.revision > latest.revision)
      )
        latest = row;
    return latest;
  }
  private async locked<T>(id: string, work: () => Promise<T>) {
    const root = join(this.dir, 'diagnostics', 'locks');
    await mkdir(root, { recursive: true, mode: 0o700 });
    const lock = join(root, createHash('sha256').update(id).digest('hex'));
    try {
      await mkdir(lock);
    } catch (error: any) {
      if (error.code === 'EEXIST') throw new DatalomError('CONFLICT', '故障记录正在更新');
      throw error;
    }
    try {
      return await work();
    } finally {
      await rmdir(lock);
    }
  }
  async issue(
    context: { id: string; accountId?: string; requestId?: string },
    code: string,
    payload: unknown = {},
  ) {
    return this.locked(context.id, async () => {
      if (await this.incidentRow(context.id)) return;
      const now = Date.now();
      await this.journal.append({
        kind: 'incident',
        reference: context.id,
        accountId: context.accountId,
        requestId: context.requestId,
        state: 'open',
        revision: 1,
        code,
        createdAt: now,
        updatedAt: now,
        payload: this.vault.seal(
          { ...assessment(code), detail: payload },
          `incident:${context.id}`,
        ),
      });
    });
  }
  // Normal reports only expose metadata. Free-form diagnosis stays in encrypted local records.
  async incident(id: string): Promise<any> {
    const row = await this.incidentRow(id);
    if (!row) return null;
    const { payload, ...meta } = row;
    const detail = this.vault.open<{ certainty?: string }>(row.payload, `incident:${id}`);
    return {
      ...meta,
      ...assessment(row.code),
      certainty: detail.certainty === 'confirmed' ? 'confirmed' : 'unconfirmed',
    };
  }
  async rawIncident(id: string): Promise<unknown> {
    const row = await this.incidentRow(id);
    if (!row) throw new DatalomError('INVALID_INPUT', '故障记录不存在');
    return this.vault.open(row.payload, `incident:${id}`);
  }
  async update(
    context: { id: string },
    input: {
      revision: number;
      state: string;
      certainty: string;
      cause: string;
      nextExperiment: string;
      fix: string;
      regressionEventId?: string;
    },
  ) {
    return this.locked(context.id, async () => {
      const row = await this.incidentRow(context.id);
      if (!row || row.revision !== input.revision)
        throw new DatalomError('CONFLICT', '诊断记录已更新');
      if (input.state === 'resolved') {
        let regression: any;
        for await (const event of this.journal.records())
          if (event.id === input.regressionEventId) regression = event;
        if (
          !regression ||
          regression.kind !== 'event' ||
          regression.outcome !== 'completed' ||
          regression.createdAt < row.createdAt ||
          regression.accountId !== row.accountId ||
          input.certainty !== 'confirmed' ||
          !input.cause.trim() ||
          !input.fix.trim()
        )
          throw new DatalomError('INVALID_INPUT', '解决问题需要原因、修复说明和同账号后续成功事件');
      } else if (!input.nextExperiment.trim())
        throw new DatalomError('INVALID_INPUT', '请记录下一步实验');
      await this.journal.append({
        ...row,
        state: input.state,
        revision: row.revision + 1,
        updatedAt: Date.now(),
        payload: this.vault.seal(input, `incident:${context.id}`),
      });
      return this.incident(context.id);
    });
  }
  async bundle(context: { id: string }) {
    const events = await this.events(context.id);
    return {
      formatVersion: 2,
      exportedAt: Date.now(),
      reference: context.id,
      incident: await this.incident(context.id),
      events,
      evidenceAvailable: events.length > 0,
      note: '最近 200 条事件；完整内容位于本机加密 JSONL 文件。',
    };
  }
  async close() {
    await this.journal.close();
  }
}
