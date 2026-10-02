import { endpoints as tiktok } from '../platforms/tiktok/tiktok.endpoints.js';
import { endpoints as instagram } from '../platforms/instagram/instagram.endpoints.js';
import { endpoints as facebook } from '../platforms/facebook/facebook.endpoints.js';
import { endpoints as x } from '../platforms/x/x.endpoints.js';
import type { EndpointDefinition } from '../public-api/platform-endpoint.js';
import { schemas } from './schemas.js';

// The same endpoint registries drive request validation and this document.
export function publicSpecification() {
  const paths: Record<string, any> = {};
  const registries: Record<string, Record<string, EndpointDefinition>> = {
    tiktok: Object.fromEntries(Object.entries(tiktok).map(([path, def]) => [path, {
      ...def, required: [...def.required], numbers: ['count'], defaults: { count: 20 },
      cursorKey: def.paginated ? 'cursor' : undefined,
    }])),
    instagram, facebook, x,
  };
  for (const [platform, endpoints] of Object.entries(registries)) {
    for (const [path, def] of Object.entries(endpoints)) {
      const parameters = Object.entries(def.fields).map(([name, field]) => ({
        name, in: 'query', required: def.required.includes(name),
        schema: {
          ...(def.numbers?.includes(name)
            ? { type: 'integer', minimum: 1, maximum: def.maxCount ?? 50 }
            : { type: 'string', minLength: 1, maxLength: 1024 }),
          ...(def.defaults?.[field] !== undefined ? { default: def.defaults[field] } : {}),
        },
      }));
      if (def.cursorKey) parameters.push({
        name: 'cursor', in: 'query', required: false,
        schema: { type: 'string', minLength: 1, maxLength: platform === 'tiktok' ? 4096 : 24000 },
      });
      paths[`/api/v1/${platform}/web/${path}`] = { get: {
        operationId: `${platform}_${path.replaceAll('/', '_').replaceAll('-', '_')}`,
        tags: [platform], security: [{ publicApiKey: [] }], parameters,
        description: platform === 'tiktok' && path === 'user/detail'
          ? 'Requires username or sec_uid.'
          : 'One platform page. Unknown parameters are rejected.',
        responses: Object.fromEntries([200, 400, 401, 429, 502, 503, 504].map(status => [status, {
          description: status === 200 ? 'One platform page' : 'Request failed',
          content: { 'application/json': { schema: {
            $ref: `#/components/schemas/${status === 200 ? 'PlatformResponse' : 'PublicApiError'}`,
          } } },
        }])),
      } };
    }
  }
  return {
    openapi: '3.0.3' as const,
    info: { title: 'Datalom public platform API', version: '1.0.0' },
    security: [{ publicApiKey: [] }], paths,
    components: {
      securitySchemes: { publicApiKey: { type: 'http' as const, scheme: 'bearer' } },
      schemas: { PlatformResponse: schemas.PlatformResponse, PublicApiError: schemas.PublicApiError },
    },
  };
}
