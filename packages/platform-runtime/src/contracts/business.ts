import { z } from 'zod';
import { poolBrowserBatchExtract, poolBrowserExtract } from './cookie-pool.ts';

export const identifier = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
export const datasets = [
  'tiktok.videos',
  'tiktok.comments',
  'tiktok.users',
  'tiktok.tags',
  'tiktok.keyword-evidence',
  'instagram.videos',
  'instagram.comments',
  'instagram.users',
  'instagram.tags',
  'instagram.keyword-evidence',
  'youtube.videos',
  'youtube.comments',
  'youtube.users',
  'youtube.tags',
  'youtube.keyword-evidence',
  'facebook.listings',
  'facebook.videos',
  'facebook.comments',
  'facebook.users',
  'facebook.tags',
  'facebook.keyword-evidence',
  'x.posts',
  'x.comments',
  'x.users',
  'x.tags',
  'x.keyword-evidence',
] as const;
export type Dataset = (typeof datasets)[number];
export const collectionStates = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'needs_human',
  'needs_calibration',
  'cancelled',
  'interrupted',
] as const;
export type CollectionState = (typeof collectionStates)[number];
export type UploadState = 'pending' | 'uploading' | 'retry_wait' | 'uploaded' | 'blocked';
export const debugStatuses = ['open', 'diagnosed', 'resolved', 'blocked'] as const;
export type DebugStatus = (typeof debugStatuses)[number];
export type RunDebug = {
  status: DebugStatus;
  reason: string;
  copiedAt?: string;
  updatedAt: string;
};
export const keywordInput = z
  .object({
    keyword: z.string().trim().min(1).max(300),
    videoLimit: z.number().int().min(1).max(200).default(10),
    minLikes: z.number().int().min(0).nullable().default(100),
    commentsPerVideo: z.number().int().min(0).max(500).default(50),
    totalComments: z.number().int().min(0).max(5000).default(500),
    maxMinutes: z.number().int().min(1).max(60).default(15),
  })
  .strict();
export type KeywordInput = z.infer<typeof keywordInput>;
export const accountUrlSchema = z
  .string()
  .trim()
  .max(300)
  .transform((value, ctx) => {
    const handle = /^@?([a-zA-Z0-9_.]{1,24})$/.exec(value)?.[1];
    if (handle) return `https://www.tiktok.com/@${handle}`;
    try {
      const url = new URL(value);
      const match = /^\/@([a-zA-Z0-9_.]{1,24})\/?$/.exec(url.pathname);
      if (
        url.protocol === 'https:' &&
        ['www.tiktok.com', 'tiktok.com'].includes(url.hostname) &&
        !url.port &&
        !url.username &&
        !url.password &&
        match
      )
        return `https://www.tiktok.com/@${match[1]}`;
    } catch {}
    ctx.addIssue({ code: 'custom', message: '请输入 TikTok 账号或 HTTPS 主页地址' });
    return z.NEVER;
  });
export const accountInput = z
  .object({
    kind: z.literal('account'),
    accountUrl: accountUrlSchema,
    videoLimit: z.number().int().min(1).max(200).default(5),
    collectComments: z.boolean().default(false),
    commentsPerVideo: z.number().int().min(1).max(500).default(20),
    commentOrder: z.enum(['latest', 'default']).default('latest'),
    maxMinutes: z.number().int().min(1).max(60).default(15),
  })
  .strict();
export type AccountInput = z.infer<typeof accountInput>;
export const studioInput = z
  .object({
    kind: z.literal('studio'),
    profileId: identifier.optional(),
    workspaceId: z.number().int().positive().optional(),
    cookieAccountId: z.string().uuid().optional(),
    maxMinutes: z.number().int().min(1).max(60).default(60),
  })
  .strict();
