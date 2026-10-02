// Synthetic API pages routed through the local authenticated TLS proxy.
export function keywordApiFixture(url: URL) {
  if (url.pathname === '/passport/web/account/info/')
    return {
      status: 200,
      body: { message: 'success', data: { user_id: '42', username: 'fixture' } },
    };
  if (url.pathname === '/api/search/general/full/') {
    const page = url.searchParams.get('cursor') === '0' ? 0 : 1;
    const ids = page === 0 ? ['1', '2'] : ['2', '3'];
    return {
      status: 200,
      body: {
        status_code: 0,
        cursor: page === 0 ? 12 : 24,
        has_more: page === 0 ? 1 : 0,
        log_pb: { impr_id: 'FIXTURE_SEARCH' },
        data: ids.map((id) => ({
          type: 1,
          item: {
            id,
            author: { id: '42', uniqueId: 'author', nickname: 'Author' },
            desc: '#jeans',
            stats: { diggCount: id === '2' ? 100 : 101, commentCount: 3 },
            secret: 'RAW_API_CANARY',
          },
        })),
      },
    };
  }
  if (url.pathname === '/api/comment/list/') {
    const id = url.searchParams.get('aweme_id');
    const page = url.searchParams.get('cursor') === '0' ? 0 : 1;
    return {
      status: 200,
      body: {
        status_code: 0,
        cursor: page === 0 ? 20 : 40,
        has_more: page === 0 ? 1 : 0,
        comments: (page === 0 ? ['1', '2'] : ['2', '3']).map((cid) => ({
          cid: id + cid,
          aweme_id: id,
          text: 'jeans please',
          reply_comment_total: 0,
          user: { uid: 'user-' + cid, unique_id: 'user' + cid },
          secret: 'RAW_API_CANARY',
        })),
      },
    };
  }
  return { status: 404, body: {} };
}
