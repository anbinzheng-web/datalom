import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import { SystemDiagnostics, TaskDiagnostics } from "./Diagnostics";
type Tab = "overview" | "accounts" | "research" | "tasks" | "settings";
const labels: Record<string, string> = {
  pending: "待验证",
  ready: "可用",
  cooldown: "冷却中",
  login_required: "需登录",
  disabled: "已禁用",
  queued: "排队中",
  running: "执行中",
  succeeded: "成功",
  failed: "失败",
  cancelled: "已取消",
};
async function api(path: string, method = "GET", body?: unknown) {
  const r = await fetch("/api" + path, {
    method,
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json();
  if (!r.ok)
    throw new Error(
      (j.error?.message ?? "请求失败") +
        (j.diagnosticId ? `（诊断事件 ${j.diagnosticId}）` : ""),
    );
  return j;
}
function Badge({ value }: { value: string }) {
  return <span className={`badge ${value}`}>{labels[value] ?? value}</span>;
}
const time = (value: number) =>
  new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
function App() {
  const dialogTrigger = useRef<HTMLElement | null>(null);
  const [authed, setAuthed] = useState(false),
    [checking, setChecking] = useState(true),
    [token, setToken] = useState(""),
    [tab, setTab] = useState<Tab>("overview");
  const [data, setData] = useState<any>({
      accounts: [],
      tasks: [],
      evidence: [],
      metrics: [],
    }),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState("");
  const [profiles, setProfiles] = useState<any[]>([]),
    [loadedProfiles, setLoadedProfiles] = useState(false),
    [search, setSearch] = useState(""),
    [detail, setDetail] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null),
    [workspaces, setWorkspaces] = useState<any[]>([]),
    [video, setVideo] = useState(""),
    [accountId, setAccountId] = useState(""),
    [operation, setOperation] = useState("video.detail"),
    [maxPages, setMaxPages] = useState(1),
    [selectedTask, setSelectedTask] = useState<any>(null);
  const refresh = async () => {
    const d = await api("/overview");
    setData(d);
    setAuthed(true);
  };
  useEffect(() => {
    refresh()
      .catch(() => setAuthed(false))
      .finally(() => setChecking(false));
  }, []);
  useEffect(() => {
    if (!authed) return;
    const id = setInterval(() => refresh().catch(() => {}), 4000);
    return () => clearInterval(id);
  }, [authed]);
  useEffect(() => {
    if (tab === "settings" && authed)
      api("/settings")
        .then(setSettings)
        .catch((e) => setError(e.message));
  }, [tab, authed]);
  useEffect(() => {
    if (!detail && !selectedTask) return;
    const previous = dialogTrigger.current;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDetail(null);
        setSelectedTask(null);
      }
      if (e.key === "Tab") {
        const dialog = document.querySelector('[role="dialog"]');
        const focusable = dialog?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input,select,textarea,a[href]",
        );
        if (!focusable?.length) return;
        const first = focusable[0],
          last = focusable[focusable.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            !dialog?.contains(document.activeElement))
        ) {
          e.preventDefault();
          last.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last ||
            !dialog?.contains(document.activeElement))
        ) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = originalOverflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [!!detail, !!selectedTask]);
  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  const loadProfiles = () =>
    act("profiles", async () => {
      setProfiles(await api("/roxy/profiles"));
      setLoadedProfiles(true);
    });
  if (checking)
    return (
      <div className="login">
        <div className="logo-symbol">S</div>
        <p>正在连接本地工作台…</p>
      </div>
    );
  if (!authed)
    return (
      <div className="login">
        <div className="login-card">
          <div className="wordmark">
            <div className="logo-symbol">S</div>spider<span>LOCAL</span>
          </div>
          <h1>连接你的 API 工作台</h1>
          <p>账号会话、代理线路与接口研究，都留在你的机器上。</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void act("login", async () => {
                await api("/auth", "POST", { token });
                setToken("");
                setAuthed(true);
              });
            }}
          >
            <label>
              本机访问令牌
              <input
                autoFocus
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                required
                autoComplete="off"
                placeholder="粘贴终端中的访问令牌"
              />
            </label>
            <p className="help">
              在 Spider 项目目录运行 <code>pnpm auth</code> 获取。
            </p>
            <button className="primary" disabled={!!busy}>
              进入工作台 →
            </button>
          </form>
          {error && (
            <div role="alert" className="alert">
              {error}
            </div>
          )}
          <small>127.0.0.1 · 本机访问 · 加密存储</small>
        </div>
      </div>
    );
  const headings: Record<Tab, [string, string]> = {
    overview: ["工作台概览", "从浏览器中的真实请求，到独立运行的 API。"],
    accounts: ["账号与会话", "每个账号，一份会话，一条固定的出站线路。"],
    research: ["接口研究", "用真实请求建立证据，再验证独立执行能力。"],
    tasks: ["请求与任务", "提交只读请求，查看每一页的进度和执行结果。"],
    settings: ["连接设置", "连接本机 RoxyBrowser 与 Clash 上游代理。"],
  };
  const ready = data.accounts.filter((a: any) => a.status === "ready").length;
  return (
    <div className="app">
      <aside>
        <div className="wordmark">
          <div className="logo-symbol">S</div>spider
        </div>
        <div className="workspace">API RESEARCH WORKSPACE</div>
        <nav>
          {(
            [
              ["overview", "◫", "工作台概览"],
              ["accounts", "◎", "账号与会话"],
              ["research", "⌘", "接口研究"],
              ["tasks", "↗", "请求与任务"],
              ["settings", "⚙", "连接设置"],
            ] as const
          ).map(([key, icon, name]) => (
            <button
              key={key}
              className={tab === key ? "active" : ""}
              onClick={() => {
                setTab(key);
                setError("");
                setNotice("");
              }}
            >
              <span>{icon}</span>
              {name}
              {key === "accounts" && <b>{data.accounts.length}</b>}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="dot" />
          本地服务已连接
          <div>
            {data.workers?.length
              ? "HTTP Worker · 正在运行"
              : "HTTP Worker 未运行 · 任务将等待"}
          </div>
          <small>spider / v0.1.0</small>
        </div>
      </aside>
      <main>
        <header>
          <div>
            <div className="eyebrow">SPIDER / {tab.toUpperCase()}</div>
            <h1>{headings[tab][0]}</h1>
            <p>{headings[tab][1]}</p>
          </div>
          <div className="local-tag">
            <span className="dot" />
            LOCAL ENVIRONMENT
          </div>
        </header>
        {error && !detail && !selectedTask && (
          <div role="alert" className="alert">
            {error}
            <button onClick={() => setError("")} aria-label="关闭错误">
              ×
            </button>
          </div>
        )}
        {notice && !detail && !selectedTask && (
          <div role="status" className="notice">
            {notice}
          </div>
        )}
        {tab === "overview" && (
          <>
            <section className="hero">
              <div className="eyebrow">OBSERVE. UNDERSTAND. EXECUTE.</div>
              <h2>
                让请求脱离浏览器，
                <br />
                让证据贯穿每一步。
              </h2>
              <p>
                RoxyBrowser 提取会话，独立 HTTP Worker 执行请求。
                <br />
                从账号到出口，保持可验证的身份与网络路径。
              </p>
              <button onClick={() => setTab("accounts")}>
                管理账号池 <span>↗</span>
              </button>
              <div className="hero-art" aria-hidden="true">
                <div className="orb one" />
                <div className="orb two" />
                <div className="orb three" />
                <div className="art-center">S</div>
              </div>
            </section>
            <section className="stats">
              <article>
                <span>账号会话</span>
                <strong>
                  {data.accounts.length}
                  <small> 个</small>
                </strong>
                <p>{ready} 个已通过独立请求验证</p>
              </article>
              <article>
                <span>等待处理</span>
                <strong>
                  {
                    data.tasks.filter((t: any) =>
                      ["queued", "running"].includes(t.status),
                    ).length
                  }
                </strong>
                <p>每账号串行 · 全局并发上限 20</p>
              </article>
              <article>
                <span>成功任务</span>
                <strong>
                  {
                    data.tasks.filter((t: any) => t.status === "succeeded")
                      .length
                  }
                </strong>
                <p>真实任务状态，不使用演示数据</p>
              </article>
              <article>
                <span>研究证据</span>
                <strong>{data.evidence.length}</strong>
                <p>原始请求与会话加密保存</p>
              </article>
            </section>
            <section className="panel">
              <div className="section-heading">
                <h2>请求路径</h2>
                <span className="muted">明确路由 · 禁止直连回退</span>
              </div>
              <div className="pipeline">
                {["HTTP Worker", "GOST", "Clash", "账号代理", "TikTok"].map(
                  (n, i) => (
                    <React.Fragment key={n}>
                      {i > 0 && <span className="arrow">→</span>}
                      <div>
                        <span>0{i + 1}</span>
                        <b>{n}</b>
                      </div>
                    </React.Fragment>
                  ),
                )}
              </div>
            </section>
            <section className="panel">
              <div className="section-heading">
                <h2>最近活动</h2>
                <button className="text" onClick={() => setTab("research")}>
                  全部证据 ↗
                </button>
              </div>
              {data.evidence.length ? (
                data.evidence.slice(0, 4).map((e: any) => (
                  <div className="activity" key={e.id}>
                    <span className="event-dot" />
                    <div>
                      <b>{e.summary}</b>
                      <small>
                        {e.kind} · {time(e.createdAt)}
                      </small>
                    </div>
                  </div>
                ))
              ) : (
                <Empty
                  title="从第一份会话开始"
                  text="连接 RoxyBrowser，选择已登录的 Profile 并提取会话。"
                  action={() => setTab("settings")}
                  actionText="配置连接"
                />
              )}
            </section>
          </>
        )}
        {tab === "accounts" && (
          <>
            <section className="panel">
              <div className="section-heading">
                <div>
                  <h2>RoxyBrowser Profiles</h2>
                  <p>
                    先在 RoxyBrowser 打开 TikTok
                    并完成登录，再提取对应平台会话。
                  </p>
                </div>
                <button
                  className="primary"
                  disabled={!!busy}
                  onClick={loadProfiles}
                >
                  {busy === "profiles" ? "读取中…" : "读取 Profiles"}
                </button>
              </div>
              {loadedProfiles &&
                (profiles.length ? (
                  <div className="profiles">
                    {profiles.map((p) => (
                      <div className="profile" key={p.id}>
                        <div className="avatar">R</div>
                        <div>
                          <b>{p.name}</b>
                          <small>Chromium {p.coreVersion ?? "—"}</small>
                        </div>
                        <button
                          disabled={!!busy}
                          onClick={() =>
                            act(p.id, async () => {
                              const r = await api(
                                `/roxy/profiles/${p.id}/extract`,
                                "POST",
                                {},
                              );
                              setNotice(
                                `已提取 ${r.account.label}。${r.warnings.join("；")}`,
                              );
                            })
                          }
                        >
                          {busy === p.id ? "提取中…" : "提取会话"}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty
                    title="此工作区没有 Profiles"
                    text="请检查连接设置中的工作区 ID。"
                  />
                ))}
            </section>
            <section className="panel">
              <div className="section-heading">
                <h2>
                  会话池 <small>{data.accounts.length}</small>
                </h2>
                <input
                  className="search"
                  placeholder="搜索账号、Profile 或备注"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="搜索账号"
                />
              </div>
              {data.accounts.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>账号</th>
                        <th>平台</th>
                        <th>状态</th>
                        <th>更新于</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.accounts
                        .filter((a: any) =>
                          [a.label, a.profileId, a.notes]
                            .join(" ")
                            .toLowerCase()
                            .includes(search.toLowerCase()),
                        )
                        .map((a: any) => (
                          <tr key={a.id}>
                            <td>
                              <b>{a.label}</b>
                              <small>
                                会话 v{a.version} · {a.profileId.slice(0, 10)}
                              </small>
                            </td>
                            <td>TikTok</td>
                            <td>
                              <Badge value={a.status} />
                            </td>
                            <td>{time(a.updatedAt)}</td>
                            <td>
                              <button
                                className="text"
                                onClick={(event) => {
                                  dialogTrigger.current = event.currentTarget;
                                  act(a.id, async () =>
                                    setDetail(await api(`/accounts/${a.id}`)),
                                  );
                                }}
                              >
                                详情与线路
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  {!data.accounts.some((a: any) =>
                    [a.label, a.profileId, a.notes]
                      .join(" ")
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                  ) && (
                    <Empty
                      title="没有匹配的账号"
                      text="试试账号名称或 Profile ID。"
                    />
                  )}
                </div>
              ) : (
                <Empty
                  title="会话池还是空的"
                  text="读取上方 Profiles，点击“提取会话”建立第一个账号。"
                />
              )}
            </section>
          </>
        )}
        {tab === "research" && (
          <>
            <SystemDiagnostics request={api} />
            <section className="research-card">
              <div className="platform-icon">♪</div>
              <div>
                <div className="eyebrow">PLATFORM ADAPTER</div>
                <h2>TikTok Web</h2>
                <p>视频详情 · 分页评论</p>
              </div>
              <Badge value="独立执行已实现" />
            </section>
            <div className="notice neutral">
              当前支持签名版本
              5.3.2。先采集账号样本，再提交独立请求验证；每个账号的实际验证状态见会话池。
            </div>
            <section className="panel">
              <h2>研究流程</h2>
              <div className="steps">
                {[
                  "捕获真实请求",
                  "分析动态参数",
                  "独立生成与重放",
                  "验证与版本发布",
                ].map((x, i) => (
                  <div key={x}>
                    <span>{i + 1}</span>
                    {x}
                  </div>
                ))}
              </div>
              <p className="help">
                研究命令：
                <code>
                  pnpm research capture &lt;profileId&gt; &lt;视频完整链接&gt;
                </code>
              </p>
            </section>
            <section className="panel">
              <h2>采集接口样本</h2>
              <p>
                连接已打开的 TikTok
                页面，读取视频详情和首屏评论，保存请求证据与最新会话。只在研究时使用浏览器。
              </p>
              <form
                className="task-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void act("prepare", async () => {
                    const r = await api(
                      `/accounts/${accountId}/prepare`,
                      "POST",
                      { video },
                    );
                    setNotice(
                      r.results
                        .map(
                          (x: any) =>
                            `${x.operation === "video.detail" ? "详情" : "评论"}：${x.captured ? "已采集" : "待分析"}`,
                        )
                        .join("；"),
                    );
                  });
                }}
              >
                <label>
                  研究账号
                  <select
                    required
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                  >
                    <option value="">选择账号</option>
                    {data.accounts
                      .filter((a: any) => a.status !== "disabled")
                      .map((a: any) => (
                        <option key={a.id} value={a.id}>
                          {a.label}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  公开视频链接
                  <input
                    required
                    value={video}
                    onChange={(e) => setVideo(e.target.value)}
                    placeholder="https://www.tiktok.com/@account/video/…"
                  />
                </label>
                <div className="form-action">
                  <button className="primary" disabled={!!busy}>
                    {busy === "prepare"
                      ? "正在采集，约需 10–30 秒…"
                      : "采集接口样本"}
                  </button>
                </div>
              </form>
            </section>
            <section className="panel">
              <div className="section-heading">
                <h2>证据记录</h2>
                <span className="muted">只展示摘要，原始内容加密保存</span>
              </div>
              {data.evidence.length ? (
                data.evidence.map((e: any) => (
                  <div className="activity" key={e.id}>
                    <span className="event-dot" />
                    <div>
                      <b>{e.summary}</b>
                      <small>
                        {e.kind} · {time(e.createdAt)} · {e.id.slice(0, 8)}
                      </small>
                    </div>
                  </div>
                ))
              ) : (
                <Empty
                  title="暂无研究证据"
                  text="会话提取、线路验证、请求采集和失败分析会记录在这里。"
                />
              )}
            </section>
          </>
        )}
        {tab === "tasks" && (
          <>
            <section className="panel">
              <div className="section-heading">
                <h2>新建只读请求</h2>
                <span className="muted">失败原因和已完成页会保留</span>
              </div>
              <form
                className="task-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void act("submit", async () => {
                    const t = await api("/tasks", "POST", {
                      accountId,
                      operation,
                      video,
                      maxPages: operation === "video.detail" ? 1 : maxPages,
                    });
                    setNotice(`任务已提交：${t.id.slice(0, 8)}`);
                  });
                }}
              >
                <label>
                  执行账号
                  <select
                    value={accountId}
                    required
                    onChange={(e) => setAccountId(e.target.value)}
                  >
                    <option value="">选择账号</option>
                    {data.accounts
                      .filter((a: any) => a.status !== "disabled")
                      .map((a: any) => (
                        <option key={a.id} value={a.id}>
                          {a.label} · {labels[a.status]}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  接口
                  <select
                    value={operation}
                    onChange={(e) => setOperation(e.target.value)}
                  >
                    <option value="video.detail">视频详情</option>
                    <option value="video.comments">分页评论</option>
                  </select>
                </label>
                <label className="wide">
                  视频链接或 ID
                  <input
                    required
                    value={video}
                    onChange={(e) => setVideo(e.target.value)}
                    placeholder="https://www.tiktok.com/@account/video/…"
                  />
                </label>
                {operation === "video.comments" && (
                  <label>
                    最多页数
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={maxPages}
                      onChange={(e) => setMaxPages(Number(e.target.value))}
                    />
                  </label>
                )}
                <div className="form-action">
                  <button className="primary" disabled={!!busy}>
                    提交请求 ↗
                  </button>
                </div>
              </form>
            </section>
            <section className="panel">
              <div className="section-heading">
                <h2>执行记录</h2>
                <span className="muted">最近 100 条</span>
              </div>
              {data.tasks.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>任务</th>
                        <th>接口</th>
                        <th>状态</th>
                        <th>已完成页</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.tasks.map((t: any) => (
                        <tr key={t.id}>
                          <td>
                            <b>{t.id.slice(0, 8)}</b>
                            <small>{time(t.createdAt)}</small>
                          </td>
                          <td>
                            {t.input.operation === "video.detail"
                              ? "视频详情"
                              : "分页评论"}
                          </td>
                          <td>
                            <Badge value={t.status} />
                          </td>
                          <td>{t.pages}</td>
                          <td>
                            <button
                              className="text"
                              onClick={(event) => {
                                dialogTrigger.current = event.currentTarget;
                                setSelectedTask(t);
                              }}
                            >
                              结果与排查
                            </button>
                            {["queued", "running"].includes(t.status) && (
                              <button
                                className="text danger"
                                disabled={!!busy}
                                onClick={() =>
                                  act(t.id, async () => {
                                    await api(
                                      `/tasks/${t.id}/cancel`,
                                      "POST",
                                      {},
                                    );
                                  })
                                }
                              >
                                取消
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty
                  title="还没有请求"
                  text="选取账号和视频，提交第一条只读任务。"
                />
              )}
            </section>
          </>
        )}
        {tab === "settings" && settings && (
          <section className="panel settings">
            <h2>本机连接</h2>
            <p>API Key 留空可保留已保存值；支持本机免 Key 的只读 OpenAPI。</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void act("settings", async () => {
                  const { hasApiKey, ...payload } = settings;
                  await api("/settings", "PUT", payload);
                  setNotice(
                    "连接设置已保存。已提取账号保留原线路，重新提取后应用新上游。",
                  );
                });
              }}
            >
              <label>
                RoxyBrowser API 地址
                <input
                  value={settings.host}
                  onChange={(e) =>
                    setSettings({ ...settings, host: e.target.value })
                  }
                />
              </label>
              <label>
                API Key
                <input
                  type="password"
                  value={settings.apiKey ?? ""}
                  placeholder={
                    settings.hasApiKey
                      ? "已保存；留空保留"
                      : "本机接口如需认证，请填写"
                  }
                  autoComplete="off"
                  onChange={(e) =>
                    setSettings({ ...settings, apiKey: e.target.value })
                  }
                />
              </label>
              <div className="field-row">
                <label>
                  工作区 ID
                  <input
                    value={settings.workspaceId}
                    onChange={(e) =>
                      setSettings({ ...settings, workspaceId: e.target.value })
                    }
                  />
                </label>
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() =>
                    act("workspaces", async () =>
                      setWorkspaces(await api("/roxy/workspaces")),
                    )
                  }
                >
                  读取工作区
                </button>
              </div>
              {workspaces.length > 0 && (
                <div className="chips">
                  {workspaces.map((w) => (
                    <button
                      type="button"
                      key={w.id}
                      onClick={() =>
                        setSettings({ ...settings, workspaceId: w.id })
                      }
                    >
                      {w.name} · {w.id}
                    </button>
                  ))}
                </div>
              )}
              <hr />
              <h3>Clash 上游代理</h3>
              <div className="fields-three">
                <label>
                  协议
                  <select
                    value={settings.upstream.protocol}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        upstream: {
                          ...settings.upstream,
                          protocol: e.target.value,
                        },
                      })
                    }
                  >
                    <option value="http">HTTP</option>
                    <option value="socks5">SOCKS5</option>
                    <option value="https">HTTPS</option>
                  </select>
                </label>
                <label>
                  地址
                  <input
                    value={settings.upstream.host}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        upstream: {
                          ...settings.upstream,
                          host: e.target.value,
                        },
                      })
                    }
                  />
                </label>
                <label>
                  端口
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={settings.upstream.port}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        upstream: {
                          ...settings.upstream,
                          port: Number(e.target.value),
                        },
                      })
                    }
                  />
                </label>
              </div>
              <button className="primary" disabled={!!busy}>
                保存连接设置
              </button>
            </form>
          </section>
        )}
        <footer>
          SPIDER <span>独立执行 · 证据驱动 · 本地优先</span>
          <a href="/api/openapi.json" target="_blank" rel="noreferrer">
            OpenAPI ↗
          </a>
        </footer>
      </main>
      {detail && (
        <div className="overlay" onClick={() => setDetail(null)}>
          <section
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-label="账号详情"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="section-heading">
              <h2>{detail.label}</h2>
              <button
                autoFocus
                aria-label="关闭详情"
                onClick={() => setDetail(null)}
              >
                ×
              </button>
            </div>
            <Badge value={detail.status} />
            {error && (
              <div role="alert" className="alert">
                {error}
              </div>
            )}
            {notice && (
              <div role="status" className="notice">
                {notice}
              </div>
            )}
            <p className="muted">{detail.reason || "账号会话详情"}</p>
            <dl>
              <dt>Cookie 数量</dt>
              <dd>{detail.cookieCount}（敏感值已隐藏）</dd>
              <dt>浏览器版本</dt>
              <dd>{detail.observed.browserVersion}</dd>
              <dt>时区</dt>
              <dd>{detail.observed.timezone}</dd>
              <dt>账号代理</dt>
              <dd>
                {detail.route
                  ? `${detail.route.account.protocol}://${detail.route.account.host}:${detail.route.account.port}`
                  : "未提取到代理"}
              </dd>
              <dt>线路验证</dt>
              <dd>
                {detail.route?.verifiedAt
                  ? time(detail.route.verifiedAt)
                  : "尚未验证出口一致性"}
              </dd>
            </dl>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void act("edit", async () => {
                  await api(`/accounts/${detail.id}`, "PATCH", {
                    label: detail.label,
                    notes: detail.notes,
                  });
                  setNotice("账号信息已更新");
                });
              }}
            >
              <label>
                账号别名
                <input
                  value={detail.label}
                  onChange={(e) =>
                    setDetail({ ...detail, label: e.target.value })
                  }
                />
              </label>
              <label>
                备注
                <textarea
                  value={detail.notes}
                  onChange={(e) =>
                    setDetail({ ...detail, notes: e.target.value })
                  }
                />
              </label>
              <button disabled={!!busy}>保存信息</button>
            </form>
            <div className="drawer-actions">
              <button
                className="primary"
                disabled={!!busy || detail.status === "disabled"}
                onClick={() =>
                  act("verify", async () => {
                    const r = await api(
                      `/accounts/${detail.id}/route/verify`,
                      "POST",
                      {},
                    );
                    setNotice(
                      r.match
                        ? "线路出口与 Profile 一致"
                        : `线路可达，但出口尚未与 Profile 基准匹配`,
                    );
                    setDetail(await api(`/accounts/${detail.id}`));
                  })
                }
              >
                {busy === "verify" ? "正在验证…" : "验证代理线路"}
              </button>
              <button
                disabled={!!busy}
                onClick={() =>
                  act("toggle", async () => {
                    await api(`/accounts/${detail.id}`, "PATCH", {
                      status:
                        detail.status === "disabled" ? "pending" : "disabled",
                    });
                    setDetail(await api(`/accounts/${detail.id}`));
                  })
                }
              >
                {detail.status === "disabled" ? "启用账号" : "禁用账号"}
              </button>
            </div>
            <p className="help">
              接口重新验证：在“请求与任务”提交真实视频请求，成功后账号自动标记为可用。
            </p>
          </section>
        </div>
      )}
      {selectedTask && (
        <div className="overlay" onClick={() => setSelectedTask(null)}>
          <section
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-label="任务结果"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="section-heading">
              <h2>任务结果</h2>
              <button
                autoFocus
                aria-label="关闭结果"
                onClick={() => setSelectedTask(null)}
              >
                ×
              </button>
            </div>
            <Badge value={selectedTask.status} />
            {selectedTask.error && (
              <div className="alert">
                {selectedTask.error.code}：{selectedTask.error.message}
              </div>
            )}
            <p>
              已完成 {selectedTask.pages} 页 · {time(selectedTask.updatedAt)}
            </p>
            <TaskDiagnostics taskId={selectedTask.id} request={api} />
            <pre>
              {JSON.stringify(
                selectedTask.result ?? { message: "暂无已完成结果" },
                null,
                2,
              )}
            </pre>
            <button
              onClick={() =>
                act("refresh-task", async () =>
                  setSelectedTask(await api(`/tasks/${selectedTask.id}`)),
                )
              }
            >
              刷新结果
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
function Empty({
  title,
  text,
  action,
  actionText,
}: {
  title: string;
  text: string;
  action?: () => void;
  actionText?: string;
}) {
  return (
    <div className="empty">
      <span>↗</span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action && <button onClick={action}>{actionText}</button>}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
