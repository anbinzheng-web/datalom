import Link from 'next/link';
import { PlatformIcon } from '@/components/platform-icon';
import { notFound } from 'next/navigation';
import { pages, getPage } from '@/lib/content';
import { metadataFor, siteUrl } from '@/lib/seo';
import { PlatformExplorer } from '@/components/explorer';
import { CTA } from '@/components/site';
import { Pricing } from '@/components/pricing';
import { DatasetOrder } from '@/components/dataset-order';
export const dynamicParams = false;
export function generateStaticParams() {
  return pages
    .filter((p) => p.path !== '/datasets')
    .map((p) => ({ slug: p.path.slice(1).split('/') }));
}
export async function generateMetadata({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const page = getPage('/' + slug.join('/'));
  return page ? metadataFor(page.title, page.description, page.path, Boolean(page.planned)) : {};
}
export default async function ContentPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const page = getPage('/' + slug.join('/'));
  if (!page) notFound();
  const parent = slug.length > 1 ? getPage('/' + slug.slice(0, -1).join('/')) : undefined;
  const crumbs = [
    { name: 'Home', url: '/' },
    ...(parent ? [{ name: parent.eyebrow.toLowerCase(), url: parent.path }] : []),
    { name: page.eyebrow.toLowerCase(), url: page.path },
  ];
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: siteUrl + c.url,
    })),
  };
  return (
    <main
      id="main-content"
      className={
        'content-main pt-8 wrap w-[min(var(--layout-width),_calc(100%_-_112px))] m-auto [.source-strip_>_&]:flex [.source-strip_>_&]:justify-between [.source-strip_>_&]:items-center [.source-strip_>_&]:gap-y-6 [.source-strip_>_&]:gap-x-6 [.source-strip_>_&]:min-h-[102px] [.source-strip_>_&_>_span]:text-[8px] [.source-strip_>_&_>_span]:leading-[1.8] [.source-strip_>_&_>_span]:tracking-normal [.source-strip_>_&_>_span]:text-muted [.source-strip_>_&_>_span]:shrink-0 max-[1151px]:w-[calc(100%_-_64px)] max-[1151px]:[.source-strip_>_&]:gap-y-4 max-[1151px]:[.source-strip_>_&]:gap-x-4 max-[901px]:[.source-strip_>_&_>_span]:hidden max-[901px]:[.source-strip_>_&]:flex-wrap max-[901px]:[.source-strip_>_&]:justify-center max-[901px]:[.source-strip_>_&]:py-6 max-[901px]:[.source-strip_>_&]:px-0 max-[901px]:[.source-strip_>_&]:gap-y-5 max-[901px]:[.source-strip_>_&]:gap-x-5 max-[641px]:w-[calc(100%_-_40px)] max-[641px]:[.source-strip_>_&]:gap-y-5 max-[641px]:[.source-strip_>_&]:gap-x-6'
      }
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, '\\u003c') }}
      />
      <nav
        className={
          'breadcrumbs flex gap-y-3 gap-x-3 text-[11px] text-muted [text-transform:capitalize] flex-wrap [&_a:hover]:underline max-[641px]:text-[10px]'
        }
        aria-label="Breadcrumb"
      >
        <Link href="/">Home</Link>
        {parent && (
          <>
            <span>/</span>
            <Link href={parent.path}>{parent.eyebrow.toLowerCase()}</Link>
          </>
        )}
        <span>/</span>
        <span aria-current="page">{page.eyebrow.toLowerCase()}</span>
      </nav>
      <header
        className={
          'page-hero pt-16 px-0 pb-12 max-w-[920px] [&_h1]:text-[length:var(--text-page)] [&_h1]:font-medium [&_h1]:leading-[1.08] [&_h1]:tracking-normal [&_h1]:my-6 [&_h1]:mx-0 [&_p]:text-muted [&_p]:text-[17px] [&_p]:leading-[1.8] [&_p]:max-w-[720px] max-[641px]:pt-10 max-[641px]:px-0 max-[641px]:pb-8 max-[641px]:[&_h1]:tracking-normal max-[641px]:[&_p]:text-[15px]'
        }
      >
        {(page.path.startsWith('/platforms/') || page.path.startsWith('/integrations/')) && (
          <div
            className={
              'detail-brand inline-flex p-4 bg-surface [border:var(--border-width)_solid_var(--line)] rounded-[var(--radius-md)] mb-5 [box-shadow:var(--shadow-sm)]'
            }
          >
            <PlatformIcon platform={slug[1]} />
          </div>
        )}
        <span
          className={
            'eyebrow block font-mono text-[10px] tracking-normal font-medium text-muted [.editorial-sections_&]:pt-2 max-[641px]:[.closing_&]:text-[8px] max-[641px]:[.closing_&]:relative max-[641px]:[.closing_&]:z-[1] [.pricing-datasets_&]:[color:var(--purple)] [.signal-panel_&]:m-0 [.signal-panel_&]:text-[10px] [.signal-panel_&]:tracking-normal [.signal-engine_&]:text-lime [.home-window-bar_&]:text-lime [.home-price-band_&]:text-lime [.home-final_.home-window-bar_&]:text-brand'
          }
        >
          {page.eyebrow}
        </span>
        {page.planned && (
          <span
            className={
              'pill text-[9px] text-muted [border:var(--border-width)_solid_var(--line)] rounded-[var(--radius-none)] py-1 px-2 inline-block [.home-data-source_&]:ml-auto [.home-data-source_&]:text-lime max-[641px]:[.home-data-source_&]:hidden page-status mt-4'
            }
          >
            Planned · Not yet available
          </span>
        )}
        <h1>{page.title}</h1>
        <p>{page.description}</p>
      </header>
      {page.path === '/pricing' ? (
        <Pricing />
      ) : page.path === '/platforms' ? (
        <PlatformExplorer />
      ) : (
        page.links && (
          <div
            className={
              'directory-grid grid [grid-template-columns:repeat(3,_1fr)] gap-y-4 gap-x-4 mb-12 max-[901px]:[grid-template-columns:repeat(2,_1fr)] max-[641px]:[grid-template-columns:1fr] max-[641px]:gap-y-3 max-[641px]:gap-x-3'
            }
          >
            {page.links.map((l) => (
              <Link
                className={
                  'directory-card [&:hover]:[transform:none] [&:hover]:[border-top-color:var(--line-strong)] [&:hover]:[border-right-color:var(--line-strong)] [&:hover]:[border-bottom-color:var(--line-strong)] [&:hover]:[border-left-color:var(--line-strong)] [&:hover]:[box-shadow:var(--shadow-sm)] [border:var(--border-width)_solid_var(--line)] bg-soft rounded-[var(--radius-md)] p-6 [transition:border-color_0.15s,_box-shadow_0.15s] flex flex-col [&_h2]:text-[23px] [&_h2]:tracking-normal [&_h2]:font-medium [&_h2]:mt-6 [&_h2]:mx-0 [&_h2]:mb-4 [&_h2]:flex [&_h2]:justify-between [&_h2]:gap-y-4 [&_h2]:gap-x-4 [&_h2_>_span]:text-[15px] [&_h2_>_span]:text-muted [&_p]:text-[13px] [&_p]:leading-[1.8] [&_p]:text-muted [&_p]:mt-0 max-[641px]:p-6 [&:nth-child(n)]:bg-surface'
                }
                href={l.href}
                key={l.href}
              >
                {l.href.startsWith('/integrations/') && (
                  <PlatformIcon platform={l.href.split('/').pop()!} />
                )}
                <h2>{l.title}</h2>
                {l.description && <p>{l.description}</p>}
              </Link>
            ))}
          </div>
        )
      )}
      {(page.path === '/datasets' || page.path.startsWith('/datasets/')) && <DatasetOrder />}
      {page.sections.length > 0 && (
        <div
          className={
            'editorial-sections mt-10 mx-0 mb-20 [&_>_section]:grid [&_>_section]:[grid-template-columns:minmax(180px,_1fr)_minmax(0,_2fr)] [&_>_section]:gap-y-8 [&_>_section]:gap-x-8 [&_>_section]:[border-top:var(--border-width)_solid_var(--line)] [&_>_section]:py-8 [&_>_section]:px-0 [&_h2]:text-[24px] [&_h2]:font-medium [&_h2]:tracking-normal [&_h2]:m-0 [&_p]:text-[14px] [&_p]:leading-[1.9] [&_p]:text-muted [&_p]:m-0 max-[901px]:[&_>_section]:[grid-template-columns:40px_1fr_1.2fr] max-[901px]:[&_>_section]:gap-y-5 max-[901px]:[&_>_section]:gap-x-5 max-[641px]:mt-6 max-[641px]:mb-12 max-[641px]:[&_>_section]:[grid-template-columns:1fr] max-[641px]:[&_>_section]:gap-y-4 max-[641px]:[&_>_section]:gap-x-4 max-[641px]:[&_p]:[grid-column:2] max-[641px]:[&_p]:text-[13px] max-[641px]:[&_h2]:text-[22px]'
          }
        >
          {page.sections.map((s) => (
            <section key={s.title}>
              <h2>{s.title}</h2>
              <p>{s.text}</p>
            </section>
          ))}
        </div>
      )}
      <CTA />
    </main>
  );
}
