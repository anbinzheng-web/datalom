import { artifactPath } from '@datalom/shared/runtime/paths';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { openStore } from '@datalom/shared/storage/runtime';
import { assessment, errorRecord } from '@datalom/shared/runtime/diagnostics';
const store = await openStore(),
  requestId = process.argv[2];
try {
  if (!/^[a-f0-9-]{36}$/.test(requestId ?? '')) throw Error('Usage: diagnose <requestId>');
  const rows = (await store.diagnostics.find(row => row.requestId === requestId, 10000, false)) as any[];
  if (!rows.length) throw Error('No events for this request');
  const timeline = await Promise.all(
    rows.map(async (row) => {
      const p = (await store.diagnostics.rawEvent(row.id)) as any;
      return {
        ...row,
        status: p.status,
        bytes: p.bytes,
        sha256: p.sha256,
        operation: p.operation,
        queryVersion:
          row.stage === 'x-query-registry' && row.outcome === 'resolved'
            ? { captured: p.capturedId, current: p.currentId, changed: p.changed }
            : undefined,
        rateLimit:
          row.stage === 'x-http-headers'
            ? {
                limit: p.headers?.['x-rate-limit-limit'],
                remaining: p.headers?.['x-rate-limit-remaining'],
                reset: p.headers?.['x-rate-limit-reset'],
              }
            : undefined,
        errorCode: p.error?.code,
        errorName: p.error?.name,
        hasCause: p.error?.cause !== undefined,
      };
    }),
  );
  const terminal = [...rows]
    .reverse()
    .find((r) => r.stage === 'x-run' && ['failed', 'succeeded'].includes(r.outcome));
  const report = {
    requestId,
    diagnosisId: randomUUID(),
    createdAt: new Date().toISOString(),
    status: terminal?.outcome ?? 'incomplete',
    assessment: terminal?.outcome === 'failed' ? assessment(terminal.code) : undefined,
    timeline,
    rawEvidence:
      '原始请求、响应、素材、异常与堆栈均按 event id 加密保存；本报告不输出 Cookie、Token、代理认证或正文。',
  };
  const evidenceId = await store.diagnostics.event(
    { requestId },
    'x-diagnosis',
    'recorded',
    report,
  );
  mkdirSync(artifactPath('x'), { recursive: true });
  const path = artifactPath(`x/diagnosis-${requestId}.json`);
  writeFileSync(path, JSON.stringify({ ...report, evidenceId }, null, 2));
  console.log({ requestId, status: report.status, evidenceId, path });
} catch (error) {
  console.log({
    failed: true,
    evidenceId: await store.diagnostics.event({ requestId }, 'x-diagnosis', 'failed', {
      error: errorRecord(error),
    }),
  });
  process.exitCode = 1;
} finally {
  await store.close();
}
