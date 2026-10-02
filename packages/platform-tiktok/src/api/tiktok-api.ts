/** Path matchers for TikTok XHR/fetch responses we intentionally harvest. */
export function isSearchVideoApi(pathname: string): boolean {
  return pathname === '/api/search/general/full/' || pathname.endsWith('/api/search/general/full/');
}

export function isSearchPreviewApi(pathname: string): boolean {
  return /\/api\/search\/.*preview/i.test(pathname) || /suggest/i.test(pathname);
}

export function isCommentListApi(pathname: string): boolean {
  return /comment\/list/i.test(pathname) || /\/api\/comment\//i.test(pathname);
}

export function keywordMatches(url: URL, postData: string | null, target: string): boolean {
  const want = target.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
  if (!want) return false;
  const values = [...url.searchParams.values()];
  if (postData) {
    try {
      values.push(...new URLSearchParams(postData).values());
    } catch {
      if (postData.normalize('NFKC').replace(/\s+/g, ' ').toLocaleLowerCase('en-US').includes(want))
        return true;
    }
  }
  return values.some(
    (value) =>
      value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US') === want,
  );
}

export function searchUrl(keyword: string, now = Date.now()): string {
  const query = new URLSearchParams({
    lang: 'en',
    q: keyword,
    t: String(now),
  });
  return `https://www.tiktok.com/search?${query.toString()}`;
}
