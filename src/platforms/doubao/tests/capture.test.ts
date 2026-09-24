import { expect, it } from "vitest";
import { compareDoubaoCaptures, doubaoHarEntries } from "../capture.ts";
it("imports only Doubao origins and decodes captured SSE without asserting unverified success", () => {
  const entry = {
    request: {
      url: "https://www.doubao.com/chat/completion?fp=secret-fingerprint",
      method: "POST",
      headers: [{ name: "Authorization", value: "Bearer secret-token" }],
      cookies: [{ name: "sid", value: "secret-cookie" }],
      postData: {
        text: JSON.stringify({
          option: { create_time_ms: 1 },
          messages: [{ text: "private-prompt" }],
        }),
      },
    },
    response: {
      status: 200,
      content: {
        encoding: "base64",
        text: Buffer.from(
          'event: STREAM_ERROR\ndata: {"error_code":710022002}\n\n',
        ).toString("base64"),
      },
      headers: [],
    },
  };
  const captures = doubaoHarEntries({
    log: {
      entries: [
        entry,
        {
          ...entry,
          request: { ...entry.request, url: "https://other.example/private" },
        },
      ],
    },
  });
  expect(captures).toHaveLength(1);
  expect(captures[0].headers.cookie).toBe("sid=secret-cookie");
  const comparison = {
    ...captures[0],
    url: "https://www.doubao.com/chat/completion?fp=another-secret",
    headers: {
      ...captures[0].headers,
      cookie: "sid=new-secret; csrf=another-secret",
    },
    requestBody: JSON.stringify({
      option: { create_time_ms: 2 },
      messages: [{ text: "another-private-prompt" }],
    }),
  };
  const report = compareDoubaoCaptures(captures[0], comparison);
  expect(report.queryDifferences).toContainEqual({
    field: "fp",
    change: "different",
  });
  expect(report.cookieDifferences).toContainEqual({
    field: "csrf",
    change: "only-comparison",
  });
  expect(report.bodyDifferences).toContainEqual({
    field: "body.option.create_time_ms",
    change: "different",
  });
  expect(report.research).toMatchObject({
    classification: "rejected",
    errorCode: 710022002,
  });
  expect(report.causeConfirmed).toBe(false);
  expect(JSON.stringify(report)).not.toMatch(
    /secret-token|private-prompt|secret-cookie|another-secret/,
  );
});
it("summarizes a successful comparison without exposing its answer", () => {
  const rejected = {
    url: "https://www.doubao.com/chat/completion?fp=old",
    method: "POST",
    headers: {},
    requestBody: "{}",
    status: 200,
    body: 'event: STREAM_ERROR\ndata: {"error_code":710022002}\n\n',
    responseHeaders: {},
  };
  const answer = "private successful answer";
  const successful = {
    ...rejected,
    url: "https://www.doubao.com/chat/completion?fp=new",
    body: [
      `event: STREAM_MSG_NOTIFY\ndata: {"content":{"content_block":[{"content":{"text_block":{"text":"${answer}"}}}]}}`,
      'event: SSE_REPLY_END\ndata: {"end_type":3}',
    ].join("\n\n"),
  };
  const report = compareDoubaoCaptures(rejected, successful);
  expect(report.comparison).toMatchObject({
    classification: "success",
    answerLength: answer.length,
  });
  expect(JSON.stringify(report)).not.toContain(answer);
});
