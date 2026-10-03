import { artifactPath } from '@datalom/shared/runtime/paths';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { openStore } from '@datalom/shared/storage/runtime';
import { DatalomError } from '@datalom/shared/runtime/contracts';
import { errorRecord, type Trace } from '@datalom/shared/runtime/diagnostics';
import { startRoute } from '@datalom/network-node/route';
import { FacebookSessions } from '@datalom/platform-facebook/session';
import {
  buildRequest,
  validateResult,
  operations,
  type FacebookOperation,
  type Capture,
} from '@datalom/platform-facebook/native';
import { FacebookTransport } from '@datalom/platform-facebook/transport';

const [profileId, operationInput, evidenceId, updatesInput = '{}', pagesInput = '1'] =
  process.argv.slice(2);
const store = await openStore(),
  sessions = new FacebookSessions(store),
  requestId = randomUUID();
const controller = new AbortController();
const cancel = () => controller.abort();
process.once('SIGINT', cancel);
process.once('SIGTERM', cancel);
const timeout = setTimeout(cancel, 300000);
let held: Awaited<ReturnType<FacebookSessions['acquire']>> | undefined;
let route: Awaited<ReturnType<typeof startRoute>> | undefined;
let pageNumber = 0;
const report: Record<string, any> = {
  requestId,
  profileId,
  operation: operationInput,
  sourceEvidenceId: evidenceId,
  startedAt: new Date().toISOString(),
  browserUsed: false,
  adapterVersion: 'facebook-native-0.1.0',
  status: 'running',
  pages: [],
};
const trace: Trace = async (stage, outcome, payload, code) => {
  await store.diagnostics.event(
    {
      requestId,
      accountId: profileId,
      sessionVersion: held?.version,
      page: pageNumber,
      attempt: 1,
    },
    stage,
    outcome,
    payload,
    code,
  );
};
try {
  if (!/^[a-f0-9]{32}$/.test(profileId ?? '') || !Object.hasOwn(operations, operationInput ?? ''))
    throw new DatalomError(
      'INVALID_INPUT',
      'Usage: native-run <profileId> <operation> <captureEvidenceId> [updates JSON] [pages 1..3]',
    );
  const operation = operationInput as FacebookOperation;
  const pages = Number(pagesInput),
    updates = JSON.parse(updatesInput);
  if (
    !Number.isInteger(pages) ||
    pages < 1 ||
    pages > 3 ||
    !updates ||
    typeof updates !== 'object' ||
    Array.isArray(updates)
  )
    throw new DatalomError('INVALID_INPUT', '实验仅允许 1–3 页及对象变量');
  if (
    pages > 1 &&
    ![
      'post.comments',
      'comment.replies',
      'page.photos',
      'marketplace.feed',
      'marketplace.search',
    ].includes(operation)
  )
    throw new DatalomError('INVALID_INPUT', '该操作尚未实现分页');
  const meta = (await store.diagnostics.find(row => row.id === evidenceId, 1, false).then(rows => rows[0])) as any;
  if (!(
    (meta?.stage === 'facebook-http' && meta.outcome === 'received') ||
    (meta?.stage === 'facebook-template' && meta.outcome === 'validated')
  ))
    throw new DatalomError('INVALID_INPUT', '需要原始采集或已验证独立实验的请求证据');
  const capture = (await store.diagnostics.rawEvent(evidenceId)) as Capture;
  if (capture.profileId !== profileId)
    throw new DatalomError('INVALID_INPUT', '采集样本不属于当前账号');
  const sample = buildRequest(operation, capture, {}, 1);
  validateResult(operation, sample.variables, capture.status, capture.body);
  held = await sessions.acquire(profileId);
  const self = held.session.cookies.find((c) => c.name === 'c_user')?.value;
  if (
    self &&
    ['id', 'userID', 'user_id', 'sellerId', 'sellerID'].some(
      (key) => sample.variables[key] === self,
    ) &&
    /^(profile|page|marketplace\.(seller|inventory))/.test(operation)
  )
    throw new DatalomError('INVALID_INPUT', '不采集本账号资料');
  if (!held.session.route?.verifiedAt)
    throw new DatalomError('PROXY_UNAVAILABLE', '账号线路尚未验证');
  await trace('facebook-session', 'acquired', {
    profileId,
    capturedAt: held.session.capturedAt,
    sourceEvidenceId: evidenceId,
    browserVersion: held.session.observed.browserVersion,
    transportPreset: 'chrome151',
    session: held.session,
  });
  route = await startRoute(held.session.route, store.dir, trace);
  const transport = new FacebookTransport(route.url, held.session, trace);
  const ids = new Set<string>(),
    cursors = new Set<string>();
  for (pageNumber = 1; pageNumber <= pages; pageNumber++) {
    if (pageNumber > 1) await delay(3000, undefined, { signal: controller.signal });
    controller.signal.throwIfAborted();
    if (!(await sessions.renew(profileId, held.lease)))
      throw new DatalomError('CONFLICT', '会话租约已失效');
    const request = buildRequest(operation, capture, updates, ++held.session.requestCounter);
    // Persist before I/O so a failed request never reuses its sequence number.
    await sessions.save(held.session, held.version, held.lease);
    const started = Date.now();
    const response = await transport.request(
      request,
      AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
    );
    await sessions.save(held.session, held.version, held.lease);
    const result = validateResult(operation, request.variables, response.status, response.body);
    if (operation === 'marketplace.search' && updates.query !== undefined) {
      capture.requestBody = request.body;
      delete updates.query;
    }
    let duplicates = 0;
    for (const item of result.page?.items ??
      (Array.isArray(result.raw.items) ? result.raw.items : [])) {
      if (ids.has(item.id)) duplicates++;
      ids.add(item.id);
    }
    const resultEvidenceId = await store.diagnostics.event(
      {
        requestId,
        accountId: profileId,
        sessionVersion: held.version,
        page: pageNumber,
      },
      'facebook-result',
      'validated',
      { operation, variables: request.variables, ...result },
    );
    report.pages.push({
      page: pageNumber,
      httpStatus: response.status,
      bytes: response.bytes,
      elapsedMs: Date.now() - started,
      chunks: result.chunks.length,
      count:
        result.page?.items.length ??
        (Array.isArray(result.raw.items) ? result.raw.items.length : undefined),
      duplicates,
      hasMore: result.page?.hasMore,
      evidenceId: resultEvidenceId,
    });
    if (!result.page?.hasMore || pageNumber === pages) break;
    const cursorKey =
      operation === 'post.comments'
        ? 'commentsAfterCursor'
        : operation === 'comment.replies'
          ? 'repliesAfterCursor'
          : 'cursor';
    if (result.page.cursor === request.variables[cursorKey] || cursors.has(result.page.cursor!))
      throw new DatalomError('SCHEMA_CHANGED', '分页游标重复，已停止');
    cursors.add(result.page.cursor!);
    updates[cursorKey] = result.page.cursor;
    if (operation === 'post.comments') updates.commentsAfterCount = -1;
    else if (operation === 'comment.replies') updates.repliesAfterCount = -1;
    else updates.count = 8;
  }
  report.status = 'succeeded';
  report.uniqueItems = ids.size;
  await trace('facebook-run', 'succeeded', report);
} catch (error) {
  report.status = 'failed';
  report.code =
    error instanceof DatalomError
      ? error.code
      : controller.signal.aborted
        ? 'CANCELLED'
        : 'INTERNAL';
  report.failureEvidenceId = await store.diagnostics.event(
    {
      requestId,
      accountId: profileId,
      sessionVersion: held?.version,
      page: pageNumber,
    },
    'facebook-run',
    'failed',
    {
      error: errorRecord(error),
      report,
      causeConfirmed: false,
      nextExperiment:
        '对照 sourceEvidenceId 的浏览器成功样本和本次 HTTP 原始响应；先确定失败阶段，再做单变量实验；不自动重试。',
    },
    report.code,
  );
  process.exitCode = 1;
} finally {
  clearTimeout(timeout);
  try {
    await route?.stop();
  } finally {
    if (held)
      await sessions.release(profileId, held.lease, report.code === 'RATE_LIMIT' ? 300000 : 3000);
    report.finishedAt = new Date().toISOString();
    mkdirSync(artifactPath('facebook'), { recursive: true });
    writeFileSync(
      artifactPath(`facebook/independent-${requestId}.json`),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report));
    await store.close();
    process.off('SIGINT', cancel);
    process.off('SIGTERM', cancel);
  }
}
