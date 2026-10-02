import { collectVideoComments } from '@datalom/platform-tiktok/api/collect-video-comments';
import { collectAccount } from '@datalom/platform-tiktok/api/collect-account';
import { collectStudio } from '@datalom/platform-tiktok/api/collect-studio';
import { collectKeyword, type CollectContext } from '@datalom/platform-tiktok/api/collector';
import { collectInstagramKeyword } from '@datalom/platform-instagram/api/instagram-collector';
import { collectYouTubeKeyword } from '@datalom/platform-youtube/api/youtube-collector';
import { defaultConcurrencySettings } from '@datalom/platform-runtime/contracts/index';

export type ScriptDefinition = {
  platform: string;
  scriptId: string;
  version: string;
} & (
  | {
      browserMode: 'shared' | 'exclusive';
      maxTasksPerBrowser: number;
      collect: (ctx: CollectContext) => Promise<void>;
    }
  | {
      browserMode: 'none';
      collect: (ctx: Omit<CollectContext, 'page'>) => Promise<void>;
    }
);
export const scripts: ScriptDefinition[] = [
  {
    platform: 'TikTok',
    scriptId: 'tiktok.video-comments',
    version: '1.1.5',
    browserMode: 'shared',
    maxTasksPerBrowser: 1,
    collect: collectVideoComments,
  },
  {
    platform: 'TikTok',
    scriptId: 'tiktok.studio-videos',
    version: '1.0.2',
    browserMode: 'exclusive',
    maxTasksPerBrowser: 1,
    collect: collectStudio,
  },
  {
    platform: 'TikTok',
    scriptId: 'tiktok.account-videos',
    version: '1.0.2',
    browserMode: 'shared',
    maxTasksPerBrowser: 1,
    collect: collectAccount,
  },
  {
    platform: 'TikTok',
    scriptId: 'tiktok.keyword-research',
    version: '1.4.0',
    browserMode: 'shared',
    maxTasksPerBrowser: 1,
    collect: collectKeyword,
  },
  {
    platform: 'Instagram',
    scriptId: 'instagram.keyword-research',
    version: '1.0.4',
    browserMode: 'shared',
    maxTasksPerBrowser: 1,
    collect: collectInstagramKeyword,
  },
  {
    platform: 'YouTube',
    scriptId: 'youtube.keyword-research',
    version: '1.0.1',
    browserMode: 'shared',
    maxTasksPerBrowser: 1,
    collect: collectYouTubeKeyword,
  },
  {
    platform: 'Facebook',
    scriptId: 'facebook.keyword-research',
    version: '1.1.0',
    browserMode: 'none',
    collect: async () => {
      throw new Error('USE_SERVER_API');
    },
  },
  {
    platform: 'X',
    scriptId: 'x.keyword-research',
    version: '1.0.0',
    browserMode: 'none',
    collect: async () => {
      throw new Error('USE_SERVER_API');
    },
  },
];
export const schedulerLimits = {
  ...defaultConcurrencySettings,
  maxTabsPerBrowser: 2,
  maxDispatches: 3,
};
