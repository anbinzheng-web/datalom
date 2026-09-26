import { DatalomError } from "@datalom/runtime-node/contracts";
export interface GraphQLDocument {
  data: Record<string, any>;
  chunks: Record<string, any>[];
}
const object = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === "object" && !Array.isArray(v);
function safeTree(v: unknown): void {
  if (!v || typeof v !== "object") return;
  for (const [key, child] of Object.entries(v)) {
    if (["__proto__", "prototype", "constructor"].includes(key))
      throw new DatalomError("SCHEMA_CHANGED", "响应包含不安全的对象键");
    safeTree(child);
  }
}
export function parseGraphQL(status: number, body: string): GraphQLDocument {
  if (status === 429)
    throw new DatalomError("RATE_LIMIT", "Facebook 限流，停止请求并冷却");
  if (status === 401)
    throw new DatalomError("LOGIN_REQUIRED", "Facebook 会话失效");
  if (status === 403)
    throw new DatalomError("CHALLENGE", "Facebook 拒绝请求，需要检查验证页面");
  if (status >= 300 && status < 400)
    throw new DatalomError("LOGIN_REQUIRED", "Facebook 重定向，未自动跟随");
  if (status >= 500)
    throw new DatalomError("NETWORK", "Facebook 服务暂时不可用");
  if (status !== 200)
    throw new DatalomError("RESEARCH_REQUIRED", `Facebook HTTP ${status}`);
  const text = body.replace(/^\s*for\s*\(;;\);\s*/, "").trim();
  if (!text) throw new DatalomError("SCHEMA_CHANGED", "GraphQL 返回空响应");
  let chunks: any[];
  try {
    chunks = text
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    throw new DatalomError("SCHEMA_CHANGED", "GraphQL 增量响应不是完整 JSON", {
      cause: error,
    });
  }
  const data: Record<string, any> = {};
  for (const chunk of chunks) {
    if (!object(chunk))
      throw new DatalomError("SCHEMA_CHANGED", "GraphQL 分段结构异常");
    safeTree(chunk);
    if (chunk.errors?.length || chunk.error)
      throw new DatalomError(
        "RESEARCH_REQUIRED",
        "GraphQL 返回业务错误，原始错误已保留",
        {
          cause: {
            errors: chunk.errors,
            error: chunk.error,
            errorSummary: chunk.errorSummary,
            errorDescription: chunk.errorDescription,
          },
        },
      );
    if (chunk.path !== undefined) {
      if (!Array.isArray(chunk.path) || !object(chunk.data))
        throw new DatalomError("SCHEMA_CHANGED", "GraphQL 增量补丁结构变化");
      let target: any = data;
      for (const [index, key] of chunk.path.entries()) {
        // Relay @stream appends an edge at the next contiguous array index.
        // Missing object paths or sparse indices remain schema errors.
        if (
          Array.isArray(target) &&
          index === chunk.path.length - 1 &&
          Number.isSafeInteger(key) &&
          key === target.length &&
          typeof chunk.label === "string" &&
          chunk.label.includes("$stream$")
        ) {
          target.push({});
        }
        if (
          !(
            (typeof key === "string" &&
              !["__proto__", "constructor", "prototype"].includes(key)) ||
            (Number.isSafeInteger(key) && key >= 0)
          ) ||
          !Object.hasOwn(target, key) ||
          !target[key] ||
          typeof target[key] !== "object"
        )
          throw new DatalomError("SCHEMA_CHANGED", "增量补丁目标缺失");
        target = target[key];
      }
      Object.assign(target, structuredClone(chunk.data));
    } else if (object(chunk.data))
      Object.assign(data, structuredClone(chunk.data));
    else if (!chunk.extensions && chunk.data !== null)
      throw new DatalomError("SCHEMA_CHANGED", "GraphQL 缺少 data");
  }
  if (!Object.keys(data).length)
    throw new DatalomError("SCHEMA_CHANGED", "GraphQL 没有可验证的数据");
  return { data, chunks };
}
export function parseConnection(connection: any) {
  if (
    !object(connection) ||
    !Array.isArray(connection.edges) ||
    !object(connection.page_info)
  )
    throw new DatalomError("SCHEMA_CHANGED", "GraphQL 分页结构变化");
  const page = connection.page_info;
  if (
    typeof page.has_next_page !== "boolean" ||
    typeof page.has_previous_page !== "boolean" ||
    (page.end_cursor !== null && typeof page.end_cursor !== "string") ||
    (page.has_next_page && !page.end_cursor)
  )
    throw new DatalomError("SCHEMA_CHANGED", "GraphQL 分页标志或游标缺失");
  const ids = new Set<string>();
  for (const edge of connection.edges) {
    if (
      !object(edge?.node) ||
      typeof edge.node.id !== "string" ||
      !edge.node.id ||
      ids.has(edge.node.id)
    )
      throw new DatalomError("SCHEMA_CHANGED", "GraphQL 节点 ID 缺失或重复");
    ids.add(edge.node.id);
  }
  return {
    items: connection.edges.map((e: any) => e.node),
    cursor: page.end_cursor as string | null,
    hasMore: page.has_next_page as boolean,
  };
}