export type StudioInput = z.infer<typeof studioInput>;
export function isFullTikTokVideoUrl(url: string) {
  return /^https:\/\/www\.tiktok\.com\/@[a-zA-Z0-9_.]{1,24}\/(?:video|photo)\/\d+$/.test(url);
}
export const videoUrlSchema = z
  .string()
  .trim()
  .max(1000)
  .transform((value, ctx) => {
    try {
      const url = new URL(value);
      const direct = /^\/@[a-zA-Z0-9_.]{1,24}\/(?:video|photo)\/\d+\/?$/.test(url.pathname);
      const short =
        ['vm.tiktok.com', 'vt.tiktok.com'].includes(url.hostname) &&
        /^\/[a-zA-Z0-9]+\/?$/.test(url.pathname);
      const share =
        ['www.tiktok.com', 'tiktok.com'].includes(url.hostname) &&
        /^\/t\/[a-zA-Z0-9]+\/?$/.test(url.pathname);
      if (
        url.protocol === 'https:' &&
        !url.port &&
        !url.username &&
        !url.password &&
        ((['www.tiktok.com', 'tiktok.com'].includes(url.hostname) && direct) || short || share)
      ) {
        return `https://${direct ? 'www.tiktok.com' : url.hostname}${url.pathname.replace(/\/$/, '')}`;
      }
    } catch {}
    ctx.addIssue({ code: 'custom', message: '请输入 TikTok 视频或图文 HTTPS 链接、分享短链接' });
    return z.NEVER;
  });
export const videoCommentsInput = z
  .object({
    kind: z.literal('video-comments'),
    videoUrl: videoUrlSchema,
    maxComments: z.number().int().min(1).max(100000).default(500),
    maxMinutes: z.number().int().min(1).max(60).default(60),
  })
  .strict();
export type VideoCommentsInput = z.infer<typeof videoCommentsInput>;
export function isVideoCommentsInput(
  input: TaskInput | null | undefined,
): input is VideoCommentsInput {
  return !!input && 'kind' in input && input.kind === 'video-comments';
}
export const taskInput = z.union([videoCommentsInput, studioInput, accountInput, keywordInput]);
export type TaskInput = z.infer<typeof taskInput>;
const wallTime = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const cronExpression = z
  .string()
  .trim()
  .max(200)
  .regex(/^[\d*,/-]+(?:\s+[\d*,/-]+){4}$/, 'Cron 必须是五个字段：分 时 日 月 周');
export const scheduleRule = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('cron'), expression: cronExpression }).strict(),
  z.object({ kind: z.literal('delay'), seconds: z.number().int().min(1).max(31536000) }).strict(),
  z.object({ kind: z.literal('once'), at: z.string().datetime() }).strict(),
  z.object({ kind: z.literal('hourly'), minute: z.number().int().min(0).max(59) }).strict(),
  z.object({ kind: z.literal('daily'), time: wallTime }).strict(),
  z
    .object({
      kind: z.literal('weekly'),
      time: wallTime,
      weekdays: z
        .array(z.number().int().min(0).max(6))
        .min(1)
        .max(7)
        .refine((days) => new Set(days).size === days.length),
    })
    .strict(),
]);
export type ScheduleRule = z.infer<typeof scheduleRule>;
export type TaskSchedule = {
  configVersion?: string;
  scheduleId: string;
  taskId: string;
  ownerId: string;
  rule: ScheduleRule;
  timeZone: string;
  enabled: boolean;
  nextRunAt: string | null;
  pendingAt: string | null;
  lastRunId: string | null;
  lastScheduledAt: string | null;
  lastError: string | null;
  updatedAt: string;
};
export const runTrigger = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('manual') }).strict(),
  z
    .object({
      kind: z.literal('schedule'),
      scheduleId: identifier,
      scheduledAt: z.string().datetime(),
      scheduleKind: z.enum(['delay', 'once', 'hourly', 'daily', 'weekly', 'cron']),
    })
    .strict(),
]);
export type RunTrigger = z.infer<typeof runTrigger>;
export function isStudioInput(input: unknown): input is StudioInput {
  return (
    !!input &&
    typeof input === 'object' &&
    'kind' in input &&
    (input as { kind: unknown }).kind === 'studio'
  );
}
export function isAccountInput(input: TaskInput | null | undefined): input is AccountInput {
  return !!input && typeof input === 'object' && 'kind' in input && input.kind === 'account';
}
export function inputLabel(input: TaskInput): string {
  if (isVideoCommentsInput(input)) return input.videoUrl;
  if (isStudioInput(input))
    return input.cookieAccountId
      ? 'TikTok Studio'
      : `TikTok Studio · ${input.profileId ?? 'account'}`;
  return isAccountInput(input) ? input.accountUrl : input.keyword;
}
export const scriptIds = [
  'tiktok.video-comments',
  'tiktok.keyword-research',
  'tiktok.account-videos',
  'tiktok.studio-videos',
  'instagram.keyword-research',
  'youtube.keyword-research',
  'facebook.keyword-research',
  'x.keyword-research',
] as const;
export type ScriptId = (typeof scriptIds)[number];

