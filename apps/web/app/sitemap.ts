import type { MetadataRoute } from 'next';
import { pages } from '@/lib/content';
import { siteUrl, isPublicSite } from '@/lib/seo';
export default function sitemap(): MetadataRoute.Sitemap {
  return isPublicSite
    ? [
        { url: siteUrl + '/' },
        ...pages.filter((p) => !p.planned).map((p) => ({ url: siteUrl + p.path })),
      ]
    : [];
}
