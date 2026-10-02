import { z } from 'zod';
import { identifier, collectionStates, datasets } from './business.ts';

export const executionRequestSchema = z.discriminatedUnion('action', [
  z
    .object({
      requestId: identifier,
      action: z.literal('start'),
      taskId: identifier,
      deviceId: identifier,
    })
    .strict(),
  z
    .object({
      requestId: identifier,
      action: z.literal('cancel'),
      taskId: identifier,
      deviceId: identifier,
      runId: identifier,
    })
    .strict(),
]);
export type ExecutionRequest = z.infer<typeof executionRequestSchema>;
export const executionCommandSchema = z.object({
  request: executionRequestSchema,
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  status: z.enum(['pending', 'delivered', 'accepted', 'rejected', 'expired']),
  runId: identifier.optional(),
  error: z.string().max(100).optional(),
});
export type ExecutionCommand = z.infer<typeof executionCommandSchema>;
export const executionRunSchema = z.object({
  runId: identifier,
  taskId: identifier,
  collectionStatus: z.enum(collectionStates),
  uploadStatus: z.enum(['pending', 'uploading', 'retry_wait', 'uploaded', 'blocked']),
  counts: z.partialRecord(z.enum(datasets), z.number().int().nonnegative()),
  step: z.string().max(1000),
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
  cancelRequested: z.boolean(),
  errorCode: z.string().max(100).nullable(),
});
export type ExecutionRun = z.infer<typeof executionRunSchema>;
export const executionAckSchema = z
  .object({
    requestId: identifier,
    status: z.enum(['accepted', 'rejected']),
    runId: identifier.optional(),
    error: z.string().max(100).optional(),
  })
  .strict();
export type ExecutionAck = z.infer<typeof executionAckSchema>;
export const executionExchangeSchema = z
  .object({
    generation: z.number().int().positive(),
    sequence: z.number().int().positive(),
    deviceId: identifier,
    runs: z.array(executionRunSchema).max(500),
    acknowledgements: z.array(executionAckSchema).max(50),
  })
  .strict();
export type ExecutionState = {
  serverTime: number;
  devices: { deviceId: string; receivedAt: string; online: boolean; runs: ExecutionRun[] }[];
  commands: ExecutionCommand[];
};
export const EXECUTOR_ONLINE_MS = 45_000;

export const executionCommandsSchema = z.object({
  commands: z.array(executionCommandSchema).max(20),
});