export function keywordScriptId(platform = 'TikTok'): ScriptId {
  if (platform === 'Instagram') return 'instagram.keyword-research';
  if (platform === 'YouTube') return 'youtube.keyword-research';
  if (platform === 'Facebook') return 'facebook.keyword-research';
  if (platform === 'X') return 'x.keyword-research';
  return 'tiktok.keyword-research';
}
export function keywordUsesServerApi(platform: string) {
  return (
    platform === 'TikTok' ||
    platform === 'Instagram' ||
    platform === 'Facebook' ||
    platform === 'YouTube' ||
    platform === 'X'
  );
}

export function inputScriptId(input: TaskInput, platform = 'TikTok'): ScriptId {
  if (isVideoCommentsInput(input)) return 'tiktok.video-comments';
  if (isStudioInput(input)) return 'tiktok.studio-videos';
  if (isAccountInput(input)) return 'tiktok.account-videos';
  return keywordScriptId(platform);
}

export const profileTags = z
  .array(z.string().trim().min(1).max(40))
  .max(20)
  .default([])
  .transform((tags) => [
    ...new Map(
      tags.map((tag) => {
        const key = tag.toLowerCase();
        const builtIn: Record<string, string> = {
          tiktok: 'TikTok',
          facebook: 'Facebook',
          youtube: 'YouTube',
          instagram: 'Instagram',
          x: 'X',
        };
        return [key, builtIn[key] ?? tag];
      }),
    ).values(),
  ]);
export type PlatformHealth = {
  state: 'unknown' | 'ready' | 'login_required' | 'needs_human' | 'cooldown';
  reason?: string;
  checkedAt?: string;
};
export type BrowserDispatch = {
  dispatchId: string;
  profileId: string;
  workspaceId: number;
  startedAt: string;
  finishedAt?: string;
  status: 'running' | 'succeeded' | 'failed';
  error?: { code: string; message: string };
  diagnosticFile?: string;
};
export const profileSchema = z
  .object({
    profileId: identifier,
    workspaceId: z.number().int().positive(),
    name: z.string().trim().min(1).max(200),
    enabled: z.boolean().default(true),
    tags: profileTags,
  })
  .strict();
export type ProfileBinding = z.infer<typeof profileSchema> & {
  projectId?: number;
  windowSortNum?: number;
  windowNumber?: string;
  ownerId: string;
  available?: boolean;
  checkedAt?: string;
  health?: string;
  platforms?: Record<string, PlatformHealth>;
  activeTasks?: number;
  lastUsedAt?: string;
  cleanupFailed?: boolean;
};
export const roxyConfigSchema = z
  .object({
    apiHost: z
      .string()
      .url()
      .refine((value) => {
        const url = new URL(value);
        return (
          ['http:', 'https:'].includes(url.protocol) &&
          ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
          !url.username &&
          !url.password &&
          url.origin === value
        );
      }, 'Roxy OpenAPI 必须使用本机 origin'),
    apiKey: z.string().min(1).max(4096),
  })
  .strict();
