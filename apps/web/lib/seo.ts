import type { Metadata } from 'next';
export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  ? new URL(process.env.NEXT_PUBLIC_SITE_URL).origin
  : 'http://localhost:4320';
export const isPublicSite = siteUrl.startsWith('https://');
export function metadataFor(
  title: string,
  description: string,
  path: string,
  planned = false,
): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      siteName: 'Datalom',
      locale: 'en_US',
      type: 'website',
    },
    twitter: { card: 'summary_large_image', title, description },
    robots: { index: isPublicSite && !planned, follow: true },
  };
}
