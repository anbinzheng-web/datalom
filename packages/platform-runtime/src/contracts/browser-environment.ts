import { z } from 'zod';

const headerValue = z
  .string()
  .max(2048)
  .regex(/^[\x20-\x7e]*$/);
export const browserHeaderNames = [
  'user-agent',
  'accept-language',
  'sec-ch-ua',
  'sec-ch-ua-mobile',
  'sec-ch-ua-platform',
  'sec-ch-ua-full-version',
  'sec-ch-ua-full-version-list',
  'sec-ch-ua-platform-version',
  'sec-ch-ua-arch',
  'sec-ch-ua-bitness',
  'sec-ch-ua-model',
  'sec-ch-ua-wow64',
] as const;
export const browserHeaders = z.partialRecord(z.enum(browserHeaderNames), headerValue);
export const browserEnvironment = z
  .object({
    schemaVersion: z.literal(1),
    capturedAt: z.string().datetime(),
    headerSource: z.enum(['navigator-derived', 'observed-request']),
    headers: browserHeaders,
    navigator: z
      .object({
        userAgent: headerValue.min(1),
        platform: z.string().max(200),
        language: z.string().max(100),
        languages: z.array(z.string().max(100)).max(30),
        hardwareConcurrency: z.number().finite().nonnegative().nullable(),
        deviceMemory: z.number().finite().nonnegative().nullable(),
        maxTouchPoints: z.number().finite().nonnegative(),
        cookieEnabled: z.boolean(),
        userAgentData: z
          .object({
            brands: z
              .array(
                z.object({ brand: z.string().max(200), version: z.string().max(100) }).strict(),
              )
              .max(30),
            mobile: z.boolean(),
            platform: z.string().max(200),
            highEntropy: z
              .record(
                z.string().max(100),
                z.union([
                  z.string().max(2048),
                  z.boolean(),
                  z
                    .array(
                      z
                        .object({ brand: z.string().max(200), version: z.string().max(100) })
                        .strict(),
                    )
                    .max(30),
                ]),
              )
              .optional(),
          })
          .strict()
          .nullable(),
      })
      .strict(),
    screen: z
      .object({
        width: z.number().finite(),
        height: z.number().finite(),
        availWidth: z.number().finite(),
        availHeight: z.number().finite(),
        colorDepth: z.number().finite(),
        pixelRatio: z.number().finite(),
      })
      .strict(),
    timezone: z.string().max(100),
  })
  .strict();
export type BrowserEnvironment = z.infer<typeof browserEnvironment>;
export type BrowserHeaders = z.infer<typeof browserHeaders>;
export const browserEnvironmentSummary = z
  .object({
    capturedAt: z.string().datetime(),
    headerSource: z.enum(['navigator-derived', 'observed-request']),
    headerCount: z.number().int().nonnegative(),
  })
  .strict();
export function summarizeBrowserEnvironment(value?: BrowserEnvironment) {
  return value
    ? {
        capturedAt: value.capturedAt,
        headerSource: value.headerSource,
        headerCount: Object.keys(value.headers).length,
      }
    : undefined;
}
