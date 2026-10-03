import { inspect } from 'node:util';

export interface TraceContext {
  taskId?: string;
  requestId?: string;
  accountId?: string;
  sessionVersion?: number;
  page?: number;
  attempt?: number;
}

export type Trace = (stage: string, outcome: string, payload?: unknown, code?: string) => unknown;

// Error properties are not enumerable. Preserve causes and native error codes
// explicitly, exclusively inside encrypted evidence (never public logs).
export function errorRecord(error: unknown, depth = 0): unknown {
  if (depth > 6) return { truncated: true };
  if (!(error instanceof Error))
    return {
      thrown: inspect(error, {
        depth: 6,
        getters: false,
        maxStringLength: 65536,
      }),
    };
  const e = error as Error & {
    code?: unknown;
    errno?: unknown;
    syscall?: unknown;
    errors?: unknown[];
  };
  return {
    name: e.name,
    message: e.message,
    stack: e.stack,
    code: e.code,
    errno: e.errno,
    syscall: e.syscall,
    cause: e.cause === undefined ? undefined : errorRecord(e.cause, depth + 1),
    errors: e.errors?.map((x) => errorRecord(x, depth + 1)),
  };
}

export function assessment(code: string) {
  const next: Record<string, string> = {
    NETWORK: '检查原始 cause、GOST 输出及每跳连通性，再以新签名重试同一业务输入对照',
    PROXY_UNAVAILABLE: '检查 GOST 退出码、安装路径、配置与两跳出口；禁止直连回退',
    SCHEMA_CHANGED: '对照已保存响应、内容类型、结构和游标；区分空响应、挑战页与接口变更',
    RESEARCH_REQUIRED: '对照签名阶段、SDK 与样本哈希，建立单变量独立实验',
    LOGIN_REQUIRED: '对照响应状态与会话时间，再人工确认登录状态并重新提取',
    CHALLENGE: '保留挑战响应，人工确认页面状态；不要用反复重试替代诊断',
    RATE_LIMIT: '检查响应与请求间隔，冷却后限速回归，不能据此断定封号',
    INTERRUPTED: '检查最后一个开始但未完成的阶段、Worker 退出事件与系统退出原因',
    DEADLINE: '检查排队时间、账号状态、频率等待与各阶段耗时',
  };
  return {
    certainty: 'unconfirmed',
    observation: `执行分类：${code}；分类本身不是根因证明`,
    cause: '根因尚未确认',
    nextExperiment: next[code] ?? '检查事件时间线和原始异常，并记录下一项可验证实验',
  };
}