export type RoxyConfig = z.infer<typeof roxyConfigSchema>;
export type RoxyProject = { projectId: number; projectName: string };
export type RoxyWorkspace = { id: number; name: string };
export const taskExecutionSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('client-browser') }).strict(),
    z
      .object({
        kind: z.literal('server-api'),
        operation: z.enum([
          'account-info',
          'video-comments',
          'search',
          'keyword-research',
          'studio',
        ]),
        cookieAccountId: z.string().uuid().optional(),
        maxPages: z.number().int().min(1).max(100).default(10),
      })
      .strict(),
  ])
  .refine(
    (value) =>
      value.kind !== 'server-api' ||
      value.operation === 'keyword-research' ||
      value.operation === 'video-comments' ||
      !!value.cookieAccountId,
    '该 API 操作需要采集账号',
  );
export type TaskExecution = z.infer<typeof taskExecutionSchema>;
export const SERVER_API_DEVICE = 'server-api';
export function studioServerExecution(cookieAccountId: string, maxPages = 100): TaskExecution {
  return { kind: 'server-api', operation: 'studio', cookieAccountId, maxPages };
}
export function coerceStudioTask<T extends { execution?: TaskExecution; input?: unknown }>(
  task: T,
): T {
  if (!isStudioInput(task.input) || !task.input.cookieAccountId) return task;
  const cookieAccountId = task.input.cookieAccountId;
  if (
    task.execution?.kind === 'server-api' &&
    task.execution.operation === 'studio' &&
    task.execution.cookieAccountId === cookieAccountId
  )
    return task;
  return {
    ...task,
    execution: studioServerExecution(
      cookieAccountId,
      task.execution?.kind === 'server-api' ? task.execution.maxPages : 100,
    ),
  };
}
export function coerceKeywordApiTask<
  T extends { execution?: TaskExecution; input?: unknown; platform?: string },
>(task: T): T {
  if (
    !['Instagram', 'Facebook', 'YouTube', 'X'].includes(task.platform ?? '') ||
    !task.input ||
    typeof task.input !== 'object' ||
    'kind' in task.input
  )
    return task;
  if (task.execution?.kind === 'server-api' && task.execution.operation === 'keyword-research')
    return task;
  return {
    ...task,
    execution: {
      kind: 'server-api',
      operation: 'keyword-research',
      maxPages: task.execution?.kind === 'server-api' ? task.execution.maxPages : 100,
    },
  };
}
export function coerceCloudTask<
  T extends { execution?: TaskExecution; input?: unknown; platform?: string },
>(task: T): T {
  return coerceKeywordApiTask(coerceStudioTask(task));
}
export function isServerApiTask(task: {
  execution?: TaskExecution;
  input?: unknown;
  platform?: string;
}) {
  return coerceCloudTask(task).execution?.kind === 'server-api';
}
export type TaskRecord = {
  taskId: string;
  ownerId: string;
  name: string;
  platform: string;
  input: TaskInput;
  createdAt: string;
  groupName?: string;
  execution?: TaskExecution;
};
export type RunRecord = {
  trigger?: RunTrigger;
  runId: string;
  attemptId: string;
  taskId: string;
  ownerId: string;
  deviceId: string;
  input: TaskInput;
  platform: string;
  profileId: string | null;
  workspaceId: number | null;
  dispatches: BrowserDispatch[];
  startedAt: string | null;
  scriptVersion: string;
  collectionStatus: CollectionState;
  uploadStatus: UploadState;
  step: string;
  counts: Record<string, number>;
  error: { code: string; message: string } | null;
  createdAt: string;
  finishedAt: string | null;
  cancelRequested: boolean;
  debug?: RunDebug;
  groupName?: string;
};
export const fileEntrySchema = z
  .object({
    name: z
      .string()
      .regex(/^(?:batch-\d{6}\.json|diagnostic\.json|diagnostic-[a-zA-Z0-9_-]{1,100}\.json)$/),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    bytes: z
      .number()
      .int()
      .min(1)
      .max(4 * 1024 * 1024),
    dataset: z.enum(datasets).optional(),
    count: z.number().int().nonnegative(),
  })
  .strict();
