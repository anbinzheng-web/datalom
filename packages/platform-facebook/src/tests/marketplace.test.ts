import { expect, it } from "vitest";
import { parseGraphQL } from "../protocol.ts";
import { validateMarketplace } from "../marketplace.ts";
it("assembles streamed edges without mutating captured chunks; rejects holes", () => {
  const initial = { data: { feed: { edges: [{ node: { id: "1" } }] } } };
  const patch = {
    path: ["feed", "edges", 1],
    label: "q$stream$edges",
    data: { node: { id: "2" } },
  };
  const r = parseGraphQL(
    200,
    [initial, patch].map((x) => JSON.stringify(x)).join("\n"),
  );
  expect(r.data.feed.edges).toHaveLength(2);
  expect(r.chunks[0].data.feed.edges).toHaveLength(1);
  expect(() =>
    parseGraphQL(
      200,
      [initial, { ...patch, path: ["feed", "edges", 4] }]
        .map((x) => JSON.stringify(x))
        .join("\n"),
    ),
  ).toThrow();
});
it("Marketplace details exclude viewer, orders and messaging; match listing id", () => {
  const target = {
    id: "123",
    marketplace_listing_title: "Desk",
    listing_price: { amount: "10", currency: "USD" },
    seller_message_thread: { secret: 1 },
    active_order: { secret: 2 },
    marketplace_listing_seller: { id: "seller", name: "Store" },
  };
  const body = JSON.stringify({
    data: {
      viewer: {
        marketplace_product_details_page: { target },
        marketplace_settings: { secret: 3 },
      },
    },
  });
  const r = validateMarketplace(
    "marketplace.detail",
    { targetId: "123" },
    200,
    body,
  );
  expect(r.raw.marketplace_listing_title).toBe("Desk");
  expect(JSON.stringify(r)).not.toMatch(
    /secret|active_order|seller_message_thread|marketplace_settings/,
  );
  expect(() =>
    validateMarketplace("marketplace.detail", { targetId: "124" }, 200, body),
  ).toThrow();
});
it("does not accept server-error null search as an empty page", () => {
  expect(() =>
    validateMarketplace(
      "marketplace.search",
      {},
      200,
      JSON.stringify({
        data: { marketplace_search: { feed_units: null } },
        errors: [{ code: 1357038, message: "field_exception" }],
      }),
    ),
  ).toThrow();
});

it("search listing nodes expose public fields and skip ad nodes", () => {
  const body = JSON.stringify({
    data: {
      marketplace_search: {
        feed_units: {
          edges: [
            {
              node: {
                __typename: "MarketplaceFeedListingStoryObject",
                listing: {
                  id: "1",
                  marketplace_listing_title: "Table",
                  listing_price: { amount: "10" },
                  seller_message_thread: { secret: 1 },
                },
              },
            },
            { node: { __typename: "MarketplaceFeedAdStory" } },
          ],
          page_info: { end_cursor: "next", has_next_page: true },
        },
      },
    },
  });
  const r = validateMarketplace("marketplace.search", {}, 200, body);
  expect(r.page?.items).toHaveLength(1);
  expect(r.page?.hasMore).toBe(true);
  expect(JSON.stringify(r)).not.toContain("secret");
});
