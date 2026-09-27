import { Store } from "@datalom/storage-node/store";
import {
  DatalomError,
  safeError,
  type PlatformAdapter,
  type SessionSecret,
  type Transport,
} from "@datalom/runtime-node/contracts";
import { startRoute } from "@datalom/network-node/route";
import { cookieJar } from "@datalom/network-node/cookies";
import { HttpTransport } from "@datalom/network-node/transport";
import { TikTokAdapter } from "@datalom/platform-tiktok/adapter";
import {
  errorRecord,
  type Trace,
  type TraceContext,
} from "@datalom/runtime-node/diagnostics";
import { createHash } from "node:crypto";

export async function openTransport(
  session: SessionSecret,
  dir: string,
  trace?: Trace,
) {
  if (!session.route?.verifiedAt)
    throw new DatalomError(
      "PROXY_UNAVAILABLE",
      "请先验证账号代理线路与 Profile 出口一致性",
    );
  const jar = cookieJar(session);
  const route = await startRoute(session.route, dir, trace);
  return {
    transport: new HttpTransport(
      route.url,
      jar,
      {
        "user-agent": session.observed.userAgent,
        "accept-language": session.observed.language,
      },
      undefined,
      trace,
    ),
    save: () => {
      session.cookieJar = jar.serializeSync()
        ? JSON.stringify(jar.serializeSync())
        : undefined;
    },
    close: route.stop,
  };
}
export class Runner {
  private active = new Map<string, AbortController>();
  private polling = false;
  private timer?: ReturnType<typeof setInterval>;
  private halted = false;
  get healthy() {
    return !this.halted;
  }
  private fatal(error: unknown) {
    this.halted = true;
    if (this.timer) clearInterval(this.timer);
    for (const controller of this.active.values()) controller.abort();
    try {
      this.store.diagnostics.emergency({
        stage: "worker-fatal",
        pid: process.pid,
        error: errorRecord(error),
      });
    } catch {
      /* emergency() reports a fixed secret-free fatal message. */
    }
    process.stderr.write(
      "DATALOM_WORKER_HALTED: inspect encrypted diagnostics before restarting.\n",
    );
  }
  constructor(
    private store: Store,
    private adapter: PlatformAdapter = new TikTokAdapter(),
    private factory: (
      session: SessionSecret,
      dir: string,
      trace?: Trace,
    ) => Promise<{
      transport: Transport;
      save(): void;
      close(): void | Promise<void>;
    }> = openTransport,
    private interval = 3000,
  ) {}
  start() {
    this.timer = setInterval(
      () => void this.tick().catch((e) => this.fatal(e)),
      500,
    );
    void this.tick().catch((e) => this.fatal(e));
  }
  async stop() {
    if (this.timer) clearInterval(this.timer);
    for (const c of this.active.values()) c.abort();
    while (this.active.size) await new Promise((r) => setTimeout(r, 50));
  }
  async tick() {
    if (this.polling || this.halted) return;
    this.polling = true;
    try {
      while (this.active.size < 20) {
        const claimed = this.store.claim();
        if (!claimed) break;
        const c = new AbortController();
        this.active.set(claimed.task.id, c);
        void this.execute(claimed.task, claimed.lease, c)
          .catch((e) => this.fatal(e))
          .finally(() => this.active.delete(claimed.task.id));
      }
    } finally {
      this.polling = false;
    }
  }
  private async execute(task: any, lease: string, controller: AbortController) {
    const { accountId } = task;
    let connection: Awaited<ReturnType<typeof this.factory>> | undefined;
    const started = Date.now();
    const traceContext: TraceContext = {
      taskId: task.id,
      requestId: task.requestId,
      accountId,
    };
    let currentStage = "session";
    let failedAt: string | undefined;
    const trace: Trace = (stage, outcome, payload = {}, errorCode) => {
      if (!stage.startsWith("proxy-") && stage !== "evidence")
        currentStage = stage;
      this.store.diagnostics.event(
        traceContext,
        stage,
        outcome,
        payload,
        errorCode,
      );
    };
    let code = "OK";
    const monitor = setInterval(() => {
      try {
        const t = this.store.task(task.id);
        if (
          t.cancelled ||
          Date.now() > t.deadline ||
          !this.store.renew(accountId, lease)
        )
          controller.abort();
      } catch (e) {
        this.fatal(e);
      }
    }, 500);
    try {
      const account = this.store.getAccount(accountId),
        session = this.store.getSecret(accountId);
      traceContext.sessionVersion = account.version;
      trace("session", "snapshot", {
        session,
        input: task.input,
        deadline: task.deadline,
        adapter: this.adapter.version,
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        pid: process.pid,
        transport: "impit@0.14.5/chrome151",
        http3: false,
        routeId: createHash("sha256")
          .update(JSON.stringify(session.route ?? null))
          .digest("hex"),
      });
      trace("route", "started");
      connection = await this.factory(session, this.store.dir, trace);
      trace("route", "ready");
      const values: unknown[] = [],
        seen = new Set<string>();
      const cursors = new Set<string>();
      let cursor = task.input.cursor ?? "0";
      const maxPages =
        task.input.operation === "video.comments"
          ? (task.input.maxPages ?? 1)
          : 1;
      const context = {
        account,
        session,
        signal: controller.signal,
        transport: connection.transport,
        trace,
        recordEvidence: (kind: string, summary: string, payload: unknown) => {
          const evidenceId = this.store.evidence(accountId, kind, summary, {
            ...traceContext,
            payload,
          });
          trace("evidence", "saved", { evidenceId, kind });
        },
        saveSession: () => {
          trace("session-save", "started");
          connection!.save();
          this.store.saveSecret(accountId, account.version, session, lease);
          trace("session-save", "completed");
        },
      };
      for (let page = 0; page < maxPages; page++) {
        traceContext.page = page + 1;
        if (controller.signal.aborted)
          throw new DatalomError(
            Date.now() > task.deadline ? "DEADLINE" : "CANCELLED",
            "任务已取消或到达截止时间",
          );
        if (this.store.getAccount(accountId).status === "disabled")
          throw new DatalomError("CANCELLED", "账号已禁用");
        const wait = Math.max(
          0,
          this.store.getAccount(accountId).nextAllowedAt - Date.now(),
        );
        if (wait)
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
              controller.signal.removeEventListener("abort", abort);
              resolve();
            }, wait);
            const abort = () => {
              clearTimeout(timer);
              reject(new DatalomError("CANCELLED", "任务已取消"));
            };
            controller.signal.addEventListener("abort", abort, { once: true });
          });
        let result;
        for (let attempt = 0; ; attempt++) {
          failedAt = undefined;
          traceContext.attempt = attempt + 1;
          trace("attempt", "started", { cursor });
          try {
            const rateWait = this.store.reserveRate(
              accountId,
              lease,
              task.input.operation,
              this.interval,
            );
            trace("rate-wait", "scheduled", { waitMs: rateWait });
            if (rateWait)
              await new Promise<void>((resolve, reject) => {
                if (controller.signal.aborted) {
                  reject(new DatalomError("CANCELLED", "任务已取消"));
                  return;
                }
                const timer = setTimeout(() => {
                  controller.signal.removeEventListener("abort", abort);
                  resolve();
                }, rateWait);
                const abort = () => {
                  clearTimeout(timer);
                  reject(new DatalomError("CANCELLED", "任务已取消"));
                };
                controller.signal.addEventListener("abort", abort, {
                  once: true,
                });
              });
            if (controller.signal.aborted)
              throw new DatalomError("CANCELLED", "任务已取消");
            result = await this.adapter.execute(
              { ...task.input, cursor },
              context,
            );
            trace("attempt", "completed");
            break;
          } catch (e) {
            const classified = safeError(e);
            const retry =
              e instanceof DatalomError && e.code === "NETWORK" && attempt === 0;
            const failedStage = currentStage;
            failedAt = failedStage;
            trace(
              "attempt",
              "failed",
              { failedStage, error: errorRecord(e), retry },
              classified.code,
            );
            if (
              !(e instanceof DatalomError) ||
              e.code !== "NETWORK" ||
              attempt === 1
            )
              throw e;
            trace("retry", "scheduled", {
              waitMs: this.interval,
              reason: "transient-network",
              remaining: 0,
            });
            await new Promise((r) => setTimeout(r, this.interval));
          } finally {
            this.store.scheduleNext(accountId, lease, this.interval);
          }
        }
        context.saveSession();
        if (task.input.operation === "video.comments")
          for (const item of result.data as any[]) {
            if (!seen.has(item.cid)) {
              seen.add(item.cid);
              values.push(item);
            }
          }
        const saved = {
          ...result,
          data:
            task.input.operation === "video.comments" ? values : result.data,
        };
        this.store.progress(task.id, lease, saved, page + 1);
        trace("pagination", "saved", {
          pages: page + 1,
          cursor: result.cursor,
          hasMore: result.hasMore,
          uniqueCount: values.length,
        });
        if (!result.hasMore) break;
        if (
          !result.cursor ||
          result.cursor === cursor ||
          cursors.has(result.cursor)
        )
          throw new DatalomError(
            "SCHEMA_CHANGED",
            "分页游标未推进，已停止防止重复请求",
          );
        cursors.add(cursor);
        cursor = result.cursor;
      }
      this.store.sql
        .transaction(() => {
          this.store.resetRateStrikes(accountId);
          this.store.status(accountId, "ready");
          this.store.finish(task.id, lease, "succeeded");
          trace("task", this.store.task(task.id).status, {
            durationMs: Date.now() - started,
          });
        })
        .immediate();
    } catch (e) {
      const error = safeError(e);
      const failedStage = failedAt ?? currentStage;
      trace(
        "task",
        "failed",
        {
          failedStage,
          error: errorRecord(e),
          durationMs: Date.now() - started,
        },
        error.code,
      );
      if (error.code !== "CANCELLED")
        this.store.diagnostics.issue(task, error.code, { failedStage });
      code = error.code;
      if (code === "RATE_LIMIT")
        this.store.coolDownAccount(accountId, error.message);
      else if (code === "LOGIN_REQUIRED" || code === "CHALLENGE")
        this.store.status(accountId, "login_required", error.message);
      else if (code !== "CANCELLED")
        this.store.status(accountId, "pending", error.message);
      this.store.evidence(
        accountId,
        "failure",
        `${task.input.operation} · ${code}`,
        {
          taskId: task.id,
          error,
          nextExperiment:
            code === "RESEARCH_REQUIRED"
              ? "对照已捕获成功请求，定位签名或运行时依赖"
              : "对照线路、响应结构与会话有效性",
        },
      );
      this.store.finish(
        task.id,
        lease,
        code === "CANCELLED" ? "cancelled" : "failed",
        error,
      );
    } finally {
      clearInterval(monitor);
      try {
        await connection?.close();
        trace("cleanup", "completed");
      } finally {
        this.store.metric(
          task.id,
          accountId,
          task.input.operation,
          code,
          Date.now() - started,
        );
        this.store.release(accountId, lease);
      }
    }
  }
}
