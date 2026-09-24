import React, { useEffect, useState } from "react";
type Api = (path: string, method?: string, body?: unknown) => Promise<any>;
const states: Record<string, string> = {
  open: "待排查",
  investigating: "排查中",
  blocked: "待实验条件",
  resolved: "已解决",
};
function Timeline({ events }: { events: any[] }) {
  return (
    <div className="diagnostic-timeline">
      {events.map((e) => (
        <div className="activity" key={e.id}>
          <span className="event-dot" />
          <div>
            <b>
              {e.stage} · {e.outcome}
              {e.code ? ` · ${e.code}` : ""}
            </b>
            <small>
              {new Date(e.createdAt).toLocaleString("zh-CN")} · 页{" "}
              {e.page ?? "—"} / 尝试 {e.attempt ?? "—"}
            </small>
            <small>事件 {e.id}</small>
          </div>
        </div>
      ))}
    </div>
  );
}
export function SystemDiagnostics({ request }: { request: Api }) {
  const [events, setEvents] = useState<any[] | null>(null),
    [error, setError] = useState("");
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>服务排查记录</h2>
        <button
          onClick={() =>
            request("/diagnostics/events")
              .then(setEvents)
              .catch((e) => setError(e.message))
          }
        >
          读取最近事件
        </button>
      </div>
      <p className="help">
        提取、代理验证和管理请求的失败按事件 ID 追踪；原始异常在本机加密保存。
      </p>
      {error && (
        <div role="alert" className="alert">
          {error}
        </div>
      )}
      {events && <Timeline events={events} />}
    </section>
  );
}
export function TaskDiagnostics({
  taskId,
  request,
}: {
  taskId: string;
  request: Api;
}) {
  const [report, setReport] = useState<any>(null),
    [form, setForm] = useState<any>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const refresh = async () => {
    const r = await request(`/tasks/${taskId}/diagnostics`);
    setReport(r);
    setForm(
      r.incident
        ? {
            revision: r.incident.revision,
            state: r.incident.state,
            certainty: r.incident.certainty,
            cause: r.incident.cause,
            nextExperiment: r.incident.nextExperiment ?? "",
            fix: r.incident.fix ?? "",
            regressionTaskId: r.incident.regressionTaskId ?? "",
          }
        : null,
    );
  };
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, [taskId]);
  return (
    <section className="diagnostics">
      <h3>问题排查</h3>
      <p className="help">
        记录事实 → 检查证据 → 验证推测 → 修复 →
        回归。暂未解决也要保留原因判断和下一步实验。
      </p>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
      {report && (
        <>
          <p className="help">
            请求 ID：{report.task.requestId}
            <br />
            任务 ID：{taskId}
          </p>
          <div className="drawer-actions">
            <button
              disabled={busy}
              onClick={() => {
                setError("");
                void refresh().catch((e) => setError(e.message));
              }}
            >
              刷新排查记录
            </button>
            <button
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob([JSON.stringify(report, null, 2)], {
                    type: "application/json",
                  }),
                );
                const a = document.createElement("a");
                a.href = url;
                a.download = `spider-diagnostics-${taskId}.json`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              导出排查报告
            </button>
          </div>
          {!report.evidenceAvailable && (
            <p className="alert">此任务没有新版时间线，无法补造历史日志。</p>
          )}
          {form && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                setNotice("");
                try {
                  await request(`/tasks/${taskId}/diagnosis`, "PUT", form);
                  await refresh();
                  setNotice("排查结论已保存，历史记录已保留");
                } catch (error) {
                  setError((error as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <p>{report.incident.observation}</p>
              <label>
                排查状态
                <select
                  aria-label="排查状态"
                  value={form.state}
                  onChange={(e) => setForm({ ...form, state: e.target.value })}
                >
                  {Object.entries(states).map(([key, name]) => (
                    <option key={key} value={key}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                原因确认程度
                <select
                  value={form.certainty}
                  onChange={(e) =>
                    setForm({ ...form, certainty: e.target.value })
                  }
                >
                  <option value="unconfirmed">尚未确认</option>
                  <option value="hypothesis">待验证推测</option>
                  <option value="confirmed">有证据确认</option>
                </select>
              </label>
              {[
                ["cause", "当前为什么失败及判断依据"],
                ["nextExperiment", "下一步实验与阻塞条件"],
                ["fix", "修复内容与回归说明"],
              ].map(([key, label]) => (
                <label key={key}>
                  {label}
                  <textarea
                    maxLength={8000}
                    value={form[key]}
                    required={key === "cause"}
                    onChange={(e) =>
                      setForm({ ...form, [key]: e.target.value })
                    }
                  />
                </label>
              ))}
              <label>
                成功回归任务 ID
                <input
                  value={form.regressionTaskId}
                  maxLength={100}
                  onChange={(e) =>
                    setForm({ ...form, regressionTaskId: e.target.value })
                  }
                />
              </label>
              <p className="help">
                标记已解决需要确认原因、修复说明及本问题发生后同账号同操作的成功任务。文字说明中请勿粘贴
                Cookie 或密钥。
              </p>
              <button className="primary" disabled={busy}>
                保存排查结论
              </button>
            </form>
          )}
          <h4>执行时间线 · {report.events.length} 条</h4>
          <Timeline events={report.events} />
        </>
      )}
    </section>
  );
}
