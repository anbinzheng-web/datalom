'use client';
import { Button, ButtonLink, Form, Input, Message, Table, Textarea } from './ui';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PlatformIcon } from './platform-icon';
import {
  apiCatalog,
  apiOperations,
  findOperation,
  operationHeaders,
  type ApiOperation,
} from '@/lib/api-catalog';
import { errorFields, flattenFields, responseFields } from '@/lib/api-response';

export function ApiConsole() {
  const contentScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = contentScrollRef.current;
    if (!container) return;
    const update = () => {
      container.style.setProperty(
        '--scrollbar-space',
        container.offsetWidth - container.clientWidth + 'px',
      );
    };
    const observer = new ResizeObserver(update);
    observer.observe(container);
    if (container.firstElementChild) observer.observe(container.firstElementChild);
    update();
    return () => observer.disconnect();
  }, []);
  const router = useRouter();
  const params = useSearchParams();
  const current = findOperation(params.get('op') ?? '') ?? apiOperations[0];
  const selected = current.operation;
  const [authenticated, setAuthenticated] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ status: number; body: unknown; ms: number } | null>(null);
  const [tab, setTab] = useState<'query' | 'headers' | 'body'>('query');
  const [open, setOpen] = useState<Set<string>>(() => new Set([current.platform.id]));
  const [query, setQuery] = useState('');
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [responseView, setResponseView] = useState<'schema' | 'result'>('schema');
  const [schemaKind, setSchemaKind] = useState<'success' | 'error'>('success');

  useEffect(() => {
    void fetch('/api/console/session')
      .then((response) => response.json())
      .then((body: { authenticated?: boolean }) => setAuthenticated(Boolean(body.authenticated)))
      .catch(() => setAuthenticated(false));
  }, []);

  useEffect(() => {
    setCopyStatus('');
    setValues({});
    setResult(null);
    setResponseView('schema');
    setError('');
    setTab(selected.method === 'POST' ? 'body' : 'query');
    setOpen((previous) => {
      const next = new Set(previous);
      next.add(current.platform.id);
      return next;
    });
  }, [selected.id, selected.method, current.platform.id]);

  useEffect(() => {
    if (copyStatus !== 'Copied') return;
    const timer = window.setTimeout(() => setCopyStatus(''), 2000);
    return () => window.clearTimeout(timer);
  }, [copyStatus]);

  function toggle(key: string) {
    setOpen((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const missing = useMemo(() => missingParameters(selected, values), [selected, values]);
  const needle = query.trim().toLowerCase();
  const listed = apiCatalog
    .map((platform) => ({
      platform,
      operations: platform.groups
        .flatMap((group) => group.operations)
        .filter((operation) =>
          !needle
            ? true
            : `${platform.title} ${operation.title} ${operation.path} ${operation.summary}`
                .toLowerCase()
                .includes(needle),
        ),
    }))
    .filter((item) => item.operations.length);

  function choose(id: string) {
    const next = new URLSearchParams(params);
    next.set('op', id);
    setCatalogOpen(false);
    router.replace(`/docs/api?${next}`, { scroll: false });
  }

  async function copyPath() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(selected.path);
      } else {
        const previousFocus = document.activeElement;
        const input = document.createElement('textarea');
        input.value = selected.path;
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.append(input);
        try {
          input.select();
          if (!document.execCommand('copy')) throw new Error('Copy failed');
        } finally {
          input.remove();
          if (previousFocus instanceof HTMLElement) previousFocus.focus();
        }
      }
      setCopyStatus('Copied');
    } catch {
      setCopyStatus('Copy failed; copy the path manually');
    }
  }

  async function logout() {
    await fetch('/api/console/session', { method: 'DELETE' });
    setAuthenticated(false);
  }

  async function send() {
    if (!authenticated) {
      router.push('/login');
      return;
    }
    if (missing) {
      setError(missing);
      return;
    }
    setBusy(true);
    setError('');
    const started = performance.now();
    try {
      const response = await fetch('/api/console/try', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: selected.id, values }),
      });
      const body = await response.json();
      if (response.status === 401) setAuthenticated(false);
      const message = body.error?.message;
      if (message) setError(message);
      setResponseView('result');
      setResult({
        status: typeof body.status === 'number' ? body.status : response.status,
        body: body.body ?? body,
        ms: Math.round(performance.now() - started),
      });
    } catch (cause) {
      setResult(null);
      setError(cause instanceof Error ? cause.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={
        'api-console grid grid-cols-[280px_minmax(0,1fr)] pl-[max(0px,calc((100%_-_1600px)/2))] h-[calc(100dvh_-_var(--header-height))] overflow-hidden bg-paper max-[1100px]:grid-cols-[248px_minmax(0,1fr)] max-[761px]:flex max-[761px]:flex-col'
      }
    >
      <div
        className={
          'api-mobile-toolbar shrink-0 hidden max-[761px]:flex max-[761px]:items-center max-[761px]:justify-between max-[761px]:py-3 max-[761px]:px-4 max-[761px]:bg-surface  max-[761px]:text-[13px] max-[761px]:font-medium'
        }
      >
        <span>API Reference</span>
        <Button
          variant="secondary"
          size="sm"
          aria-expanded={catalogOpen}
          aria-controls="api-catalog"
          onClick={() => setCatalogOpen(!catalogOpen)}
        >
          {catalogOpen ? 'Hide catalog' : 'API catalog'}
        </Button>
      </div>
      <aside
        id="api-catalog"
        className={
          'api-nav relative z-10 flex min-h-0 h-full shrink-0 flex-col overflow-hidden bg-surface shadow-[var(--shadow-md)] max-[761px]:hidden max-[761px]:h-auto max-[761px]:max-h-[55dvh] max-[761px]:[&.is-open]:flex' +
          (catalogOpen ? ' is-open' : '')
        }
        aria-label="API catalog"
      >
        <div className="shrink-0 px-4 pt-6 pb-5 max-[761px]:pt-4">
          <div
            className={
              'api-nav-heading flex justify-between items-center gap-y-2 gap-x-2 mb-5 [&_strong]:text-[14px] [&_strong]:font-medium [&_>_span]:text-[11px] [&_>_span]:text-muted'
            }
          >
            <strong>API Reference</strong>
            <span>{apiOperations.length} endpoints</span>
          </div>
          <div className="relative">
            <Input
              size="md"
              type="search"
              className="pr-9"
              value={query}
              placeholder="Search endpoints or paths"
              aria-label="Search endpoints"
              onChange={(event) => setQuery(event.target.value)}
            />
            <svg
              className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              aria-hidden="true"
              focusable="false"
            >
              <circle cx="10.5" cy="10.5" r="6.5" />
              <path d="m16 16 4 4" />
            </svg>
          </div>
        </div>
        <div className="api-nav-groups min-h-0 overflow-y-auto overscroll-contain grid content-start gap-3 px-4 pb-6 [scrollbar-width:thin]">
          {listed.map(({ platform, operations }) => {
            const platformOpen = Boolean(needle) || open.has(platform.id);
            return (
              <section key={platform.id}>
                <Button
                  variant="quiet"
                  size="sm"
                  className={
                    'api-fold [.api-nav_&]:w-full [.api-nav_&]:justify-start [.api-nav_&]:text-left [&_em]:ml-auto [&_em]:[font-style:normal] [&_em]:text-muted [&_em]:text-[11px]'
                  }
                  aria-expanded={platformOpen}
                  aria-controls={'api-group-' + platform.id}
                  onClick={() => toggle(platform.id)}
                >
                  <PlatformIcon platform={platform.id} />
                  <span>{platform.title}</span>
                  <em>{operations.length}</em>
                  <span className={'api-chevron text-muted w-[12px]'} aria-hidden="true">
                    {platformOpen ? '−' : '+'}
                  </span>
                </Button>
                <div
                  id={'api-group-' + platform.id}
                  hidden={!platformOpen}
                  className={'api-operation-list py-1 pr-0 pl-2 grid gap-y-1 gap-x-1'}
                >
                  {operations.map((operation) => (
                    <Button
                      variant="quiet"
                      size="sm"
                      key={operation.id}
                      className={
                        'api-op [.api-nav_&]:w-full [.api-nav_&]:text-left [.api-nav_&]:justify-start [.api-nav_&]:font-normal [.api-nav_&.active]:[background:var(--green-soft)] [.api-nav_&.active]:text-brand     [.api-nav_&.active]:font-medium' +
                        (operation.id === selected.id ? ' active' : '')
                      }
                      aria-current={operation.id === selected.id ? 'page' : undefined}
                      onClick={() => choose(operation.id)}
                    >
                      <span
                        className={
                          'api-method inline-flex items-center justify-center shrink-0 min-w-[36px] p-1 font-mono text-[10px] font-medium leading-[1.2] rounded-[var(--radius-sm)] text-[var(--method-get-text)] bg-[var(--method-get-bg)] [&.api-method-post]:[color:var(--blue)] [&.api-method-post]:[background:var(--blue-soft)] api-method-' +
                          operation.method.toLowerCase()
                        }
                      >
                        {operation.method}
                      </span>
                      <span>{operation.title}</span>
                    </Button>
                  ))}
                </div>
              </section>
            );
          })}
          {needle && !listed.length && (
            <p className={'api-empty text-muted text-[12px] leading-[1.7]'}>
              No matching endpoints
            </p>
          )}
        </div>
      </aside>
      <section
        className={
          'api-panel relative z-0 flex min-h-0 min-w-0 flex-col overflow-hidden max-[761px]:flex-1'
        }
        aria-label="API panel"
      >
        <header
          className={
            'api-operation-heading shrink-0 bg-paper pt-8 pb-6 pl-8 pr-[max(32px,calc((100vw_-_1600px)/2))] max-[1200px]:px-6 max-[761px]:pt-6 max-[761px]:px-4'
          }
        >
          <div
            className={'api-operation-context flex flex-wrap items-center gap-2 text-sm text-muted'}
          >
            <PlatformIcon platform={current.platform.id} />
            <span>{current.platform.title}</span>
            <span aria-hidden="true">/</span>
            <h1 className="m-0 text-sm font-medium leading-normal text-ink">{selected.title}</h1>
          </div>
          <div className={'api-endpoint flex flex-wrap items-center gap-3 mt-4 min-w-0'}>
            <div className="flex min-w-0 flex-1 items-center gap-3 h-11 rounded-[var(--radius-md)] shadow-[var(--shadow-md)] bg-surface px-3 py-2 max-[761px]:basis-full">
              <span
                className={
                  'api-method inline-flex items-center justify-center shrink-0 min-w-[36px] p-1 font-mono text-[10px] font-medium leading-[1.2] rounded-[var(--radius-sm)] text-[var(--method-get-text)] bg-[var(--method-get-bg)] [&.api-method-post]:[color:var(--blue)] [&.api-method-post]:[background:var(--blue-soft)] api-method-' +
                  selected.method.toLowerCase()
                }
              >
                {selected.method}
              </span>
              <code className="min-w-0 text-[13px] leading-[1.6] text-ink [overflow-wrap:anywhere]">
                {selected.path}
              </code>
              <Button
                variant="quiet"
                size="xs"
                className={
                  'w-7 [&.ui-button]:px-0 ' +
                  (copyStatus === 'Copied'
                    ? '[&.ui-button]:bg-brand/10 [&.ui-button]:text-[var(--teal)] [&.ui-button:hover]:bg-brand/15'
                    : '[&.ui-button]:bg-brand/10 [&.ui-button]:text-brand [&.ui-button:hover]:bg-brand/15')
                }
                aria-label="Copy request path"
                title={copyStatus === 'Copied' ? 'Copied' : 'Copy request path'}
                onClick={() => void copyPath()}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden="true"
                >
                  {copyStatus === 'Copied' ? (
                    <path d="m5 12 4 4L19 6" strokeLinecap="round" strokeLinejoin="round" />
                  ) : (
                    <>
                      <rect x="8" y="8" width="12" height="12" rx="2" />
                      <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
                    </>
                  )}
                </svg>
              </Button>
            </div>
            <span
              role="status"
              className={copyStatus === 'Copied' ? 'sr-only' : 'text-xs text-muted empty:hidden'}
            >
              {copyStatus}
            </span>
            <div className="ml-auto flex items-center gap-2 max-[761px]:w-full">
              {!authenticated ? (
                <ButtonLink href="/login" size="xl" className="w-[120px] max-[761px]:w-full">
                  Send
                </ButtonLink>
              ) : (
                <>
                  <Button variant="quiet" size="xl" onClick={() => void logout()}>
                    Sign out
                  </Button>
                  <Button
                    type="submit"
                    form="api-parameter-form"
                    size="xl"
                    loading={busy}
                    className="w-[120px] max-[761px]:w-full"
                  >
                    {busy ? 'Sending' : 'Send'}
                  </Button>
                </>
              )}
            </div>
          </div>
        </header>
        <div
          ref={contentScrollRef}
          className="api-content-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain pl-8 [--content-inset:max(32px,calc((100vw_-_1600px)/2))] pr-[max(0px,calc(var(--content-inset)_-_var(--scrollbar-space,0px)))] pb-12 max-[1200px]:pl-6 max-[1200px]:[--content-inset:24px] max-[761px]:pl-4 max-[761px]:[--content-inset:16px] max-[761px]:pb-10"
        >
          <div className={'api-workspace grid grid-cols-1 items-start gap-5'}>
            <section
              className={
                'api-request api-surface min-w-0 overflow-hidden rounded-[var(--radius-md)] bg-surface shadow-[var(--shadow-md)]'
              }
              aria-labelledby="api-request-title"
            >
              <div
                className={
                  'api-surface-heading flex items-center justify-between gap-y-3 gap-x-3 py-4 px-5 max-[761px]:px-4 border-b border-[#eef0f4] [&_h2]:text-[15px] [&_h2]:font-medium [&_h2]:m-0 [&_>_span]:[font:11px/1.5_ui-monospace,_monospace] [&_>_span]:text-muted'
                }
              >
                <h2 id="api-request-title">Request</h2>
                <span>{selected.method === 'POST' ? 'JSON' : 'Query string'}</span>
              </div>
              <div
                className={
                  'api-segments flex flex-wrap gap-y-1 gap-x-1 py-3 px-5 max-[761px]:px-4 '
                }
                role="group"
                aria-label="Request options"
              >
                {selected.params.some((param) => param.in === 'query') && (
                  <Button
                    variant="quiet"
                    size="sm"
                    aria-pressed={tab === 'query'}
                    onClick={() => setTab('query')}
                  >
                    Query
                  </Button>
                )}
                {selected.params.some((param) => param.in === 'body') && (
                  <Button
                    variant="quiet"
                    size="sm"
                    aria-pressed={tab === 'body'}
                    onClick={() => setTab('body')}
                  >
                    Body
                  </Button>
                )}
                <Button
                  variant="quiet"
                  size="sm"
                  aria-pressed={tab === 'headers'}
                  onClick={() => setTab('headers')}
                >
                  Headers
                </Button>
              </div>
              <Form
                id="api-parameter-form"
                className={'api-parameter-form p-0 gap-5'}
                onSubmit={(event) => {
                  event.preventDefault();
                  void send();
                }}
              >
                <div className="min-w-0 overflow-x-auto">
                  <Table
                    className="min-w-[680px] table-fixed text-[13px]"
                    aria-label="Request parameters"
                  >
                    <colgroup>
                      <col className="w-[22%]" />
                      <col className="w-[34%]" />
                      <col className="w-[12%]" />
                      <col className="w-[32%]" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th scope="col">{tab === 'headers' ? 'Header' : 'Parameter'}</th>
                        <th scope="col">Value</th>
                        <th scope="col">Type</th>
                        <th scope="col">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tab === 'headers'
                        ? operationHeaders(selected).map((header) => (
                            <tr key={header.name}>
                              <td>
                                <code>{header.name}</code>
                                {header.required && (
                                  <span className="ml-2 text-[11px] text-danger">Required</span>
                                )}
                              </td>
                              <td>
                                <code>{header.value}</code>
                              </td>
                              <td className="font-mono text-xs text-muted">string</td>
                              <td className="text-muted">{header.description}</td>
                            </tr>
                          ))
                        : selected.params
                            .filter((param) => param.in === (tab === 'body' ? 'body' : 'query'))
                            .map((param) => (
                              <tr key={selected.id + param.name}>
                                <td>
                                  <label htmlFor={'api-param-' + param.name}>
                                    <code>{param.name}</code>
                                  </label>
                                  {param.required && (
                                    <span className="ml-2 text-[11px] text-danger">Required</span>
                                  )}
                                </td>
                                <td>
                                  {param.name === 'prompt' ? (
                                    <Textarea
                                      id={'api-param-' + param.name}
                                      aria-describedby={'api-hint-' + param.name}
                                      value={values[param.name] ?? ''}
                                      placeholder={param.placeholder ?? param.example ?? ''}
                                      onChange={(event) =>
                                        setValues({ ...values, [param.name]: event.target.value })
                                      }
                                    />
                                  ) : (
                                    <Input
                                      id={'api-param-' + param.name}
                                      aria-describedby={'api-hint-' + param.name}
                                      size="sm"
                                      value={values[param.name] ?? ''}
                                      inputMode={param.type === 'integer' ? 'numeric' : 'text'}
                                      placeholder={param.placeholder ?? param.example ?? ''}
                                      onChange={(event) =>
                                        setValues({ ...values, [param.name]: event.target.value })
                                      }
                                    />
                                  )}
                                </td>
                                <td className="font-mono text-xs text-muted">{param.type}</td>
                                <td id={'api-hint-' + param.name} className="text-muted">
                                  {param.description}
                                </td>
                              </tr>
                            ))}
                      {tab !== 'headers' &&
                        !selected.params.some(
                          (param) => param.in === (tab === 'body' ? 'body' : 'query'),
                        ) && (
                          <tr>
                            <td colSpan={4} className="text-muted">
                              This endpoint has no parameters.
                            </td>
                          </tr>
                        )}
                    </tbody>
                  </Table>
                </div>
                {error && <Message tone="error">{error}</Message>}
              </Form>
            </section>
            <section
              className={
                'api-response api-surface flex min-w-0 flex-col overflow-hidden  rounded-[var(--radius-md)] bg-surface shadow-[var(--shadow-md)]'
              }
              aria-labelledby="api-response-title"
            >
              <div
                className={
                  'api-surface-heading flex items-center justify-between gap-y-3 gap-x-3 py-4 px-5 max-[761px]:px-4 border-b border-[#eef0f4] [&_h2]:text-[15px] [&_h2]:font-medium [&_h2]:m-0 [&_>_span]:[font:11px/1.5_ui-monospace,_monospace] [&_>_span]:text-muted'
                }
              >
                <h2 id="api-response-title">Response</h2>
                <span>
                  {result && responseView === 'result'
                    ? result.status + ' · ' + result.ms + ' ms'
                    : 'Schema'}
                </span>
              </div>
              <div
                className={
                  'api-segments flex flex-wrap gap-y-1 gap-x-1 py-3 px-5 max-[761px]:px-4 '
                }
                role="group"
                aria-label="Response view"
              >
                <Button
                  variant="quiet"
                  size="sm"
                  aria-pressed={responseView === 'schema' && schemaKind === 'success'}
                  onClick={() => {
                    setResponseView('schema');
                    setSchemaKind('success');
                  }}
                >
                  Success schema
                </Button>
                <Button
                  variant="quiet"
                  size="sm"
                  aria-pressed={responseView === 'schema' && schemaKind === 'error'}
                  onClick={() => {
                    setResponseView('schema');
                    setSchemaKind('error');
                  }}
                >
                  Error schema
                </Button>
                <Button
                  variant="quiet"
                  size="sm"
                  aria-pressed={responseView === 'result'}
                  onClick={() => setResponseView('result')}
                >
                  Response
                </Button>
              </div>
              {responseView === 'result' ? (
                result ? (
                  <div
                    className={
                      'api-result [&_pre]:[background:var(--code-bg)] [&_pre]:[color:var(--code-text)] [&_pre]:p-6 [&_pre]:[font:12px/1.8_ui-monospace,_monospace] [&_pre]:overflow-auto [&_pre]:m-0 [&_pre]:rounded-[0_0_var(--radius-md)_var(--radius-md)]'
                    }
                  >
                    <div
                      className={
                        'api-result-status py-4 px-6 [font:12px/1.5_ui-monospace,_monospace] text-muted'
                      }
                      role="status"
                    >
                      HTTP {result.status} · {result.ms} ms
                    </div>
                    <pre tabIndex={0} aria-label="JSON response">
                      {JSON.stringify(result.body, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <div
                    className={
                      'api-result-empty min-h-[260px] flex flex-col justify-center items-center text-center p-8 gap-y-3 gap-x-3 [&_>_span]:text-line-strong [&_>_span]:[font:32px/1.2_ui-monospace,_monospace] [&_h3]:text-[14px] [&_h3]:font-medium [&_p]:text-[12px] [&_p]:leading-[1.7] [&_p]:text-muted [&_p]:max-w-[260px]'
                    }
                  >
                    <span aria-hidden="true">{'{ }'}</span>
                    <h3>No request sent</h3>
                    <p>
                      Fill in the parameters and send a request to view the status code and JSON
                      response.
                    </p>
                  </div>
                )
              ) : (
                <>
                  <div
                    className={
                      'api-schema overflow-x-auto [&_td:nth-child(2)]:text-brand [&_td:nth-child(2)]:whitespace-nowrap [&_td:last-child]:text-muted focus-visible:outline-3 focus-visible:outline-brand'
                    }
                    tabIndex={0}
                    role="region"
                    aria-label={
                      schemaKind === 'success' ? 'Success response fields' : 'Error response fields'
                    }
                  >
                    <Table
                      className="min-w-[560px] table-fixed text-xs [&_th]:text-[13px] [&_td]:leading-[1.6]"
                      aria-label="Response schema"
                    >
                      <colgroup>
                        <col className={'api-schema-name w-[43%] max-[761px]:w-[42%]'} />
                        <col className={'api-schema-type w-[18%] max-[761px]:w-[21%]'} />
                        <col />
                      </colgroup>
                      <thead>
                        <tr>
                          <th scope="col">Field</th>
                          <th scope="col">Type</th>
                          <th scope="col">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {flattenFields(
                          schemaKind === 'success' ? responseFields(selected) : errorFields(),
                        ).map(({ field, depth, path }) => (
                          <tr key={path}>
                            <td>
                              <code
                                className={
                                  'api-field-path block relative pl-[calc(var(--field-depth)_*_var(--space-3))] text-[12px]'
                                }
                                title={path}
                                style={{ '--field-depth': depth } as CSSProperties}
                              >
                                {depth > 0 && (
                                  <span
                                    aria-hidden="true"
                                    className={
                                      'api-tree-line absolute left-[calc((var(--field-depth)_-_1)_*_var(--space-3))] top-[4px] h-[10px] w-[6px] [border-left:var(--border)] [border-bottom:var(--border)] '
                                    }
                                  />
                                )}
                                {field.name}
                              </code>
                            </td>
                            <td>
                              <span
                                className={
                                  'api-type [color:var(--blue)] [font:11px/1.6_ui-monospace,_monospace]'
                                }
                              >
                                {field.type}
                              </span>
                            </td>
                            <td>{field.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                  {schemaKind === 'error' && (
                    <p
                      className={
                        'api-schema-note text-muted text-[12px] leading-[1.7] py-4 px-6  m-0'
                      }
                    >
                      Error responses use the error field instead of data.
                    </p>
                  )}
                </>
              )}
            </section>
          </div>
        </div>
      </section>
    </div>
  );
}

function missingParameters(operation: ApiOperation, values: Record<string, string>) {
  for (const param of operation.params)
    if (param.required && !values[param.name]?.trim()) return `Missing parameter: ${param.name}`;
  if (operation.requireAny && !operation.requireAny.some((name) => values[name]?.trim()))
    return `Provide at least one of: ${operation.requireAny.join(', ')}`;
  return '';
}
