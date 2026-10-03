import { artifactPath } from '@datalom/shared/runtime/paths';
import { readFileSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { openStore } from '@datalom/shared/storage/runtime';
import { errorRecord } from '@datalom/shared/runtime/diagnostics';
import {
  doubaoHarEntries,
  compareDoubaoCaptures,
  type Capture,
} from '@datalom/platform-doubao/capture';
const store = await openStore(),
  runId = randomUUID();
try {
  const path = process.argv[2];
  if (!path || statSync(path).size > 100_000_000)
    throw new Error('需要一个小于 100 MB 的本机 HAR 文件路径');
  const captures = doubaoHarEntries(JSON.parse(readFileSync(path, 'utf8')));
  const ids: string[] = [];
  const chats = captures.filter((capture) => new URL(capture.url).pathname === '/chat/completion');
  const selectedIndex = process.argv[3] === undefined ? 0 : Number(process.argv[3]);
  if (chats.length > 1 && process.argv[3] === undefined)
    throw new Error(`HAR 含 ${chats.length} 条对话请求，请用第三个参数明确选择从 0 开始的索引`);
  if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= chats.length)
    throw new Error('HAR 对话请求索引不存在');
  let comparison: Capture | undefined, comparisonId: string | undefined;
  for (const capture of captures) {
    const id = await store.diagnostics.event(
      { requestId: runId },
      'doubao-reference',
      'imported',
      capture,
    );
    ids.push(id);
    if (capture === chats[selectedIndex]) {
      comparison = capture;
      comparisonId = id;
    }
  }
  if (!comparison) throw new Error('HAR 中没有 /chat/completion 请求，请保留实际对话网络记录');
  const rows = (await store.diagnostics.find(row => row.stage === 'doubao-http' && row.outcome === 'received', 500, true)) as { id: string }[];
  let research: Capture | undefined, researchId: string | undefined;
  for (const row of rows) {
    const raw = (await store.diagnostics.rawEvent(row.id)) as Capture;
    if (raw.url && new URL(raw.url).pathname === '/chat/completion') {
      research = raw;
      researchId = row.id;
      break;
    }
  }
  if (!research) throw new Error('缺少研究请求，无法生成对照报告');
  const report = {
    runId,
    capturedCount: ids.length,
    researchId,
    comparisonId,
    ...compareDoubaoCaptures(research, comparison),
  };
  await store.diagnostics.event({ requestId: runId }, 'doubao-comparison', 'recorded', report);
  mkdirSync(artifactPath(), { recursive: true });
  writeFileSync(artifactPath('doubao-comparison.json'), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      path: artifactPath('doubao-comparison.json'),
      runId,
      capturedCount: ids.length,
      comparison: report.comparison,
    }),
  );
} catch (error) {
  const evidenceId = await store.diagnostics.event(
    { requestId: runId },
    'doubao-comparison',
    'failed',
    errorRecord(error),
  );
  console.log(JSON.stringify({ status: 'failed', evidenceId }));
  process.exitCode = 1;
} finally {
  await store.close();
}
