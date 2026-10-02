import { z } from 'zod';
import { concurrencySettingsSchema, profileSchema, roxyConfigSchema } from './business.ts';

export const EXECUTOR_BACKUP_MAX_BYTES = 10 * 1024 * 1024;
export const executorBackupSchema = z
  .object({
    format: z.literal('roxy-crawler-executor'),
    version: z.literal(1),
    exportedAt: z.string().datetime(),
    connection: roxyConfigSchema.nullable(),
    concurrency: concurrencySettingsSchema,
    displayName: z.string().max(100),
    theme: z.enum(['light', 'dark']).optional(),
    profiles: z.array(profileSchema.refine((p) => p.tags.length > 0)).max(20_000),
  })
  .strict()
  .refine((value) => !value.profiles.length || value.connection !== null)
  .refine(
    (value) =>
      new Set(value.profiles.map((p) => `${p.workspaceId}/${p.profileId}`)).size ===
      value.profiles.length,
  );
export type ExecutorBackup = z.infer<typeof executorBackupSchema>;
