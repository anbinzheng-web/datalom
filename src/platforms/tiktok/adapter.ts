import {
  SpiderError,
  type ExecutionContext,
  type PageResult,
  type PlatformAdapter,
  type TaskInput,
} from "../../core/contracts.ts";
import { signInProcess } from "./signer-process.ts";
import { cookieJar } from "../../network/cookies.ts";
export function normalizeVideo(value: string): { id: string; url?: string } {
  if (/^\d{15,25}$/.test(value)) return { id: value };
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    throw new SpiderError(
      "INVALID_INPUT",
      "请输入 TikTok 视频完整链接或视频 ID",
    );
  }
  if (
    u.protocol !== "https:" ||
    !["www.tiktok.com", "tiktok.com"].includes(u.hostname) ||
    u.username ||
    u.password ||
    u.port
  )
    throw new SpiderError("INVALID_INPUT", "仅接受 TikTok HTTPS 视频链接");
  const match = u.pathname.match(/^\/@[^/]+\/video\/(\d{15,25})\/?$/);
  if (!match)
    throw new SpiderError(
      "INVALID_INPUT",
      "请输入包含 /video/ID 的完整视频链接",
    );
  return { id: match[1], url: `https://www.tiktok.com${u.pathname}` };
}
export function parseApi(status: number, body: string): any {
  if (status === 429)
    throw new SpiderError("RATE_LIMIT", "平台限流，账号进入冷却");
  if (status === 401)
    throw new SpiderError("LOGIN_REQUIRED", "登录状态失效，请重新登录并提取");
  if (status === 403 || /captcha_verify|"verify_center"/.test(body))
    throw new SpiderError("CHALLENGE", "平台要求验证，已暂停账号请求");
  if (status >= 500) throw new SpiderError("NETWORK", "平台暂时不可用");
  if (status >= 300 && status < 400)
    throw new SpiderError("LOGIN_REQUIRED", "平台重定向请求，需要重新验证会话");
  let j: any;
  try {
    j = JSON.parse(body);
  } catch {
    throw new SpiderError(
      "SCHEMA_CHANGED",
      body.length
        ? "平台返回非 JSON 内容，已记录证据"
        : "平台返回空响应，需继续分析请求环境",
    );
  }
  if (j.status_code !== 0)
    throw new SpiderError(
      "RESEARCH_REQUIRED",
      `平台业务状态异常（${typeof j.status_code === "number" ? j.status_code : "unknown"}），需要分析响应`,
    );
  return j;
}
export class TikTokAdapter implements PlatformAdapter {
  platform = "tiktok";
  version = "tiktok-web@0.1.0";
  async execute(
    input: TaskInput,
    context: ExecutionContext,
  ): Promise<PageResult> {
    context.trace?.("parameters", "started", { input });
    const video = normalizeVideo(input.video);
    const template =
      context.session.research?.requestTemplates?.[input.operation];
    if (!template)
      throw new SpiderError(
        "RESEARCH_REQUIRED",
        "尚未采集此接口的真实成功请求。请使用研究命令采集，不能用猜测参数替代",
      );
    const url = new URL(template.url);
    const expected =
      input.operation === "video.detail"
        ? "/api/item/detail/"
        : "/api/comment/list/";
    if (url.origin !== "https://www.tiktok.com" || url.pathname !== expected)
      throw new SpiderError("INVALID_INPUT", "接口样本路径不匹配");
    const updates: Record<string, string> = {
      [input.operation === "video.detail" ? "itemId" : "aweme_id"]: video.id,
    };
    if (input.operation === "video.comments") {
      updates.cursor = input.cursor ?? "0";
      updates.count = String(input.count ?? 20);
    }
    const counter = (context.session.research!.requestCount ?? 0) + 1;
    context.session.research!.requestCount = counter;
    context.trace?.("sign", "started", {
      counter,
      updates,
      templateCapturedAt: template.capturedAt,
      scriptHashes: template.scriptHashes,
      signer: "5.3.2-node",
    });
    const signedUrl = await signInProcess(
      {
        templateUrl: template.url,
        userAgent: context.session.observed.userAgent,
        updates,
        counter,
        msToken: cookieJar(context.session)
          .getCookiesSync(template.url)
          .find((c) => c.key === "msToken")?.value,
      },
      context.signal,
    );
    context.trace?.("sign", "completed", { signedUrl });
    const capturedHeaders = Object.fromEntries(
      Object.entries(template.headers).filter(([k]) =>
        [
          "accept",
          "accept-language",
          "priority",
          "sec-ch-ua",
          "sec-ch-ua-mobile",
          "sec-ch-ua-platform",
          "sec-fetch-dest",
          "sec-fetch-mode",
          "sec-fetch-site",
        ].includes(k),
      ),
    );
    const response = await context.transport.request(signedUrl, {
      signal: context.signal,
      headers: {
        ...capturedHeaders,
        referer:
          video.url ?? template.headers.referer ?? "https://www.tiktok.com/",
        "user-agent": context.session.observed.userAgent,
      },
    });
    context.recordEvidence(
      "independent-request",
      `${input.operation} · HTTP ${response.status} · ${response.body.length} bytes`,
      {
        url: signedUrl,
        status: response.status,
        responseHeaders: Object.fromEntries(response.headers),
        body: response.body,
        signer: "5.3.2-node",
        browserUsed: false,
      },
    );
    context.saveSession();
    context.trace?.("business-parse", "started", {
      status: response.status,
      bytes: Buffer.byteLength(response.body),
    });
    const data = parseApi(response.status, response.body);
    if (input.operation === "video.detail") {
      const item = data.itemInfo?.itemStruct;
      if (!item || String(item.id) !== video.id)
        throw new SpiderError("SCHEMA_CHANGED", "视频详情结构或 ID 不匹配");
      return { data: item, adapterVersion: this.version };
    }
    if (
      !Array.isArray(data.comments) ||
      ![0, 1, false, true].includes(data.has_more) ||
      !["string", "number"].includes(typeof data.cursor)
    )
      throw new SpiderError("SCHEMA_CHANGED", "评论分页结构发生变化");
    if (data.comments.some((c: any) => !c || typeof c.cid !== "string"))
      throw new SpiderError("SCHEMA_CHANGED", "评论缺少可验证的唯一 ID");
    return {
      data: data.comments,
      cursor: String(data.cursor),
      hasMore: !!data.has_more,
      adapterVersion: this.version,
    };
  }
}
