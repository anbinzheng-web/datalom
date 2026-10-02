import { createHash } from "node:crypto";
import { createContext, runInContext, type Context } from "node:vm";
import { parseHTML } from "linkedom";
import { CookieJar } from "tough-cookie";
import { DatalomError } from "@datalom/shared/runtime/contracts";

// Official JavaScript, pinned to the version observed in both the archived page
// and the 2026-09-17 HTTP page. Download/cache it locally, never execute new code
// just because the remote URL changed. This is a Node compatibility runtime,
// not a Chromium process and not a claim of a clean-room algorithm rewrite.
export const DOUBAO_SDK_URL =
  "https://lf-flow-web-cdn.doubao.com/obj/flow-doubao/doubao/chat/static/js/async/bdms-sdk.f36aabd9.js";
export const DOUBAO_SDK_SHA256 =
  "ceac08af90a0ad7690473b42c421433756f112bfb8a28f611718e0c32446387c";
export const DOUBAO_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36";

export function verifyDoubaoSDK(source: string) {
  if (createHash("sha256").update(source).digest("hex") !== DOUBAO_SDK_SHA256)
    throw new DatalomError(
      "RESEARCH_REQUIRED",
      "豆包 BDMS 源码哈希不匹配，停止执行",
    );
}

interface CapturedRequest {
  url: string;
  method: string;
  body?: string;
  headers: Record<string, string>;
}

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, String(value)),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  };
}

export class DoubaoSigner {
  private context: Context;
  private captured: CapturedRequest[] = [];
  private timers: Array<{
    cb: (...args: any[]) => void;
    ms: number;
    args: any[];
  }> = [];

  constructor(
    source: string,
    userAgent: string,
    jar: CookieJar,
    msToken?: string,
  ) {
    verifyDoubaoSDK(source);
    const { document } = parseHTML("<html><head></head><body></body></html>");
    const location = new URL("https://www.doubao.com/chat/");
    document.addEventListener = () => {};
    document.removeEventListener = () => {};
    Object.defineProperties(document, {
      cookie: {
        get: () => jar.getCookieStringSync(location.href, { http: false }),
        set: (value: string) =>
          jar.setCookieSync(value, location.href, { http: false }),
      },
      location: { value: location },
      URL: { value: location.href },
      referrer: { value: "" },
      visibilityState: { value: "visible" },
      readyState: { value: "complete" },
    });
    const createElement = document.createElement.bind(document);
    document.createElement = ((tag: string) => {
      if (tag !== "a") return createElement(tag);
      let url = new URL(location.href);
      return new Proxy(createElement(tag), {
        get(target, key) {
          if (
            [
              "href",
              "host",
              "hostname",
              "pathname",
              "search",
              "hash",
              "origin",
              "protocol",
              "port",
            ].includes(String(key))
          )
            return Reflect.get(url, key);
          return Reflect.get(target, key);
        },
        set(target, key, value) {
          if (key === "href") {
            url = new URL(value, location);
            return true;
          }
          return Reflect.set(target, key, value);
        },
      });
    }) as typeof document.createElement;
    const captured = this.captured;
    // All SDK networking is captured. Only the caller's explicit Node HTTP
    // transport can send a request; SDK timers cannot generate background traffic.
    class XMLHttpRequest {
      private method = "GET";
      private url = "";
      private headers: Record<string, string> = {};
      open(method: string, url: string) {
        this.method = method;
        this.url = url;
      }
      setRequestHeader(key: string, value: string) {
        this.headers[key] = value;
      }
      getAllResponseHeaders() {
        return "";
      }
      getResponseHeader() {
        return null;
      }
      addEventListener() {}
      removeEventListener() {}
      send(body?: string) {
        captured.push({
          method: this.method,
          url: this.url,
          headers: this.headers,
          body,
        });
      }
    }
    this.context = createContext({
      document,
      location,
      navigator: {
        userAgent,
        platform: "MacIntel",
        language: "zh-CN",
        languages: ["zh-CN", "zh"],
        hardwareConcurrency: 8,
        deviceMemory: 8,
        maxTouchPoints: 0,
        cookieEnabled: true,
        plugins: [],
        webdriver: false,
      },
      screen: {
        width: 1512,
        height: 982,
        availWidth: 1512,
        availHeight: 945,
        colorDepth: 24,
        pixelDepth: 24,
      },
      innerWidth: 1440,
      innerHeight: 800,
      outerWidth: 1512,
      outerHeight: 945,
      devicePixelRatio: 2,
      localStorage: storage(),
      sessionStorage: storage(),
      console: { log() {}, warn() {}, error() {}, debug() {} },
      atob,
      btoa,
      TextEncoder,
      TextDecoder,
      URL,
      URLSearchParams,
      Request,
      Response,
      Headers,
      XMLHttpRequest,
      setTimeout: (
        cb: (...args: any[]) => void,
        ms: number,
        ...args: any[]
      ) => {
        this.timers.push({ cb, ms, args });
        return this.timers.length;
      },
      clearTimeout() {},
      setInterval: () => 0,
      clearInterval() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {},
      performance: {
        now: () => 1000,
        timeOrigin: Date.now() - 1000,
        getEntries: () => [],
        getEntriesByType: () => [],
      },
      fetch: async (url: string | Request, init?: RequestInit) => {
        captured.push({
          url: typeof url === "string" ? url : url.url,
          method: init?.method ?? "GET",
          body: init?.body as string | undefined,
          headers: Object.fromEntries(new Headers(init?.headers)),
        });
        return new Response("{}", { status: 200 });
      },
    });
    if (msToken) this.context.localStorage.setItem("xmst", msToken);
    this.run(
      "window=globalThis;self=globalThis;top=globalThis;parent=globalThis;",
    );
    this.run(source);
    this.run(`var modules=__LOADABLE_LOADED_CHUNKS__[0][1],cache={};
      function requireModule(id){if(cache[id])return cache[id].exports;
        var m=cache[id]={exports:{}};modules[id](m,m.exports,requireModule);return m.exports;}
      requireModule(633286);
      bdms.init({aid:497858,pageId:26930,paths:{include:["/alice","/samantha","/passport","/biz","/chat/completion","/chat/async/chunk_stream"],exclude:[]},ic:13,ddrt:13});`);
  }

