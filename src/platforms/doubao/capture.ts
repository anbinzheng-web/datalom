import { createHash } from "node:crypto";
import { SpiderError } from "../../core/contracts.ts";
import { inspectDoubaoStream, parseDoubaoSSE } from "./protocol.ts";

export interface Capture {
  url: string;
  method: string;
  headers: Record<string, string>;
  requestBody: string | null;
  status: number;
  body: string;
  responseHeaders: Record<string, string>;
  httpVersion?: string;
}
const headers = (entries: any[]) =>
  Object.fromEntries(
    entries.map((entry) => [
      String(entry.name).toLowerCase(),
      String(entry.value),
    ]),
  );
export function doubaoHarEntries(har: any): Capture[] {
  if (!Array.isArray(har?.log?.entries))
    throw new SpiderError("INVALID_INPUT", "文件不是 HAR 请求记录");
  return har.log.entries
    .filter((entry: any) => {
      try {
        return ["www.doubao.com", "accounts.doubao.com"].includes(
          new URL(entry.request.url).hostname,
        );
      } catch {
        return false;
      }
    })
    .map((entry: any) => {
      if (
        !entry.response ||
        !Number.isInteger(entry.response.status) ||
        typeof entry.request.method !== "string" ||
        (entry.request.headers !== undefined &&
          !Array.isArray(entry.request.headers)) ||
        (entry.response.headers !== undefined &&
          !Array.isArray(entry.response.headers))
      )
        throw new SpiderError(
          "INVALID_INPUT",
          "HAR 中豆包请求或响应结构不完整",
        );
      const requestHeaders = headers(entry.request.headers ?? []);
      if (!requestHeaders.cookie && entry.request.cookies?.length)
        requestHeaders.cookie = entry.request.cookies
          .map((cookie: any) => `${cookie.name}=${cookie.value}`)
          .join("; ");
      const content = entry.response.content ?? {};
      return {
        url: entry.request.url,
        method: entry.request.method,
        headers: requestHeaders,
        requestBody: entry.request.postData?.text ?? null,
        status: entry.response.status,
        body:
          content.encoding === "base64"
            ? Buffer.from(content.text ?? "", "base64").toString("utf8")
            : (content.text ?? ""),
        responseHeaders: headers(entry.response.headers ?? []),
        httpVersion: entry.response.httpVersion,
      };
    });
}
function differences(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
) {
  const hash = (value: unknown) =>
    createHash("sha256")
      .update(JSON.stringify(value) ?? "undefined")
      .digest("hex");
  return [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .sort()
    .flatMap((key) => {
      if (!Object.hasOwn(left, key))
        return [{ field: key, change: "only-comparison" }];
      if (!Object.hasOwn(right, key))
        return [{ field: key, change: "only-research" }];
      return hash(left[key]) === hash(right[key])
        ? []
        : [{ field: key, change: "different" }];
    });
}
function bodyFields(body: string | null) {
  const fields: Record<string, unknown> = {};
  const visit = (value: unknown, path: string) => {
    if (value && typeof value === "object") {
      fields[path + ".type"] = Array.isArray(value) ? "array" : "object";
      if (Array.isArray(value)) fields[path + ".length"] = value.length;
      for (const [key, child] of Object.entries(value))
        visit(child, path + "." + key);
    } else fields[path] = value;
  };
  try {
    visit(JSON.parse(body ?? "null"), "body");
  } catch {
    fields.body = body;
  }
  return fields;
}
function cookies(value: string) {
  return Object.fromEntries(
    value
      .split(/;\s*/)
      .filter(Boolean)
      .map((pair) => {
        const index = pair.indexOf("=");
        return index < 0
          ? [pair, ""]
          : [pair.slice(0, index), pair.slice(index + 1)];
      }),
  );
}
export function streamSummary(capture: Capture) {
  if (!capture.body)
    return { classification: "missing-response-body", events: [] };
  try {
    const events = parseDoubaoSSE(capture.body);
    if (!events.length)
      return {
        classification: "unrecognized-response",
        httpStatus: capture.status,
        events: [],
      };
    const result = inspectDoubaoStream(capture.status, capture.body);
    return {
      classification: result.success
        ? "success"
        : "businessCode" in result
          ? "rejected"
          : result.classification,
      httpStatus: capture.status,
      errorCode: "businessCode" in result ? result.businessCode : undefined,
      answerLength: result.success ? result.answer.length : undefined,
      events: events.map((event) => event.event),
    };
  } catch {
    return {
      classification: "unrecognized-response",
      httpStatus: capture.status,
      events: [],
    };
  }
}
export function compareDoubaoCaptures(research: Capture, comparison: Capture) {
  const left = new URL(research.url),
    right = new URL(comparison.url);
  const queryFields = (params: URLSearchParams) =>
    Object.fromEntries(
      [...new Set(params.keys())].map((key) => [key, params.getAll(key)]),
    );
  return {
    methodChanged: research.method !== comparison.method,
    endpointChanged:
      left.origin + left.pathname !== right.origin + right.pathname,
    queryDifferences: differences(
      queryFields(left.searchParams),
      queryFields(right.searchParams),
    ),
    headerDifferences: differences(research.headers, comparison.headers),
    cookieDifferences: differences(
      cookies(research.headers.cookie ?? ""),
      cookies(comparison.headers.cookie ?? ""),
    ),
    bodyDifferences: differences(
      bodyFields(research.requestBody),
      bodyFields(comparison.requestBody),
    ),
    research: streamSummary(research),
    comparison: streamSummary(comparison),
    causeConfirmed: false,
    note: "差异不等于根因。动态 ID、时间戳和签名可能正常不同；报告不输出字段值。",
  };
}
