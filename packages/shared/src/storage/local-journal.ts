import { appendFile, mkdir, readdir, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatalomError } from '../runtime/contracts.ts';

/** One writer per process/store, bounded batches, daily/32 MiB rotation. */
export class LocalJournal {
  private pending: { line: string; resolve: () => void; reject: (error: unknown) => void }[] = [];
  private bytes = 0;
  private running?: Promise<void>;
  private scheduled = false;
  private closed = false;
  private failure?: unknown;
  private suffix = `${process.pid}-${randomUUID()}`;
  private day = '';
  private part = 0;
  private fileBytes = 0;
  constructor(
    readonly dir: string,
    private maxBytes = 8 * 1024 * 1024,
  ) {}
  append(record: unknown): Promise<void> {
    const line = JSON.stringify(record) + '\n';
    const size = Buffer.byteLength(line);
    if (this.failure) return Promise.reject(this.failure);
    if (this.closed || this.bytes + size > this.maxBytes)
      return Promise.reject(new DatalomError('OBSERVABILITY', '本地日志缓冲已满或已关闭'));
    this.bytes += size;
    const promise = new Promise<void>((resolve, reject) =>
      this.pending.push({ line, resolve, reject }),
    );
    if (!this.scheduled && !this.running) {
      this.scheduled = true;
      setImmediate(() => {
        this.scheduled = false;
        void this.flush();
      });
    }
    return promise;
  }
  async flush(): Promise<void> {
    if (this.running) return this.running;
    this.running = this.drain();
    try {
      await this.running;
    } finally {
      this.running = undefined;
      if (this.pending.length) await this.flush();
    }
  }
  private async drain() {
    while (this.pending.length) {
      const batch = this.pending.splice(0, 256);
      const data = batch.map((x) => x.line).join('');
      const size = Buffer.byteLength(data);
      try {
        if (this.failure) throw this.failure;
        await mkdir(this.dir, { recursive: true, mode: 0o700 });
        const day = new Date().toISOString().slice(0, 10);
        if (day !== this.day || this.fileBytes + size > 32 * 1024 * 1024) {
          this.day = day;
          this.part++;
          this.fileBytes = 0;
        }
        await appendFile(
          join(this.dir, `${this.day}-${this.suffix}-${String(this.part).padStart(6, '0')}.jsonl`),
          data,
          { mode: 0o600 },
        );
        this.fileBytes += size;
        batch.forEach((x) => x.resolve());
      } catch (error) {
        this.failure = error;
        batch.forEach((x) => x.reject(error));
      } finally {
        this.bytes -= size;
      }
    }
  }
  async *records(): AsyncGenerator<any> {
    await this.flush();
    let files: string[];
    try {
      files = await readdir(this.dir);
    } catch (error: any) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    for (const file of files.filter((x) => x.endsWith('.jsonl')).sort()) {
      const path = join(this.dir, file);
      const size = (await stat(path)).size;
      if (!size) continue;
      // Snapshot the current size; an in-flight trailing record is read on the next scan.
      const stream = createReadStream(path, { encoding: 'utf8', end: size - 1 });
      let pending = '';
      try {
        for await (const chunk of stream) {
          pending += chunk;
          let newline: number;
          while ((newline = pending.indexOf('\n')) !== -1) {
            const line = pending.slice(0, newline);
            pending = pending.slice(newline + 1);
            if (!line.trim()) continue;
            let row;
            try {
              row = JSON.parse(line);
            } catch {
              throw new DatalomError('OBSERVABILITY', `日志文件损坏：${file}`);
            }
            yield row;
          }
          if (Buffer.byteLength(pending) > this.maxBytes)
            throw new DatalomError('OBSERVABILITY', '日志记录超过读取上限');
        }
      } finally {
        stream.destroy();
      }
    }
  }
  async close() {
    this.closed = true;
    do {
      await this.flush();
    } while (this.pending.length || this.running);
  }
}