  private run(code: string) {
    return runInContext(code, this.context, {
      timeout: 5000,
      filename: "doubao-bdms-node.js",
    });
  }

  async sign(urlValue: string, body: string): Promise<string> {
    const url = new URL(urlValue);
    if (url.origin !== "https://www.doubao.com")
      throw new DatalomError("INVALID_INPUT", "签名目标必须是豆包同源接口");
    url.searchParams.delete("a_bogus");
    this.captured.length = 0;
    this.context.input = { url: url.toString(), body };
    try {
      await this.run(
        'fetch(input.url,{method:"POST",headers:{"content-type":"application/json"},body:input.body})',
      );
      const request = this.captured.find(
        (r) => new URL(r.url).pathname === url.pathname,
      );
      if (
        !request ||
        request.body !== body ||
        !new URL(request.url).searchParams.get("a_bogus")
      )
        throw new DatalomError(
          "RESEARCH_REQUIRED",
          "BDMS 未为当前请求生成新签名",
        );
      const signed = new URL(request.url);
      if (
        signed.origin !== url.origin ||
        signed.pathname !== url.pathname ||
        [...url.searchParams].some(
          ([key, value]) => signed.searchParams.get(key) !== value,
        )
      )
        throw new DatalomError(
          "RESEARCH_REQUIRED",
          "BDMS 意外改写了待签名的请求字段",
        );
      return request.url;
    } finally {
      delete this.context.input;
    }
  }

  async tokenRequest(): Promise<CapturedRequest> {
    this.captured.length = 0;
    for (const timer of this.timers.splice(0).sort((a, b) => a.ms - b.ms)) {
      this.context.timer = timer;
      this.run("timer.cb(...timer.args)");
    }
    delete this.context.timer;
    // The SDK builds its report through a promise continuation.
    await Promise.resolve();
    await Promise.resolve();
    const request = this.captured.find((r) => {
      const url = new URL(r.url);
      return (
        url.origin === "https://mssdk.bytedance.com" &&
        url.pathname === "/web/r/token"
      );
    });
    if (!request)
      throw new DatalomError(
        "RESEARCH_REQUIRED",
        "BDMS 未生成 Token 初始化请求",
      );
    return request;
  }
}
