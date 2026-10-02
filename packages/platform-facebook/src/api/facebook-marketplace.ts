import { NativeError } from '@datalom/platform-runtime/reverse-core';
import { parseGraphQL } from '@datalom/platform-runtime/graphql-protocol';

export const marketplaceOperations = {
  'marketplace.seller': {
    name: 'MarketplaceSellerProfileDialogQuery',
    fields: ['sellerId'],
    idKey: 'sellerId',
    root: 'user',
  },
  'marketplace.inventory': {
    name: 'MarketplaceSellerProfileInventoryQuery',
    fields: ['sellerID'],
    idKey: 'sellerID',
    root: 'profile',
  },
  'marketplace.detail': {
    name: 'MarketplacePDPContainerQuery',
    fields: ['targetId'],
    idKey: 'targetId',
    root: 'viewer',
  },
  'marketplace.media': {
    name: 'MarketplacePDPC2CMediaViewerWithImagesQuery',
    fields: ['targetId'],
    idKey: 'targetId',
    root: 'viewer',
  },
  'marketplace.feed': {
    name: 'MarketplaceCometBrowseFeedLightPaginationQuery',
    fields: ['cursor', 'count'],
    idKey: 'pdpListingId',
    root: 'marketplace_home_feed',
  },
  'marketplace.search': {
    name: 'CometMarketplaceSearchContentContainerQuery',
    fields: ['cursor', 'count', 'query'],
    idKey: 'savedSearchQuery',
    root: 'marketplace_search',
  },
} as const;

const pick = (o: any, keys: string[]) =>
  Object.fromEntries(keys.filter((k) => o?.[k] !== undefined).map((k) => [k, o[k]]));

