import Link from 'next/link';
import { ButtonLink } from '@/components/ui';
import { sdkLanguages, agentIntegrations } from '@/lib/content';

export function ApiSection() {
  return (
    <section id="api" className="bg-[var(--soft)] bg-soft">
      <div className="mx-auto w-[min(1240px,calc(100%-112px))] py-20 max-sm:w-[calc(100%-40px)] max-sm:py-12">
        <div className="grid grid-cols-[1.35fr_1fr] items-end gap-12 max-md:grid-cols-1 max-md:gap-8">
          <div>
            <h2 className="text-[length:var(--text-section)] leading-[1.04] font-medium tracking-normal">
              One API. Every workflow.
            </h2>
            <p className="mt-6 max-w-[620px] text-base leading-relaxed text-muted">
              Bring live public data into your apps, notebooks, and AI agents. Call the REST API
              directly, use an SDK, or connect through MCP and Skills.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-6">
              <ButtonLink href="/docs/api">Try the API</ButtonLink>
              <Link
                href="/docs"
                className="py-3 text-sm font-medium hover:underline hover:underline-offset-4"
              >
                View documentation
              </Link>
            </div>
          </div>
          <div className="pb-1">
            <p className="text-sm text-muted">Pay only for successful requests</p>
            <p className="mt-3 text-[length:var(--text-section)] leading-tight font-medium tracking-normal text-[var(--brand)]">
              $0.0005{' '}
              <span className="text-sm font-normal tracking-normal text-muted">/ request</span>
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Failed requests are free. No monthly subscription or extra RPS fees.
            </p>
          </div>
        </div>
        <div className="mt-14 grid grid-cols-[.8fr_1.2fr] gap-12 max-lg:grid-cols-1 max-lg:gap-8">
          <div>
            <h3 className="text-[28px] leading-tight font-medium tracking-normal">
              Start with a request.
            </h3>
            <p className="mt-4 max-w-[400px] text-sm leading-relaxed text-muted">
              Retrieve posts, videos, profiles, and comments as structured JSON. Follow pagination
              to explore more, then use the same data in your own analysis.
            </p>
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium text-[var(--brand)]">
              <span>REST endpoints</span>
              <span>JSON responses</span>
              <span>Pagination</span>
              <span>Live data</span>
            </div>
          </div>
          <div className="min-w-0 rounded-lg bg-[var(--ink)] p-7 text-[var(--green-soft)] max-sm:p-5">
            <p className="mb-5 text-xs text-[var(--line-strong)]">
              From public content to useful context
            </p>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span>Platform data</span>
              <span aria-hidden="true">→</span>
              <span>Datalom API</span>
              <span aria-hidden="true">→</span>
              <span>Your app or agent</span>
            </div>
            <pre className="mt-6 overflow-x-auto text-xs leading-7">
              <code>
                {'{\n  "content_type": "video",\n  "views": 128400,\n  "source_url": "…"\n}'}
              </code>
            </pre>
          </div>
        </div>
        <div className="mt-14 grid grid-cols-2 gap-12 max-lg:grid-cols-1 max-lg:gap-10">
          <div className="min-w-0">
            <h3 className="text-[28px] leading-tight font-medium tracking-normal">
              Use your language.
            </h3>
            <p className="mt-3 mb-6 text-sm leading-relaxed text-muted">
              The same API, ready for your existing codebase.
            </p>
            {sdkLanguages.map(([name, command, use]) => (
              <div
                key={name}
                className="grid grid-cols-[140px_minmax(0,1fr)] gap-x-4 gap-y-2 border-t border-[var(--line)] py-5 max-sm:grid-cols-1"
              >
                <strong className="text-sm font-medium">{name}</strong>
                <code className="overflow-x-auto text-xs text-[var(--brand)]">{command}</code>
                <span className="col-start-2 text-xs text-muted max-sm:col-start-1">{use}</span>
              </div>
            ))}
          </div>
          <div className="min-w-0">
            <h3 className="text-[28px] leading-tight font-medium tracking-normal">
              Give your agent access.
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              MCP and Skills connect agents to the API for live retrieval, ecommerce research,
              social listening, and creator monitoring.
            </p>
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-4 border-t border-[var(--line)] py-5">
              {agentIntegrations.map((name) => (
                <span key={name} className="text-sm font-medium">
                  {name}
                </span>
              ))}
            </div>
            <Link
              href="/products/mcp"
              className="inline-flex min-h-12 items-center text-sm font-medium text-[var(--brand)] hover:underline hover:underline-offset-4"
            >
              Connect an AI agent
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
