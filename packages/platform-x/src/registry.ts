import { parseHTML } from "linkedom";
import { DatalomError } from "@datalom/runtime-node/contracts";
import { operations } from "./native.ts";
export function resolveMainScript(html: string) {
  const urls = [...parseHTML(html).document.querySelectorAll("script[src]")]
    .map((s) => s.getAttribute("src")!)
    .filter((u) =>
      /^https:\/\/abs\.twimg\.com\/responsive-web\/client-web\/main\.[A-Za-z0-9_-]+\.js$/.test(
        u,
      ),
    );
  if (new Set(urls).size !== 1)
    throw new DatalomError("RESEARCH_REQUIRED", "页面缺少唯一主脚本");
  return urls[0];
}
export function parseQueryRegistry(source: string) {
  const out = new Map<string, string>();
  for (const m of source.matchAll(
    /queryId:"([A-Za-z0-9_-]+)",operationName:"([A-Za-z0-9_]+)",operationType:"query"/g,
  )) {
    if (!Object.values(operations).includes(m[2] as any)) continue;
    if (out.has(m[2]) && out.get(m[2]) !== m[1])
      throw new DatalomError("RESEARCH_REQUIRED", "同名操作出现冲突查询 ID");
    out.set(m[2], m[1]);
  }
  if (!out.size)
    throw new DatalomError("RESEARCH_REQUIRED", "主脚本未发现已知只读操作");
  return out;
}