export type FileEntry = z.infer<typeof fileEntrySchema>;
export const reportSchema = z
  .object({
    trigger: runTrigger.optional(),
    schemaVersion: z.literal(1),
    runId: identifier,
    attemptId: identifier,
    deviceId: identifier,
    taskId: identifier,
    scriptId: z.enum(scriptIds),
    scriptVersion: z.string().max(100),
    input: taskInput,
    collectionStatus: z.enum(collectionStates).refine((s) => s !== 'running' && s !== 'queued'),
    createdAt: z.string().datetime(),
    startedAt: z.string().datetime().optional(),
    finishedAt: z.string().datetime(),
    resultComplete: z.boolean(),
    counts: z.record(z.string().max(100), z.number().int().nonnegative()),
    error: z.object({ code: z.string().max(100), message: z.string().max(2000) }).nullable(),
    files: z.array(fileEntrySchema).max(2000),
    groupName: z.string().trim().min(1).max(40).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const expected = isVideoCommentsInput(value.input)
      ? ['tiktok.video-comments']
      : isStudioInput(value.input)
        ? ['tiktok.studio-videos']
        : isAccountInput(value.input)
          ? ['tiktok.account-videos']
          : [
              'tiktok.keyword-research',
              'instagram.keyword-research',
              'youtube.keyword-research',
              'facebook.keyword-research',
              'x.keyword-research',
            ];
    if (!expected.includes(value.scriptId))
      ctx.addIssue({ code: 'custom', message: '脚本与任务输入不一致' });
    if (value.resultComplete !== (value.collectionStatus === 'succeeded'))
      ctx.addIssue({ code: 'custom', message: '完整性与采集状态不一致' });
    const counts: Record<string, number> = {};
    for (const file of value.files) {
      if (file.name.startsWith('diagnostic') ? !!file.dataset || file.count !== 0 : !file.dataset)
        ctx.addIssue({ code: 'custom', message: '文件类型与数据集不一致' });
      if (file.dataset) counts[file.dataset] = (counts[file.dataset] ?? 0) + file.count;
    }
    if (
      Object.keys({ ...counts, ...value.counts }).some(
        (key) => (counts[key] ?? 0) !== (value.counts[key] ?? 0),
      )
    )
      ctx.addIssue({ code: 'custom', message: '计数与批次不一致' });
    if (new Set(value.files.map((f) => f.name)).size !== value.files.length)
      ctx.addIssue({ code: 'custom', message: '文件名重复' });
  });
export type ReportManifest = z.infer<typeof reportSchema>;
export type CommentSummary = {
  collected: number;
  added: number;
  existing: number;
  totalAfter: number;
  currentTotal?: number;
  videoIds: string[];
};
export type ReportRow = ReportManifest & {
  uploadedAt: string | null;
  commentSummary?: CommentSummary;
};
export const concurrencySettingsSchema = z
  .object({
    maxBrowsers: z.number().int().min(1).max(100),
    maxBrowserlessTasks: z.number().int().min(1).max(500),
  })
  .strict();
export type ConcurrencySettings = z.infer<typeof concurrencySettingsSchema>;
export const defaultConcurrencySettings: ConcurrencySettings = {
  maxBrowsers: 5,
  maxBrowserlessTasks: 20,
};
export const apiPressureLevels = ['low', 'medium', 'high', 'very-high', 'extreme'] as const;
export type ApiPressure = (typeof apiPressureLevels)[number];
export const apiPressureSchema = z.enum(apiPressureLevels);
export const API_PRESSURE_MULTIPLIER: Record<ApiPressure, number> = {
  low: 1,
  medium: 2,
  high: 4,
  'very-high': 8,
  extreme: 16,
};
export const DEFAULT_API_PRESSURE: ApiPressure = 'high';
export const DEFAULT_MAX_TASKS_PER_ACCOUNT = 2;
export const maxTasksPerAccountSchema = z.number().int().min(1).max(20);
const API_JOB_MEMORY = 32 * 1024 * 1024;
export function apiConcurrencyLimits(input: {
  pressure: ApiPressure;
  cores: number;
  totalmem: number;
  maxTasksPerAccount?: number;
}) {
  const cores = Math.max(1, Math.floor(input.cores));
  const fromCpu = cores * API_PRESSURE_MULTIPLIER[input.pressure];
  const fromMemory = Math.max(8, Math.floor((input.totalmem * 0.25) / API_JOB_MEMORY));
  const maxRunning = Math.min(256, Math.max(8, Math.min(fromCpu, fromMemory)));
  const maxTasksPerAccount = maxTasksPerAccountSchema
    .catch(DEFAULT_MAX_TASKS_PER_ACCOUNT)
    .parse(input.maxTasksPerAccount ?? DEFAULT_MAX_TASKS_PER_ACCOUNT);
  return {
    pressure: input.pressure,
    cores,
    maxRunning,
    maxPerOwner: maxRunning,
    maxTasksPerAccount,
    maxQueued: 2000,
    maxQueuedPerOwner: 500,
  };
}
export type ApiConcurrencyLimits = ReturnType<typeof apiConcurrencyLimits>;
/** Intent recognition applies to comment data from every platform, regardless of script. */
export function isIntentDataset(dataset: string | undefined) {
  return dataset?.endsWith('.comments') === true;
}
export const intentSettingsSchema = z
  .object({
    enabled: z.boolean(),
    apiKey: z.string().trim().min(1).max(4096).optional(),
  })
  .strict()
  .refine((value) => !value.enabled || !!value.apiKey, '使用 API 识别时需要 TypeSafe API Key');
