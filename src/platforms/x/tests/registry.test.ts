import { it, expect } from "vitest";
import { parseQueryRegistry, resolveMainScript } from "../registry.ts";
it("only accepts a unique official main asset", () => {
  expect(
    resolveMainScript(
      '<script src="https://abs.twimg.com/responsive-web/client-web/main.abc.js"></script>',
    ),
  ).toMatch(/main.abc.js$/);
  expect(() =>
    resolveMainScript('<script src="https://evil.test/main.abc.js"></script>'),
  ).toThrow();
  expect(() =>
    resolveMainScript(
      '<script src="https://abs.twimg.com/responsive-web/client-web/main.a.js"></script><script src="https://abs.twimg.com/responsive-web/client-web/main.b.js"></script>',
    ),
  ).toThrow();
});
it("resolves current read operation IDs without evaluating scripts or admitting mutations", () => {
  const s =
    'throw Error("must never execute");{queryId:"new",operationName:"SearchTimeline",operationType:"query"},{queryId:"bad",operationName:"CreateTweet",operationType:"mutation"}';
  expect([...parseQueryRegistry(s)]).toEqual([["SearchTimeline", "new"]]);
  expect(() =>
    parseQueryRegistry(
      s +
        ',queryId:"conflict",operationName:"SearchTimeline",operationType:"query"',
    ),
  ).toThrow();
  expect(() => parseQueryRegistry("unknown format")).toThrow();
});
