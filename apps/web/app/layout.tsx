import type { Metadata } from 'next';
import { Header, Footer } from '@/components/site';
import { siteUrl, isPublicSite } from '@/lib/seo';
import { defaultLocale } from '@/lib/i18n';
import './reset.css';
import './tokens.css';
import './globals.css';
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: 'Datalom — Social data infrastructure for builders', template: '%s | Datalom' },
  description:
    'Explore social media APIs, structured datasets, and AI integrations for your next product. Discover the Datalom roadmap.',
  robots: { index: isPublicSite, follow: true },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-touch-icon.png',
  },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={defaultLocale}>
      <body>
        <a
          className={
            'skip-link fixed top-[-80px] bg-ink text-surface p-4 z-[100] [&:focus]:top-[10px]'
          }
          href="#main-content"
        >
          Skip to content
        </a>
        <Header />
        {children}
        <Footer />
      </body>
    </html>
  );
}