export type IntentSettings = z.infer<typeof intentSettingsSchema>;
export type BusinessSnapshot = {
  connection: {
    apiHost?: string;
    configured: boolean;
    syncedAt?: string;
    revision?: number;
    cacheKey?: string;
  };
  projectCatalog?: { workspaceId: number; projects: RoxyProject[]; syncedAt: string };
  profiles: ProfileBinding[];
  scripts: { platform: string; scriptId: string; version: string }[];
  scheduler: {
    maxBrowsers: number;
    maxBrowserlessTasks: number;
    maxTabsPerBrowser: number;
    activeTasks: number;
  };
  taskSync?: {
    ready: boolean;
    error: string | null;
    executorDeviceId: string | null;
    deviceId: string;
  };
  tasks: TaskRecord[];
  schedules: TaskSchedule[];
  keywordGroups: string[];
  runs: RunRecord[];
  activeOwner: boolean;
  mode: 'ready' | 'draining';
};
export type ReportTransport = (request: {
  ownerId: string;
  path: string;
  method: 'PUT' | 'POST';
  body: string;
}) => Promise<{ status: number; value?: unknown }>;
export const businessParams = {
  'profiles.saveAccount': poolBrowserExtract,
  'profiles.saveAccounts': poolBrowserBatchExtract,
  'executor.export': z.object({}).strict(),
  'executor.import': z.object({ backup: z.unknown() }).strict(),
  'business.snapshot': z.object({}).strict(),
  'scheduler.configure': concurrencySettingsSchema,
  'roxy.discover': z.object({}).strict(),
  'roxy.health': roxyConfigSchema,
  'profiles.sync': z.object({ workspaceId: z.number().int().positive().optional() }).strict(),
  'roxy.projects': z.object({}).strict(),
  'roxy.workspaces': z.object({}).strict(),
  'profiles.save': profileSchema,
  'profiles.releasePause': z
    .object({ profileId: identifier, workspaceId: z.number().int().positive() })
    .strict(),
  'profiles.resetPlatform': z
    .object({
      profileId: identifier,
      workspaceId: z.number().int().positive(),
      platform: z.string().trim().min(1).max(40),
    })
    .strict(),
  'tasks.create': z
    .object({
      name: z.string().trim().min(1).max(200),
      platform: z.string().trim().min(1).max(40),
      input: taskInput,
      execution: taskExecutionSchema.optional(),
      startImmediately: z.boolean().default(false),
      groupName: z.string().trim().min(1).max(40).optional(),
    })
    .strict(),
  'tasks.update': z
    .object({
      taskId: identifier,
      name: z.string().trim().min(1).max(200),
      platform: z.string().trim().min(1).max(40),
      input: taskInput,
      execution: taskExecutionSchema.optional(),
      groupName: z.string().trim().min(1).max(40).nullable().optional(),
    })
    .strict(),
  'tasks.createMany': z
    .object({
      platform: z.string().trim().min(1).max(40),
      execution: taskExecutionSchema.optional(),
      groupName: z.string().trim().min(1).max(40).optional(),
      keywords: z
        .array(
          z.union([
            z.string().trim().min(1).max(300),
            z
              .object({
                keyword: z.string().trim().min(1).max(300),
                groupName: z.string().trim().min(1).max(40).optional(),
              })
              .strict(),
          ]),
        )
        .min(1)
        .max(30),
      videoLimit: z.number().int().min(1).max(200).default(10),
      minLikes: z.number().int().min(0).nullable().default(100),
      commentsPerVideo: z.number().int().min(0).max(500).default(50),
      totalComments: z.number().int().min(0).max(5000).default(500),
      maxMinutes: z.number().int().min(1).max(60).default(15),
    })
    .strict(),
  'tasks.createManyVideos': z
    .object({
      platform: z.literal('TikTok'),
      execution: taskExecutionSchema.optional(),
      groupName: z.string().trim().min(1).max(40).optional(),
      videos: z
        .array(
          z.union([
            z.string().trim().min(1).max(1000),
            z
              .object({
                videoUrl: z.string().trim().min(1).max(1000),
                groupName: z.string().trim().min(1).max(40).optional(),
              })
              .strict(),
          ]),
        )
        .min(1)
        .max(30),
      maxComments: z.number().int().min(1).max(100000).default(500),
      maxMinutes: z.number().int().min(1).max(60).default(60),
    })
    .strict()
    .refine(
      (value) =>
        !value.execution ||
        value.execution.kind === 'client-browser' ||
        (value.execution.kind === 'server-api' && value.execution.operation === 'video-comments'),
      '批量视频评论只能使用视频评论执行方式',
    ),
  'tasks.createManyStudio': z
    .object({
      groupName: z.string().trim().min(1).max(40).optional(),
      maxMinutes: z.number().int().min(1).max(60).default(60),
      cookieAccountIds: z.array(z.string().uuid()).min(1).max(200),
    })
    .strict(),
  'groups.create': z
    .object({
      name: z.string().trim().min(1).max(40),
      category: z.enum(['keyword', 'video-comments', 'studio', 'account']).optional(),
    })
    .strict(),
  'groups.delete': z
    .object({
      name: z.string().trim().min(1).max(40),
      category: z.enum(['keyword', 'video-comments', 'studio', 'account']).optional(),
    })
    .strict(),
  'tasks.setGroup': z
    .object({
      taskId: identifier,
      groupName: z.string().trim().min(1).max(40).nullable(),
    })
    .strict(),
  'tasks.setExecutor': z.object({ deviceId: identifier }).strict(),
  'tasks.start': z.object({ taskId: identifier }).strict(),
  'schedules.save': z.object({ taskId: identifier, rule: scheduleRule }).strict(),
  'schedules.preview': z.object({ rule: scheduleRule }).strict(),
  'schedules.setEnabled': z.object({ taskId: identifier, enabled: z.boolean() }).strict(),
  'schedules.delete': z.object({ taskId: identifier }).strict(),
  'tasks.delete': z.object({ taskId: identifier }).strict(),
  'runs.cancel': z.object({ runId: identifier }).strict(),
  'runs.retryUpload': z.object({ runId: identifier }).strict(),
  'runs.inspect': z.object({ runId: identifier }).strict(),
  'runs.delete': z.object({ runId: identifier }).strict(),
  'runs.debugPrompt': z.object({ runId: identifier }).strict(),
  'runs.diagnose': z
    .object({
      runId: identifier,
      status: z.enum(debugStatuses),
      reason: z.string().trim().min(1).max(2000),
    })
    .strict(),
  'runs.reproduce': z
    .object({
      runId: identifier,
      profileId: identifier.optional(),
      workspaceId: z.number().int().positive().optional(),
    })
    .strict()
    .refine((v) => !!v.profileId === !!v.workspaceId, '窗口和工作区必须同时提供'),
  'account.suspend': z.object({}).strict(),
} as const;
