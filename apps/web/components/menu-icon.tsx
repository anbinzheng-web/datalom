import { PlatformIcon } from './platform-icon';

const icons: Record<string, { path: string; color: string }> = {
  '/products/social-media-api': { path: 'm8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16', color: 'blue' },
  '/datasets': {
    path: 'M4 6c0-4 16-4 16 0s-16 4-16 0m0 0v6c0 4 16 4 16 0V6M4 12v6c0 4 16 4 16 0v-6',
    color: 'purple',
  },
  '/products/mcp': {
    path: 'M9 3h6v4H9zM4 15h6v6H4zm10 0h6v6h-6zM12 7v4M7 15v-4h10v4',
    color: 'amber',
  },
  '/products/browser-extension': {
    path: 'M3 10h18M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2M6 6h1m3 0h1m1 7v5m-2.5-2.5h5',
    color: 'teal',
  },
  '/products/live-data': { path: 'M2 12h5l3-8 4 16 3-8h5', color: 'rose' },
  '/integrations': { path: 'M8 3v5m8-5v5M6 8h12v3a6 6 0 0 1-12 0V8m6 9v4', color: 'blue' },
  '/marketplace': {
    path: 'm3 9 2-6h14l2 6M3 9v3a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0V9M5 15v6h14v-6m-9 6v-5h4v5',
    color: 'amber',
  },
  '/platforms': { path: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z', color: 'teal' },
  '/solutions/ai-training': {
    path: 'm12 3 9 5-9 5-9-5 9-5zm-9 9 9 5 9-5m-18 5 9 5 9-5',
    color: 'blue',
  },
  '/solutions/ai-agents': {
    path: 'M5 7h14v13H5zM12 3v4M9 12h.01M15 12h.01M9 16h6M2 11v5m20-5v5',
    color: 'purple',
  },
  '/solutions/market-research': { path: 'M3 3v18h18M7 16v-4m5 4V8m5 8V5', color: 'amber' },
  '/solutions/brand-monitoring': {
    path: 'M3 10v4h4l11 5V5L7 10H3zm4 4 2 6h4m8-10 2-1m-2 5 2 1',
    color: 'rose',
  },
  '/solutions/creator-analytics': {
    path: 'M14 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M3 21v-3a6 6 0 0 1 10-4m3 7v-5m4 5V11',
    color: 'teal',
  },
  '/docs': {
    path: 'M12 5C8 2 4 3 2 4v16c3-2 7-2 10 0 3-2 7-2 10 0V4c-2-1-6-2-10 1zm0 0v15',
    color: 'blue',
  },
  '/docs/quickstart': { path: 'm13 2-9 12h7l-1 8 10-13h-7l0-7z', color: 'amber' },
  '/docs/api': { path: 'M8 3H5v18h3M16 3h3v18h-3m-6-12-3 3 3 3m4-6 3 3-3 3', color: 'purple' },
  '/changelog': { path: 'M5 3v18M5 5h13v5H5m0 4h9v5H5', color: 'teal' },
};

export function MenuIcon({ href }: { href: string }) {
  if (href.startsWith('/platforms/')) {
    return (
      <span
        className={
          'menu-icon inline-flex items-center justify-center w-[32px] h-[32px] rounded-[var(--radius-md)] flex-none [&.menu-icon-blue]:[background:var(--blue-soft)] [&.menu-icon-blue]:[color:var(--blue)] [&.menu-icon-purple]:[background:var(--purple-soft)] [&.menu-icon-purple]:[color:var(--purple)] [&.menu-icon-amber]:[background:var(--amber-soft)] [&.menu-icon-amber]:[color:var(--amber)] [&.menu-icon-teal]:[background:var(--teal-soft)] [&.menu-icon-teal]:[color:var(--teal)] [&.menu-icon-rose]:[background:var(--rose-soft)] [&.menu-icon-rose]:[color:var(--rose)] [&.menu-icon-brand]:[background:var(--purple-soft)] [&_svg]:block [.mobile-sub_&]:w-[30px] [.mobile-sub_&]:h-[30px] menu-icon-brand'
        }
      >
        <PlatformIcon platform={href.split('/').pop()!} />
      </span>
    );
  }
  const icon = icons[href] ?? icons['/platforms'];
  return (
    <span
      className={
        'menu-icon inline-flex items-center justify-center w-[32px] h-[32px] rounded-[var(--radius-md)] flex-none [&.menu-icon-blue]:[background:var(--blue-soft)] [&.menu-icon-blue]:[color:var(--blue)] [&.menu-icon-purple]:[background:var(--purple-soft)] [&.menu-icon-purple]:[color:var(--purple)] [&.menu-icon-amber]:[background:var(--amber-soft)] [&.menu-icon-amber]:[color:var(--amber)] [&.menu-icon-teal]:[background:var(--teal-soft)] [&.menu-icon-teal]:[color:var(--teal)] [&.menu-icon-rose]:[background:var(--rose-soft)] [&.menu-icon-rose]:[color:var(--rose)] [&.menu-icon-brand]:[background:var(--purple-soft)] [&_svg]:block [.mobile-sub_&]:w-[30px] [.mobile-sub_&]:h-[30px] menu-icon-' +
        icon.color
      }
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={icon.path} />
      </svg>
    </span>
  );
}
