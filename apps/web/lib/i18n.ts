// Only published languages belong here. Add a locale when its content is ready.
export const locales = ['en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';
export const languageLabels: Record<Locale, string> = { en: 'English' };
export function localizedPath(path: string, locale: string): string {
  return locale === defaultLocale ? path : `/${locale}${path === '/' ? '' : path}`;
}
