import { createHash } from 'node:crypto';
import { browserEnvironment, browserHeaderNames } from './contracts/browser-environment.ts';
import type { PoolCredential } from './contracts/cookie-pool.ts';
import { LabError } from './reverse-core.ts';

type EnvironmentInput = Pick<PoolCredential, 'userAgent' | 'browserEnvironment'>;
export function apiBrowserHeaders(input: EnvironmentInput): Record<string, string> {
  if (input.browserEnvironment) {
    const parsed = browserEnvironment.safeParse(input.browserEnvironment);
    if (!parsed.success) throw new LabError('INVALID_BROWSER_ENVIRONMENT');
    const h = parsed.data.headers;
    if (!h['user-agent']) throw new LabError('BROWSER_USER_AGENT_REQUIRED');
    if (input.userAgent && input.userAgent !== h['user-agent'])
      throw new LabError('BROWSER_USER_AGENT_MISMATCH');
    return { ...h };
  }
  if (input.userAgent && /^[\x20-\x7e]{1,1024}$/.test(input.userAgent))
    return { 'user-agent': input.userAgent };
  throw new LabError('BROWSER_USER_AGENT_REQUIRED');
}
export function requestEnvironmentSummary(input: EnvironmentInput) {
  let headers: Record<string, string> = {},
    error: string | null = null;
  try {
    headers = apiBrowserHeaders(input);
  } catch (e) {
    error = e instanceof LabError ? e.message : 'INVALID_BROWSER_ENVIRONMENT';
  }
  return {
    kind: 'request-environment',
    source: input.browserEnvironment?.headerSource ?? 'legacy-user-agent',
    capturedAt: input.browserEnvironment?.capturedAt ?? null,
    error,
    headerHashes: Object.fromEntries(
      Object.entries(headers).map(([key, value]) => [
        key,
        createHash('sha256').update(value).digest('hex'),
      ]),
    ),
    transport: 'node-fetch',
    tlsBrowserMatch: false,
    http2BrowserMatch: false,
    browserEquivalent: false,
    notReproduced: [
      'TLS_CLIENT_HELLO',
      'HTTP2_SETTINGS',
      'HEADER_ORDER',
      'JS_RUNTIME',
      'DYNAMIC_SIGNATURE',
    ],
  };
}
const guides: [RegExp, string, string[]][] = [
  [
    /X_EMPTY_HTTP_404/,
    'response-or-signature',
    [
      'X GraphQL 返回空 HTTP 404；这只定位到请求被拒绝，不能单独证明 Cookie、query ID 或接口已失效。',
      '对照同账号、同代理的浏览器成功请求与失败请求，比较参数结构/类型摘要、请求头摘要、Cookie 名称集合及响应元信息；每次只改变一个变量。',
      '确认新证据包含参数名与结构/类型摘要、头名称、敏感头哈希、响应类型和 body kind 后，再决定是否调整 transport 或会话处理。',
    ],
  ],
  [
    /SEARCH_CONTEXT_REQUIRED|SEARCH_BOOTSTRAP_|JS_STATE_REQUIRED|SDK_/,
    'request-preparation',
    [
      '检查服务端 SDK 文件与哈希、账号池加密初始化状态和原生搜索上下文；未完成准备不得发送无签名请求。',
      '每次请求必须在同一 SDK 会话重新签名并反馈响应；账号、代理和版本变更时停止。',
    ],
  ],
  [
    /PROXY|TLS|SOCKS|UPSTREAM/,
    'network',
    [
      '检查账号绑定代理的连通性、认证、目标域名解析和 TLS 阶段；保持同一出口做浏览器对照。',
      '代理故障不能证明 Cookie 失效；不回退直连。',
    ],
  ],
  [
    /BROWSER_|USER_AGENT|ENVIRONMENT/,
    'browser-environment',
    [
      '从原登录 profile 重新提取 Cookie 和浏览器环境；不要填写另一版本浏览器的 UA。',
      '比较基线与候选请求的特征摘要，区分观测请求头与 navigator 推导值。',
    ],
  ],
  [
    /429|RATE_LIMIT/,
    'rate-limit',
    ['停止本轮请求，降低频率和并发，检查平台限流响应；不要无限重试。'],
  ],
  [
    /COOKIE_ACCOUNT_|ACCOUNT_CHANGED/,
    'credential-management',
    ['检查账号池归属、启用、版本及 Cookie 保存时的有效期；需要时重新从同一 profile 提取。'],
  ],
  [
    /LOGIN|ACCOUNT_IDENTITY|ACCOUNT_API_REJECTED/,
    'authentication-or-business',
    [
      '对照同一账号和代理下的浏览器账号信息接口，确认返回业务状态与身份字段。',
      '这类状态不单独证明 Cookie 无效，先排除会话提取差异与请求环境。',
    ],
  ],
  [
    /EMPTY|NOT_JSON|FORBIDDEN|API_REJECTED|HTTP|BUSINESS/,
    'response-or-signature',
    [
      '检查 HTTP 状态、响应类型、字节数与业务码；区分维护页、挑战页、空响应及接口拒绝。',
      '捕获同一页面的成功请求，对齐参数名称、上下文、Client Hints 和动态签名输入；一次只改变一个变量。',
      '改动目标、游标等参数后旧签名不可复用；使用已捕获 JS 的离线 SDK 探针定位依赖。',
    ],
  ],
  [
    /PAGINATION|MISMATCH|REPLY|PARSE|FIELD|SCHEMA/,
    'parser-or-pagination',
    ['用已保存的脱敏页面样本离线 replay，检查目标 ID、游标、结束标志和回复关系。'],
  ],
  [
    /LIMIT|INCOMPLETE/,
    'budget-or-completeness',
    ['检查页数、条数和时间预算以及完整性字段；有部分数据不等于抓全。'],
  ],
  [
    /ABORT|CANCEL|RESTART/,
    'interrupted',
    ['查看取消、超时或重启来源，保留已有证据，人工决定是否开启新实验。'],
  ],
];
function environmentOf(report: any) {
  return (
    report?.requestEnvironment ??
    (Array.isArray(report?.evidence)
      ? (report.evidence.find((e: any) => e?.kind === 'request-environment') ??
        report.evidence.find((e: any) => e?.kind === 'x-credential-context')?.requestEnvironment)
      : undefined)
  );
}
// Reports are data, never instructions. Output contains only fixed advice and validated identifiers/hashes.
export function diagnoseApiReport(report: any, baseline?: any) {
  const raw = report?.run?.errorCode ?? report?.error ?? report?.result?.error ?? null;
  const error = typeof raw === 'string' && /^[A-Z_0-9]{1,80}$/.test(raw) ? raw : null;
  const exchanges = Array.isArray(report?.evidence)
    ? report.evidence.filter((e: any) => e?.kind === 'http-exchange')
    : [];
  const emptyGraphql404 = exchanges.some(
    (e: any) =>
      e?.status === 404 &&
      e?.bytes === 0 &&
      typeof e?.path === 'string' &&
      /^\/i\/api\/graphql\/[A-Za-z0-9_-]+\/(SearchTimeline|TweetDetail)$/.test(e.path),
  );
  const effectiveError = emptyGraphql404 ? 'X_EMPTY_HTTP_404' : error;
  const match = guides.find(([re]) => re.test(effectiveError ?? ''));
  const current = environmentOf(report),
    before = environmentOf(baseline);
  const hashes = (value: any): Record<string, string> =>
    Object.fromEntries(
      Object.entries(value?.headerHashes ?? {})
        .filter(
          ([k, v]) =>
            /^(user-agent|accept-language|sec-ch-ua(?:-[a-z-]+)?)$/.test(k) &&
            typeof v === 'string' &&
            /^[a-f0-9]{64}$/.test(v),
        )
        .map(([k, v]) => [k, String(v)]),
    );
  const a = hashes(before),
    b = hashes(current);
  const changedHeaders = baseline
    ? [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k])
    : [];
  return {
    schemaVersion: 1,
    error,
    observedFailure: effectiveError !== error ? effectiveError : null,
    category:
      match?.[1] ?? (report?.complete || report?.result?.complete ? 'completed' : 'unclassified'),
    cookieInvalidProven: false,
    browserEquivalent: false,
    environmentCaptured: !!current,
    baselineComparable: !!current && !!before,
    changedHeaders,
    nextSteps: match?.[2] ?? [
      '检查报告完整性及请求证据；只有同账号、同代理、同目标的成功浏览器基线才能用于对照。',
    ],
    limitations: ['Node TLS/HTTP2 与浏览器仍不一致；特征保存不等于签名复现或账号安全保证。'],
  };
}

