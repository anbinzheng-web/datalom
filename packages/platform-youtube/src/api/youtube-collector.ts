import { randomUUID } from 'node:crypto';
import { isVideoCommentsInput, isAccountInput, isStudioInput } from '@datalom/platform-runtime/contracts/index';
import type { CollectContext } from '@datalom/platform-tiktok/api/collector';
import { createYouTubeHarvest } from './youtube-harvest.ts';
import { searchYouTubeVideos } from './youtube-search.ts';
import { collectYouTubeComments, returnToYouTubeSearch } from './youtube-comments.ts';
import { aggregate, type DataRow } from './youtube-parser.ts';

export async function collectYouTubeKeyword(ctx: CollectContext) {
  const { page, run, signal } = ctx;
  const input = run.input;
  if (isVideoCommentsInput(input) || isAccountInput(input) || isStudioInput(input))
    throw new Error('SCRIPT_INPUT_MISMATCH');
  const harvest = createYouTubeHarvest(page, signal, (sample) => {
    ctx.sample = sample;
  });
  async function step<T>(name: string, work: () => Promise<T>) {
    const stepId = randomUUID(),
      start = performance.now();
    ctx.progress(name, { event: 'step.started', stepId });
    try {
      const result = await work();
      ctx.progress(name, {
        event: 'step.completed',
        stepId,
        durationMs: Math.round(performance.now() - start),
      });
      return result;
    } catch (error) {
      ctx.progress(name, { event: 'step.failed', stepId, error });
      throw error;
    }
  }
  try {
    const videos = await step('搜索关键词', () =>
      searchYouTubeVideos({
        page,
        harvest,
        keyword: input.keyword,
        limit: input.videoLimit,
        minLikes: input.minLikes,
        signal,
        emit: (rows) => ctx.emit('youtube.videos', rows),
      }),
    );
    const comments: DataRow[] = [];
    for (const video of videos.filter((v) => v.qualifies === true)) {
      if (input.commentsPerVideo === 0 || comments.length >= input.totalComments) break;
      if (video.commentsCount === 0) continue;
      if (typeof video.url !== 'string') continue;
      try {
        const rows = await step(`采集评论 · ${video.videoId}`, () =>
          collectYouTubeComments({
            page,
            harvest,
            signal,
            videoId: String(video.videoId),
            url: video.url as string,
            keyword: input.keyword,
            limit: input.commentsPerVideo,
            remaining: input.totalComments - comments.length,
            emit: (batch) => ctx.emit('youtube.comments', batch),
          }),
        );
        comments.push(...rows);
      } catch (error) {
        const code = error instanceof Error ? error.message : '';
        if (
          ![
            'SITE_UNAVAILABLE',
            'PAGE_RESPONSE_NOT_RECOGNIZED',
            'PAGINATION_STALLED',
            'COMMENT_CARD_NOT_IN_VIEW',
            'COMMENT_VIDEO_MISMATCH',
          ].includes(code)
        )
          throw error;
        ctx.progress(`采集评论 · ${video.videoId}`, {
          event: 'step.skipped',
          error,
          reason: code,
        });
      } finally {
        await returnToYouTubeSearch(harvest, input.keyword, signal).catch(() => {});
      }
    }
    await step('汇总关联词和评论者', async () => {
      const result = aggregate(videos, comments);
      ctx.emit('youtube.users', result.users);
      ctx.emit('youtube.tags', result.tags);
      ctx.emit('youtube.keyword-evidence', result.keywords);
    });
  } finally {
    harvest.stop();
  }
}
