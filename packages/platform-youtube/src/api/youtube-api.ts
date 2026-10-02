/** Path matchers for YouTube Innertube XHR/fetch we harvest. */

export function isYouTubeHost(hostname: string): boolean {
  return ['www.youtube.com', 'youtube.com', 'm.youtube.com', 'www.youtube-nocookie.com'].includes(
    hostname,
  );
}

export function isSearchApi(pathname: string): boolean {
  return /\/youtubei\/v1\/search/i.test(pathname);
}

export function isCommentApi(pathname: string): boolean {
  return (
    /\/youtubei\/v1\/next/i.test(pathname) ||
    /\/youtubei\/v1\/comment\//i.test(pathname) ||
    /\/youtubei\/v1\/live_chat\//i.test(pathname)
  );
}

export function isJsonContentType(contentType: string | undefined): boolean {
  const value = contentType ?? '';
  return value.includes('json') || value.includes('javascript');
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
      /* raw body */
    }
    values.push(postData);
  }
  return values.some((value) => fold(value).includes(want));
}

export function searchUrl(keyword: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(keyword)}`;
}

export function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

export function videoIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const fromQuery = parsed.searchParams.get('v');
    if (fromQuery) return fromQuery;
    const shorts = /^\/shorts\/([A-Za-z0-9_-]{6,})/.exec(parsed.pathname);
    return shorts?.[1] ?? null;
  } catch {
    return null;
  }
}
