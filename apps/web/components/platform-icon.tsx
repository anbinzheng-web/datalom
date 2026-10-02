const brands = new Set([
  'tiktok',
  'instagram',
  'youtube',
  'x',
  'facebook',
  'reddit',
  'douyin',
  'xiaohongshu',
  'linkedin',
  'bilibili',
  'weibo',
  'kuaishou',
  'wechat',
  'lemon8',
  'zhihu',
  'doubao',
  'threads',
  'claude',
  'cursor',
  'n8n',
  'zapier',
  'langchain',
]);
export function PlatformIcon({ platform }: { platform: string }) {
  if (!brands.has(platform)) return null;
  return (
    <img
      className={
        (platform === 'x' ? 'p-[2px] ' : '') +
        'brand-icon inline-block w-[24px] h-[24px] [object-fit:contain] flex-none [vertical-align:middle] [.menu-item-label_&]:w-[19px] [.menu-item-label_&]:h-[19px] [.platform-icon_&]:w-[27px] [.platform-icon_&]:h-[27px] [.source-node_&]:w-[27px] [.source-node_&]:h-[27px] [.detail-brand_&]:w-[42px] [.detail-brand_&]:h-[42px] [.directory-card_>_&]:w-[32px] [.directory-card_>_&]:h-[32px] [.directory-card_>_&]:mb-4 [.signal-source_&]:w-[24px] [.signal-source_&]:h-[24px] [.api-fold_&]:w-[20px] [.api-fold_&]:h-[20px] [.api-operation-context_&]:w-[20px] [.api-operation-context_&]:h-[20px] [.home-node-icons_&]:w-[23px] [.home-node-icons_&]:h-[23px] [.home-data-source_&]:w-[40px] [.home-data-source_&]:h-[40px] [.home-platform-icon_&]:w-[25px] [.home-platform-icon_&]:h-[25px]'
      }
      src={
        platform === 'tiktok'
          ? '/platforms/tiktok-light.svg'
          : platform === 'lemon8'
            ? 'https://www.lemon8-app.com/favicon.png'
            : '/platforms/' + platform + '.svg'
      }
      width="24"
      height="24"
      alt=""
      aria-hidden="true"
    />
  );
}
