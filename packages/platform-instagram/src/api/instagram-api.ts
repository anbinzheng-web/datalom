/** Path matchers for Instagram XHR/fetch responses we intentionally harvest. */

export const INSTAGRAM_APP_ID = '936619743392459';

export function isInstagramHost(hostname: string): boolean {
  return ['www.instagram.com', 'instagram.com', 'i.instagram.com'].includes(hostname);
}

export function isSearchPreviewApi(pathname: string, friendlyName = ''): boolean {
  return (
    /web\/search\/topsearch/i.test(pathname) ||
    /web_search_nullstate/i.test(pathname) ||
    /typeahead/i.test(pathname) ||
    /SearchBox/i.test(friendlyName)
  );
}

export function isSearchMediaApi(pathname: string, friendlyName = ''): boolean {
  if (isSearchPreviewApi(pathname, friendlyName)) return false;
  return (
    /fbsearch\/web\/(top_serp|recent_serp|reels_serp)/i.test(pathname) ||
    /\/api\/v1\/tags\/web_info/i.test(pathname) ||
    /\/api\/v1\/tags\/[^/]+\/sections/i.test(pathname) ||
    /KeywordSearch|HashtagMedia|SearchResults|SearchTab|KeywordSerp|Polaris\w*Search/i.test(
      friendlyName,
    )
  );
}

export function isCommentListApi(pathname: string, friendlyName = ''): boolean {
  return (
    /\/api\/v1\/media\/[^/]+\/comments/i.test(pathname) ||
    /PostComments|MediaComments|ParentComment/i.test(friendlyName)
  );
}

export function commentMediaId(pathname: string): string | null {
  const match = /\/api\/v1\/media\/([^/]+)\/comments/i.exec(pathname);
  return match?.[1] ?? null;
}

function fold(value: string): string {
  try {
    value = decodeURIComponent(value);
  } catch {
    /* keep raw */
  }
  return value.normalize('NFKC').replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

export function keywordMatches(url: URL, postData: string | null, target: string): boolean {
  const want = fold(target).trim();
  if (!want) return false;
  const values = [...url.searchParams.values()];
  if (postData) {
    try {
      values.push(...new URLSearchParams(postData).values());
    } catch {
      /* keep raw body check below */
    }
    values.push(postData);
  }
  return values.some((value) => fold(value).includes(want));
}

export function searchUrl(keyword: string): string {
  return `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(keyword)}`;
}

export function mediaUrl(shortcode: string, productType?: string | null): string {
  const kind = productType === 'clips' || productType === 'reel' ? 'reel' : 'p';
  return `https://www.instagram.com/${kind}/${encodeURIComponent(shortcode)}/`;
}

export function shortcodeFromUrl(url: string): string | null {
  try {
    const match = /\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i.exec(new URL(url).pathname);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function friendlyNameOf(
  url: URL,
  postData: string | null,
  headers?: Record<string, string>,
): string {
  const fromHeader = headers?.['x-fb-friendly-name'] ?? '';
  const fromQuery = url.searchParams.get('fb_api_req_friendly_name');
  if (fromHeader && /search|serp|hashtag/i.test(fromHeader)) return fromHeader;
  if (fromQuery) return fromQuery;
  if (fromHeader) return fromHeader;
  if (!postData) return '';
  try {
    return new URLSearchParams(postData).get('fb_api_req_friendly_name') ?? '';
  } catch {
    return '';
  }
}

export function isJsonContentType(contentType: string | undefined): boolean {
  const value = contentType ?? '';
  return value.includes('json') || value.includes('javascript');
}
