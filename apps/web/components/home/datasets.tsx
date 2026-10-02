import type { CSSProperties } from 'react';
import Link from 'next/link';
import { ButtonLink } from '@/components/ui';
import { PlatformIcon } from '@/components/platform-icon';
import { platforms, datasetUseCases } from '@/lib/content';

export function DatasetsSection() {
  return (
    <section className="bg-soft bg-[var(--soft)]" id="datasets">
      <div className="mx-auto w-[min(1240px,calc(100%-112px))] py-20 max-sm:w-[calc(100%-40px)] max-sm:py-12">
        <div className="mb-9 w-full">
          <div>
            <h2 className="m-0 w-full text-[length:var(--text-section)] leading-[1.04] font-medium tracking-normal">
              Explore public datasets.
            </h2>
          </div>
        </div>
        <div className="mb-7 grid w-full grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            [String(platforms.length), 'platform sources'],
            ['5', 'dataset families'],
            ['$0.20', 'per 1,000 records'],
            ['$5', 'minimum order'],
          ].map(([value, label], index) => (
            <div
              key={label}
              className="flex min-w-0 flex-col gap-3 rounded-md bg-surface p-5"
            >
              <strong
                className={`text-[34px] font-medium ${index % 2 === 0 ? 'text-brand' : 'text-ink'}`}
              >
                {value}
              </strong>
              <span className="text-xs text-muted">{label}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 max-sm:grid-cols-1">
          {platforms.map((p) => (
            <Link
              className="group grid min-h-[78px] grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-3 text-left rounded-md bg-surface transition-colors duration-150 hover:bg-[var(--control-hover-bg)] focus-visible:bg-[var(--control-hover-bg)] max-sm:grid-cols-[42px_minmax(0,1fr)] [&>h3]:col-start-2 [&>h3]:text-lg [&>h3]:font-medium [&>h3]:leading-tight [&>p]:col-start-2 [&>p]:text-xs [&>p]:leading-relaxed [&>p]:text-muted"
              href={`/platforms/${p[0]}`}
              key={p[0]}
            >
              <span
                className="bg-[var(--platform-tint)] row-span-2 flex size-[42px] items-center justify-center rounded-[6px] [&>img]:size-7"
                style={{ '--platform-tint': p[4] } as CSSProperties}
              >
                <PlatformIcon platform={p[0]} />
              </span>
              <h3>{p[1]}</h3>
              <p>{p[3]}</p>
              <span className="col-start-3 row-span-2 row-start-1 text-xs font-medium text-brand group-hover:underline max-sm:col-start-2 max-sm:row-start-3 max-sm:mt-2">
                Explore datasets
              </span>
            </Link>
          ))}
        </div>
        <div className="mt-8 flex justify-center">
          <Link
            className="inline-flex min-h-10 items-center text-[13px] font-medium hover:underline hover:underline-offset-4"
            href="/platforms"
          >
            View all {platforms.length} platforms
          </Link>
        </div>
        <div className="mt-9 grid items-center gap-8 rounded-lg bg-ink p-8 text-white lg:grid-cols-[minmax(0,1fr)_auto]">
          <div>
            <h3 className="mb-3 text-[28px] leading-tight font-medium tracking-normal">
              Start small. Learn deeply.
            </h3>
            <p className="m-0 max-w-[580px] leading-relaxed">
              One-time purchases with a clear record count, version, coverage window, and delivery
              format.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-5">
            <div className="flex flex-col gap-2">
              <strong className="text-[40px] leading-none font-medium tracking-normal text-lime">
                $0.20
              </strong>
              <span className="text-sm text-white/80">per 1,000 records</span>
              <span className="text-sm text-white/65">$5 minimum order</span>
            </div>
            <ButtonLink variant="secondary" href="/pricing">
              Calculate dataset cost
            </ButtonLink>
          </div>
        </div>
        <div className="mt-14 grid grid-cols-3 gap-6 max-md:grid-cols-2 max-sm:mt-14 max-sm:grid-cols-1 [&_h3]:text-[28px] [&_h3]:leading-tight [&_h3]:font-medium [&_h3]:tracking-normal">
          <div>
            <h3>From a first notebook to a production research workflow.</h3>
          </div>
          {datasetUseCases.map(([title, text]) => (
            <div
              className="border-t border-line-strong pt-5 text-sm [&_strong]:font-medium [&_p]:mt-1 [&_p]:text-xs [&_p]:leading-relaxed [&_p]:text-muted"
              key={title}
            >
              <div>
                <strong>{title}</strong>
                <p>{text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