export function validateMarketplace(
  operation: string,
  variables: Record<string, any>,
  status: number,
  body: string,
) {
  const parsed = parseGraphQL(status, body);
  let raw: Record<string, any>,
    page: { items: any[]; cursor: string | null; hasMore: boolean } | undefined;
  if (operation === 'marketplace.detail' || operation === 'marketplace.media') {
    const t = parsed.data.viewer?.marketplace_product_details_page?.target;
    if (!t || t.id !== variables.targetId)
      throw new NativeError('SCHEMA_CHANGED', '商品 ID 不匹配');
    if (t.is_viewer_seller) throw new NativeError('INVALID_INPUT', '排除本账号商品');
    if (operation === 'marketplace.detail') {
      if (typeof t.marketplace_listing_title !== 'string' || !t.listing_price)
        throw new NativeError('SCHEMA_CHANGED', '商品标题或价格缺失');
      raw = pick(t, [
        'id',
        'marketplace_listing_title',
        'redacted_description',
        'creation_time',
        'location_text',
        'listing_price',
        'strikethrough_price',
        'is_live',
        'is_pending',
        'is_sold',
        'attribute_data',
        'delivery_types',
        'is_shipping_offered',
        'marketplace_listing_category_id',
        'share_uri',
      ]);
      raw.marketplace_listing_seller = pick(t.marketplace_listing_seller, [
        'id',
        'name',
        'join_time',
        'profile_picture',
        'marketplace_ratings_stats_by_role_v2',
      ]);
    } else {
      if (!Array.isArray(t.listing_photos) || !Array.isArray(t.pre_recorded_videos))
        throw new NativeError('SCHEMA_CHANGED', '商品媒体结构变化');
      raw = {
        id: t.id,
        listing_photos: t.listing_photos.map((p: any) =>
          pick(p, ['id', 'image', 'accessibility_caption']),
        ),
        pre_recorded_videos: t.pre_recorded_videos,
      };
    }
  } else if (operation === 'marketplace.seller') {
    const u = parsed.data.user;
    if (!u || u.id !== variables.sellerId || variables.isSelfProfile !== false)
      throw new NativeError('SCHEMA_CHANGED', '卖家身份不匹配或涉及本账号');
    raw = pick(u, [
      'id',
      'name',
      'registration_time',
      'marketplace_inventory_count',
      'profile_picture_160',
      'marketplace_should_display_verified_badge',
    ]);
    const ratings = u.marketplace_ratings_stats_by_role_v2;
    if (ratings?.seller_ratings_are_private === false)
      raw.ratings = pick(ratings.seller_stats, [
        'five_star_ratings_average',
        'five_star_total_rating_count_by_role',
      ]);
  } else if (operation === 'marketplace.inventory') {
    const p = parsed.data.profile,
      c = p?.marketplace_listing_sets;
    if (
      !p ||
      p.id !== variables.sellerID ||
      p.is_viewer ||
      !Array.isArray(c?.edges) ||
      typeof c.page_info?.has_next_page !== 'boolean'
    )
      throw new NativeError('SCHEMA_CHANGED', '卖家库存结构或身份不匹配');
    raw = {
      id: p.id,
      items: c.edges.map((e: any) => {
        const l = e.node?.canonical_listing;
        if (!l?.id || l.is_viewer_seller)
          throw new NativeError('SCHEMA_CHANGED', '商品缺失或属于本账号');
        return pick(l, [
          'id',
          'marketplace_listing_title',
          'listing_price',
          'is_live',
          'is_pending',
          'is_sold',
          'primary_listing_photo',
          'delivery_types',
        ]);
      }),
      page_info: c.page_info,
    };
  } else {
    const c =
      operation === 'marketplace.feed'
        ? parsed.data.marketplace_home_feed
        : parsed.data.marketplace_search?.feed_units;
    if (
      !Array.isArray(c?.edges) ||
      typeof c.page_info?.has_next_page !== 'boolean' ||
      !(c.page_info.end_cursor === null || typeof c.page_info.end_cursor === 'string') ||
      (c.page_info.has_next_page && !c.page_info.end_cursor)
    )
      throw new NativeError('SCHEMA_CHANGED', '商品列表不是有效分页，null 不代表空结果');
    const items: any[] = [];
    for (const { node: n } of c.edges) {
      if (n?.__typename === 'MarketplaceFeedAdStory') continue;
      if (
        n?.__typename === 'MarketplaceFeedListingStoryObject' ||
        (n?.__typename === 'MarketplaceFeedGeneralListingObject' && n.listing)
      ) {
        const l = n.listing;
        if (
          typeof l?.id !== 'string' ||
          !l.marketplace_listing_title ||
          !l.listing_price ||
          l.is_viewer_seller
        )
          throw new NativeError('SCHEMA_CHANGED', '搜索商品缺少字段或属于本账号');
        items.push(
          pick(l, [
            'id',
            'marketplace_listing_title',
            'listing_price',
            'strikethrough_price',
            'primary_listing_photo',
            'location',
            'is_live',
            'is_pending',
            'is_sold',
            'delivery_types',
          ]),
        );
        continue;
      }
      if (n?.__typename !== 'MarketplaceFeedGeneralListingObject')
        throw new NativeError('RESEARCH_REQUIRED', '发现未验证的商品列表节点类型');
      const id = n.entity?.id;
      if (typeof id !== 'string' || !n.data?.title || !n.data.price)
        throw new NativeError('SCHEMA_CHANGED', '商品摘要缺少 ID、标题或价格');
      items.push({
        id,
        title: n.data.title,
        price: n.data.price,
        creation_time: n.listing?.creation_time,
        location: n.entity.location?.reverse_geocode,
        photo: n.photo?.default_image,
      });
    }
    if (new Set(items.map((x) => x.id)).size !== items.length)
      throw new NativeError('SCHEMA_CHANGED', '商品页内 ID 重复');
    page = {
      items,
      cursor: c.page_info.end_cursor,
      hasMore: c.page_info.has_next_page,
    };
    raw = { items };
  }
  return {
    raw,
    chunks: parsed.chunks.map((c) => ({ label: c.label, path: c.path })),
    page,
  };
}