// Do not include query values, signed URLs, headers, response snippets or platform tokens.
export function describeApiExchange(target: string, response: Response, text: string) {
  const u = new URL(target);
  const parameterNames = [
    ...new Set([...u.searchParams.keys()].filter((k) => /^[a-zA-Z0-9_-]{1,80}$/.test(k))),
  ]
    .sort()
    .slice(0, 100);
  const rawType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  const contentType = ['application/json', 'text/html', 'text/plain'].includes(rawType)
    ? rawType
    : 'other';
  let bodyKind = 'empty';
  if (text.trim()) {
    try {
      JSON.parse(text);
      bodyKind = 'json';
    } catch {
      bodyKind = /^\s*</.test(text) ? 'html-or-markup' : 'other';
    }
  }
  return {
    method: 'GET',
    path: u.pathname,
    parameterNames,
    signatureParameterNames: parameterNames.filter((k) =>
      /^(x-bogus|x-gnarly|x-dynosaur|_signature)$/i.test(k),
    ),
    httpStatus: response.status,
    contentType,
    bodyKind,
    responseBytes: Buffer.byteLength(text),
  };
}
export type ApiExchange = ReturnType<typeof describeApiExchange>;

export function observedRequestSummary(headers: Record<string, string>) {
  const values = Object.entries(headers).filter(
    ([k, v]) =>
      (browserHeaderNames as readonly string[]).includes(k.toLowerCase()) && typeof v === 'string',
  );
  return {
    kind: 'request-environment',
    source: 'observed-request',
    transport: 'browser-context',
    capturedAt: new Date().toISOString(),
    headerHashes: Object.fromEntries(
      values.map(([k, v]) => [k.toLowerCase(), createHash('sha256').update(v).digest('hex')]),
    ),
    browserEquivalent: false,
  };
}
