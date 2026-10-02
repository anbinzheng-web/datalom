import { z } from 'zod';
export const sdkSessionManifest = z
  .object({
    schemaVersion: z.literal(1),
    sources: z
      .array(
        z
          .object({
            path: z.string().min(1),
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
            resourceUrl: z
              .string()
              .url()
              .max(2048)
              .refine((value) => {
                if (!URL.canParse(value)) return false;
                const url = new URL(value);
                return (
                  url.protocol === 'https:' &&
                  !url.username &&
                  !url.password &&
                  !url.search &&
                  !url.hash
                );
              })
              .optional(),
          })
          .strict(),
      )
      .min(1)
      .max(5)
      .refine((sources) => {
        const urls = sources.flatMap((source) => (source.resourceUrl ? [source.resourceUrl] : []));
        return new Set(urls).size === urls.length;
      }),
    init: z
      .object({
        provenance: z.enum(['observed', 'loader-derived-experiment', 'synthetic']),
        config: z.record(z.string(), z.unknown()),
        additionalConfigs: z.array(z.record(z.string(), z.unknown())).max(5).default([]),
      })
      .strict(),
  })
  .strict();
