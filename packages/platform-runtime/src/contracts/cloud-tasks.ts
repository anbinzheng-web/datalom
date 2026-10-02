import { z } from 'zod';
import {
  identifier,
  taskInput,
  scheduleRule,
  taskExecutionSchema,
  isVideoCommentsInput,
  isStudioInput,
  isAccountInput,
  isFullTikTokVideoUrl,
} from './business.ts';

export const cloudTaskSchema = z
  .object({
    taskId: identifier,
    ownerId: identifier,
    name: z.string().trim().min(1).max(200),
    platform: z.enum(['TikTok', 'Instagram', 'YouTube', 'Facebook', 'X']),
    input: taskInput,
    execution: taskExecutionSchema.optional(),
    createdAt: z.string().datetime(),
    groupName: z.string().trim().min(1).max(40).optional(),
  })
  .strict()
  .refine((t) => !('kind' in t.input) || t.platform === 'TikTok', '该任务类型仅支持 TikTok')
  .refine((t) => {
    if (t.execution?.kind !== 'server-api') return true;
    if (t.execution.operation === 'keyword-research')
      return (
        !('kind' in t.input) &&
        ['TikTok', 'Instagram', 'Facebook', 'YouTube', 'X'].includes(t.platform)
      );
    if (t.platform !== 'TikTok') return false;
    if (t.execution.operation === 'video-comments')
      return (
        isVideoCommentsInput(t.input) &&
        t.input.maxComments <= 5000 &&
        isFullTikTokVideoUrl(t.input.videoUrl)
      );
    if (t.execution.operation === 'studio')
      return isStudioInput(t.input) && !!t.execution.cookieAccountId;
    return !('kind' in t.input);
  }, 'API 任务仅支持 TikTok 关键词挖掘、账号信息、搜索、Studio 或完整视频链接评论，以及 Instagram/Facebook/YouTube/X 关键词挖掘');
export const cloudScheduleSchema = z
  .object({
    configVersion: identifier.optional(),
    scheduleId: identifier,
    taskId: identifier,
    ownerId: identifier,
    rule: scheduleRule,
    timeZone: z
      .string()
      .max(100)
      .refine((v) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: v });
          return true;
        } catch {
          return false;
        }
      }),
    enabled: z.boolean(),
    nextRunAt: z.string().datetime().nullable(),
    pendingAt: z.string().datetime().nullable(),
    lastRunId: identifier.nullable(),
    lastScheduledAt: z.string().datetime().nullable(),
    lastError: z.string().max(500).nullable(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export const cloudProfileSchema = z.object({
  profileId: identifier,
  workspaceId: z.number().int().positive(),
  name: z.string().max(300),
  windowNumber: z.string().max(40).optional(),
  windowSortNum: z.number().int().nonnegative().optional(),
});
export const cloudSyncSchema = z.object({
  deviceId: identifier,
  name: z.string().max(100),
  schedules: z.array(cloudScheduleSchema).max(10000),
  profiles: z.array(cloudProfileSchema).max(10000),
});
export type CloudDevice = {
  deviceId: string;
  name: string;
  lastSeenAt: string;
  profiles: z.infer<typeof cloudProfileSchema>[];
};
export const taskGroupCategories = ['keyword', 'video-comments', 'studio', 'account'] as const;
export type TaskGroupCategory = (typeof taskGroupCategories)[number];
export function groupCategoryOfSection(category: string): TaskGroupCategory {
  if (category === 'studio') return 'studio';
  if (category === 'video-comments' || category === 'video-comments-browser')
    return 'video-comments';
  if (category === 'account') return 'account';
  return 'keyword';
}
export function groupCategoryOfTask(task: {
  input: z.infer<typeof cloudTaskSchema>['input'];
  execution?: z.infer<typeof cloudTaskSchema>['execution'];
}): TaskGroupCategory {
  if (task.execution?.kind === 'server-api') {
    if (task.execution.operation === 'video-comments') return 'video-comments';
    if (task.execution.operation === 'studio') return 'studio';
    if (task.execution.operation === 'account-info') return 'account';
    return 'keyword';
  }
  if (isStudioInput(task.input)) return 'studio';
  if (isVideoCommentsInput(task.input)) return 'video-comments';
  if (isAccountInput(task.input)) return 'account';
  return 'keyword';
}
export function catalogGroupsOf(
  catalog: Pick<TaskCatalog, 'keywordGroups' | 'taskGroups'>,
  category: string,
) {
  const key = groupCategoryOfSection(category);
  if (key === 'keyword') return catalog.keywordGroups ?? [];
  return catalog.taskGroups?.[key] ?? [];
}
export type TaskCatalog = {
  revision: number;
  tasks: z.infer<typeof cloudTaskSchema>[];
  schedules: z.infer<typeof cloudScheduleSchema>[];
  keywordGroups: string[];
  taskGroups?: Partial<Record<TaskGroupCategory, string[]>>;
  executorDeviceId: string | null;
  devices: CloudDevice[];
};
export const cloudTaskMethods = [
  'tasks.create',
  'tasks.createMany',
  'tasks.createManyVideos',
  'tasks.createManyStudio',
  'tasks.update',
  'tasks.delete',
  'tasks.setGroup',
  'groups.create',
  'groups.delete',
  'schedules.save',
  'schedules.delete',
  'schedules.setEnabled',
  'schedules.preview',
] as const;
export const isCloudTaskMethod = (method: string) =>
  (cloudTaskMethods as readonly string[]).includes(method);
