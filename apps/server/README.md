# Datalom API

Based on the official Nest CLI 12 scaffold, adapted to the pnpm ESM workspace.
Uses the Nest Fastify adapter and the official CLI SWC builder. Formatting and
Vitest tests use the shared root configuration.

- `src/main.ts`: bootstrap and shutdown hooks.
- `src/app.module.ts`: application module.
- `src/app.controller.ts` / `src/app.service.ts`: health endpoint.
- `src/legacy/`: lifecycle bridge for existing Fastify business routes in `app.ts`.
  Those routes have not yet been migrated to Nest feature controllers/services.

Run `pnpm dev` from the repository root to build workspace dependencies and start
Next.js, the admin UI, Nest in watch mode, and the independent Worker.
For API-only development use `pnpm dev:server`. Shared package changes require
rebuilding those packages. Production uses `pnpm build`, then `pnpm start` for
the API and `pnpm worker` for the Worker; Docker Compose starts both services.

`pnpm --filter @datalom/server exec nest generate module <name>` generates new
feature modules. `pnpm --filter @datalom/server build` uses `nest build`.
