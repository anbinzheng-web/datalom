import { z } from 'zod';
const text = z.string().max(32768);
const originUrl = z
  .string()
  .url()
  .max(32768)
  .refine((v) => new URL(v).origin === 'https://www.tiktok.com');
const storage = z.record(z.string().max(512), text).refine((v) => Object.keys(v).length <= 100);
export const pageJSState = z
  .object({
    schemaVersion: z.literal(1),
    capturedAt: z.string().datetime(),
    url: originUrl,
    // Private account-scoped request context; only persisted inside encrypted credentials.
    searchTemplate: originUrl
      .refine((v) => {
        const u = new URL(v);
        return u.pathname === '/api/search/general/full/' && !u.username && !u.password && !u.hash;
      })
      .optional(),
    referrer: z.string().max(32768),
    documentCookie: text,
    localStorage: storage,
    sessionStorage: storage,
    timeOrigin: z.number().finite(),
    performanceNow: z.number().finite(),
    visibilityState: z.string().max(30),
    readyState: z.string().max(30),
    bootstrap: z.record(
      z.string().max(100),
      z.union([z.string().max(2048), z.number().finite(), z.boolean(), z.null()]),
    ),
    sdkGlobals: z.array(z.string().max(100)).max(30),
    omittedStorage: z
      .array(
        z
          .object({
            area: z.enum(['local', 'session']),
            key: z.string().max(512),
            size: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .max(1000)
      .default([]),
    initCapture: z.literal('not-observed'),
  })
  .strict()
  .refine((v) => JSON.stringify(v).length <= 160000, 'JS_STATE_TOO_LARGE');
export type PageJSState = z.infer<typeof pageJSState>;
