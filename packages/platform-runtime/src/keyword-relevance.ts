export type KeywordRelevance = (
  row: Record<string, unknown>,
  signal: AbortSignal,
) => Promise<'relevant' | 'irrelevant' | 'uncertain' | 'disabled'>;

// Keep the likes threshold independent from semantic relevance.
export async function checkKeywordRelevance(
  row: Record<string, unknown>,
  signal: AbortSignal,
  check?: KeywordRelevance,
  evidence?: (entry: Record<string, unknown>) => void,
) {
  if (!check || row.qualifies !== true) return true;
  signal.throwIfAborted();
  try {
    row.keywordRelevance = await check(row, signal);
    signal.throwIfAborted();
    evidence?.({ stage: 'keyword-relevance', videoId: row.videoId, result: row.keywordRelevance });
    return row.keywordRelevance === 'relevant' || row.keywordRelevance === 'disabled';
  } catch (error) {
    row.keywordRelevance = 'failed';
    evidence?.({ stage: 'keyword-relevance', videoId: row.videoId, result: 'failed' });
    signal.throwIfAborted();
    throw error;
  }
}
