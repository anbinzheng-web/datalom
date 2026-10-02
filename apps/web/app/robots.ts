import type { MetadataRoute } from 'next';
import { siteUrl, isPublicSite } from '@/lib/seo';
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      ...(isPublicSite ? { allow: '/', disallow: ['/api/', '/app/'] } : { disallow: '/' }),
    },
    ...(isPublicSite ? { sitemap: `${siteUrl}/sitemap.xml` } : {}),
  };
}
