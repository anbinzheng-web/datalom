# Datalom website

English-first Next.js marketing site. Run `pnpm --filter @datalom/web dev` from the repository root and open http://localhost:4320.

## Content and routing

`lib/content.ts` contains the English page registry, platform taxonomy, product roadmap, and navigation. The catch-all route statically generates registered pages and returns 404 for unknown paths. The homepage has its own composition. Products marked `planned` are noindex; product availability is independent from whether a page exists.

`lib/i18n.ts` reserves English root URLs and prefixed URLs for future languages. Only English is published. Translating content, extracting the remaining UI strings into dictionaries, and adding locale-aware routes are required before enabling a second language; changing the locale list alone does not enable translations.

## Production SEO

Set `NEXT_PUBLIC_SITE_URL` to the actual HTTPS production origin **before building**. Without it, canonical URLs use localhost, robots blocks crawling, page metadata is noindex, and the sitemap is empty. Do not configure this value with a production origin on an accessible preview deployment unless the host also enforces preview access controls/noindex headers.

Each registered page has server-rendered content, metadata, a canonical URL, and breadcrumbs. Only non-planned pages enter the production sitemap. Review content and indexing eligibility before launch. Structured data intentionally excludes unverified datasets, offers, ratings, and customer claims.

Page existence does not prove that its backend capability is available. Check the current route handlers and server implementation before describing login, billing, purchases, or API access as complete.

## UI boundaries

Use Tailwind utilities directly in JSX for layout, typography, surfaces, responsive rules, and interaction states. Reuse the React primitives in `components/ui.tsx`; homepage sections live in `components/home/`. Do not add global component selectors or `@apply` recipes. `app/globals.css` contains Tailwind configuration and base defaults, `reset.css` contains normalization, and `tokens.css` owns design variables. The visual foundations are documented in `docs/visual-guidelines.md` and demonstrated at `/design-system`. Shared icons come from `packages/shared/brand`, synchronized by dev/build scripts. Keep page copy and navigation in the existing content registry where applicable. Interactive components must support keyboard focus, Escape/restore behavior for dialogs, and narrow layouts.

Dynamic platform colors and schema nesting depth may be passed as CSS custom properties; their presentation still belongs to Tailwind utilities. Open Graph images use the inline styles required by Next.js ImageResponse (Satori), rather than browser stylesheets.

## Verification

- `pnpm --filter @datalom/web build`
- `pnpm --filter @datalom/web check`
- `pnpm format:check`

Development uses `.next-dev`; production uses `.next` to prevent simultaneous build and dev processes from corrupting each other's artifacts.

### Development component library

Run `pnpm --filter @datalom/web dev` and open `/design-system` to preview the shared UI components and their states. The route uses `page.dev.tsx`, which is registered only in development through `pageExtensions`. Production builds omit this route and its preview component; restart the development server after changing the Next.js configuration.
