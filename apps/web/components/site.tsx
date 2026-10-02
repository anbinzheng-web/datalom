'use client';
import { ButtonLink } from './ui';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { MenuIcon } from './menu-icon';
import { usePathname } from 'next/navigation';
import { MobileMenu } from './mobile-menu';
import { navigation, type NavigationItem } from '@/lib/content';
function NestedProduct({ item }: { item: NavigationItem }) {
  return (
    <details className="col-span-full rounded-md bg-soft p-3 [&[open]>summary]:mb-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-sm px-2 py-3 text-sm font-medium focus-visible:outline-3 focus-visible:outline-brand [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <MenuIcon href={item.href} />
          {item.title}
        </span>
        <span className="text-xs text-muted">Platforms</span>
      </summary>
      <Link
        href={item.href}
        className="mb-3 inline-flex rounded-sm px-2 py-2 text-sm text-brand hover:underline"
      >
        Social Media API overview
      </Link>
      <div className="grid grid-cols-2 gap-1 min-[901px]:grid-cols-4">
        {item.children?.map((child) => (
          <Link
            key={child.href}
            href={child.href}
            className="flex min-w-0 items-center gap-2 whitespace-normal rounded-sm px-2 py-3 text-xs hover:bg-surface [&>img]:size-[19px]"
          >
            <MenuIcon href={child.href} />
            {child.title}
          </Link>
        ))}
      </div>
    </details>
  );
}
function ProductsMenu({ items }: { items: NavigationItem[] }) {
  const api = items.find((item) => item.children);
  return (
    <div className="grid grid-cols-[240px_minmax(0,1fr)] gap-5">
      <div className="space-y-1">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex min-h-12 items-center gap-3 rounded-sm px-3 py-3 text-sm ${item.children ? 'bg-lime text-brand' : 'hover:bg-soft'}`}
          >
            <MenuIcon href={item.href} />
            <span>{item.title}</span>
            {item.children && (
              <svg
                className="ml-auto shrink-0"
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
              >
                <path d="m6 4 4 4-4 4" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            )}
          </Link>
        ))}
      </div>
      <div className="min-w-0 rounded-md bg-soft p-5">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-sm font-medium">Social Media API</h2>
          <Link
            className="inline-flex min-h-8 items-center rounded-sm text-xs font-medium text-brand hover:underline"
            href="/platforms"
          >
            View all platforms
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {api?.children
            ?.filter((item) => item.href !== '/platforms')
            .map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex min-h-11 min-w-0 items-center gap-2 whitespace-normal rounded-sm px-2 py-2 text-xs hover:bg-surface [&>img]:size-[19px]"
              >
                <MenuIcon href={item.href} />
                {item.title}
              </Link>
            ))}
        </div>
      </div>
    </div>
  );
}
export function Mark() {
  return <img src="/favicon.svg" width="30" height="30" alt="" aria-hidden="true" />;
}
export function Header() {
  const path = usePathname();
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    void fetch('/api/auth/me')
      .then((response) => response.json())
      .then((body: { user?: unknown }) => setSignedIn(Boolean(body.user)))
      .catch(() => setSignedIn(false));
  }, []);
  if (path === '/login') return null;
  return (
    <header className="sticky top-0 z-20 flex h-[var(--header-height)] items-center justify-between gap-6 border-b border-line bg-paper px-10 min-[901px]:grid min-[901px]:grid-cols-[1fr_auto_1fr] min-[1500px]:px-[max(40px,calc((100vw-1240px)/2))] max-sm:gap-3 max-sm:px-5">
      <Link
        href="/"
        className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-[27px] font-medium tracking-normal max-sm:text-[25px]"
        aria-label="Datalom home"
      >
        <img src="/datalom-logo.svg" width="142" height="37" alt="datalom" />
      </Link>
      <nav
        className="flex items-center gap-6 whitespace-nowrap text-[13px] max-[1150px]:gap-4 max-[900px]:hidden [&>a]:flex [&>a]:min-h-[var(--header-height)] [&>a]:items-center"
        aria-label="Main navigation"
      >
        {navigation.map((n) => (
          <div
            className="group/nav [&>a]:flex [&>a]:min-h-[var(--header-height)] [&>a]:items-center [&>a]:gap-2"
            key={n.href}
          >
            <Link href={n.href}>
              {n.title}
              <svg
                className="block shrink-0 text-muted"
                width="12"
                height="12"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="m4 6 4 4 4-4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
            <div
              className={
                'hidden absolute top-full left-1/2 max-h-[calc(100dvh-var(--header-height)-16px)] -translate-x-1/2 overflow-auto rounded-lg border border-line bg-surface p-5 shadow-[var(--shadow-md)] group-hover/nav:block group-focus-within/nav:block mega-' +
                n.title.toLowerCase() +
                (n.title === 'Products'
                  ? ' w-[min(900px,calc(100vw-64px))]'
                  : n.title === 'Solutions'
                    ? ' w-[min(660px,calc(100vw-64px))]'
                    : ' w-[min(500px,calc(100vw-64px))]')
              }
            >
              <div className="mb-2 border-b border-line pb-3 text-xs font-medium uppercase tracking-normal text-muted">
                <span>{n.title}</span>
              </div>
              {n.title === 'Products' ? (
                <ProductsMenu items={n.items} />
              ) : (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 whitespace-normal [&>a]:flex [&>a]:min-h-12 [&>a]:min-w-0 [&>a]:items-center [&>a]:rounded-sm [&>a]:px-2 [&>a]:py-2 [&>a:hover]:bg-soft">
                  {n.items.map((i) =>
                    i.children ? (
                      <NestedProduct key={i.href} item={i} />
                    ) : (
                      <Link key={i.href} href={i.href}>
                        <span className="flex min-w-0 items-center gap-3 leading-6 [&>img]:size-[19px]">
                          <MenuIcon href={i.href} />
                          <span className="min-w-0">{i.title}</span>
                        </span>
                      </Link>
                    ),
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        <Link href="/pricing">Pricing</Link>
      </nav>
      <div className="justify-self-end max-[900px]:ml-auto max-[360px]:[&>a]:px-2 max-[360px]:[&>a]:text-xs">
        <ButtonLink variant="secondary" size="xl" href={signedIn ? '/account' : '/login'}>
          {signedIn ? 'Account' : 'Sign in / Sign up'}
        </ButtonLink>
      </div>
      <MobileMenu>
        <summary aria-label="Open navigation">☰</summary>
        <nav aria-label="Mobile navigation">
          {navigation.map((n) => (
            <div
              key={n.href}
              className={
                'border-b border-line py-3 [&>a]:font-medium mobile-group-' +
                n.title.toLowerCase() +
                (n.title === 'Products'
                  ? ' w-[min(900px,calc(100vw-64px))]'
                  : n.title === 'Solutions'
                    ? ' w-[min(660px,calc(100vw-64px))]'
                    : ' w-[min(500px,calc(100vw-64px))]')
              }
            >
              <Link href={n.href}>{n.title} </Link>
              <div className="mt-3 grid grid-cols-2 gap-1">
                {n.items.map((i) =>
                  i.children ? (
                    <NestedProduct key={i.href} item={i} />
                  ) : (
                    <Link
                      className="flex items-center rounded-sm px-2 py-3 text-xs hover:bg-soft"
                      href={i.href}
                      key={i.href}
                    >
                      <span className="flex items-center gap-2 [&>img]:size-[19px]">
                        <MenuIcon href={i.href} />
                        {i.title}
                      </span>
                    </Link>
                  ),
                )}
              </div>
            </div>
          ))}
          <Link href="/pricing">Pricing</Link>
          <Link href={signedIn ? '/account' : '/login'}>
            {signedIn ? 'Account' : 'Sign in / Sign up'}
          </Link>
        </nav>
      </MobileMenu>
    </header>
  );
}
export function Footer() {
  const path = usePathname();
  if (path === '/login' || path.startsWith('/docs/api')) return null;
  return (
    <footer className="bg-ink text-white">
      <div className="mx-auto w-[min(1240px,calc(100%-112px))] py-16 max-sm:w-[calc(100%-40px)] max-sm:py-12">
        <div className="grid grid-cols-[1.7fr_repeat(4,1fr)] gap-10 max-lg:grid-cols-3 max-sm:grid-cols-2 [&>div:first-child]:max-lg:col-span-3 [&>div:first-child]:max-sm:col-span-2 [&_p]:mt-5 [&_p]:max-w-[280px] [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-white/70">
          <div>
            <Link
              href="/"
              className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-[27px] font-medium tracking-normal max-sm:text-[25px]"
            >
              <img src="/datalom-logo-light.svg" width="142" height="37" alt="datalom" />
            </Link>
            <p>Public platform datasets, APIs, and AI tools for learning and analysis.</p>
          </div>
          {[
            {
              title: 'Explore',
              links: [
                ['Products', '/products'],
                ['Platforms', '/platforms'],
                ['Datasets', '/datasets'],
                ['API', '/docs/api'],
                ['Pricing', '/pricing'],
              ],
            },
            {
              title: 'Build',
              links: [
                ['Documentation', '/docs'],
                ['SDKs', '/docs'],
                ['MCP & Skills', '/products/mcp'],
                ['Integrations', '/integrations'],
                ['Roadmap', '/changelog'],
              ],
            },
            {
              title: 'Company',
              links: [
                ['About', '/about'],
                ['Enterprise', '/enterprise'],
                ['Marketplace', '/marketplace'],
                ['Contact', '/contact'],
              ],
            },
            {
              title: 'Resources',
              links: [
                ['Solutions', '/solutions'],
                ['Quickstart', '/docs/quickstart'],
                ['API reference', '/docs/api'],
                ['Data approach', '/legal/data-policy'],
                ['Data policy', '/legal/data-policy'],
              ],
            },
          ].map((g) => (
            <div
              className="flex flex-col gap-3 text-xs text-white/70 [&>h3]:mb-2 [&>h3]:text-sm [&>h3]:font-medium [&>h3]:text-white [&>a:hover]:text-white [&>a]:transition-colors [&>a:focus-visible]:text-white [&>a:focus-visible]:outline-white [&>a:hover]:underline"
              key={g.title}
            >
              <h3>{g.title}</h3>
              {g.links.map(([t, h]) => (
                <Link key={`${h}:${t}`} href={h}>
                  {t}
                </Link>
              ))}
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-white/15 pt-6 text-[11px] text-white/60">
          <span>© {new Date().getFullYear()} Datalom</span>
          <span>Public data for learning and analysis</span>
          <span>◎ English</span>
        </div>
      </div>
    </footer>
  );
}
export function CTA() {
  return (
    <section className="relative my-20 overflow-hidden bg-soft px-10 py-12 max-sm:my-12 max-sm:px-6 [&>h2]:relative [&>h2]:z-1 [&>h2]:max-w-[680px] [&>h2]:text-[length:var(--text-section)] [&>h2]:leading-tight [&>h2]:font-medium [&>h2]:tracking-normal">
      <h2>Find platform data and API documentation.</h2>
      <div className="relative z-1 mt-6 flex flex-wrap items-center gap-3">
        <ButtonLink href="/platforms">Explore the platforms</ButtonLink>
        <Link
          href="/docs"
          className="inline-flex min-h-10 items-center text-[13px] font-medium hover:underline hover:underline-offset-4"
        >
          Read the docs
        </Link>
      </div>
      <div className="pointer-events-none absolute right-10 bottom-8 opacity-15 [&>img]:size-32">
        <Mark />
      </div>
    </section>
  );
}
