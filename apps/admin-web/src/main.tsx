import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  ConfigProvider,
  Descriptions,
  Drawer,
  Form,
  Input,
  Layout,
  Menu,
  Modal,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
} from 'antd';
import zhCN from 'antd/locale/zh_CN';
import 'antd/dist/reset.css';
import './style.css';

const labels: Record<string, string> = {
  pending: 'Pending verification',
  ready: 'Available',
  cooldown: 'Cooldown',
  login_required: 'Login required',
  suspended: 'Account suspended',
  disabled: 'Disabled',
  queued: 'Queued',
  running: 'Running',
  succeeded: 'Succeeded',
  failed: 'Failed',
  cancelled: 'Cancelled',
};
async function api(path: string, method = 'GET', body?: unknown) {
  const r = await fetch('/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json();
  if (!r.ok)
    throw new Error(
      (j.error?.message ?? 'Request failed') +
        (j.diagnosticId ? ` (diagnostic event ${j.diagnosticId})` : ''),
    );
  return j;
}

const time = (value: number) => (value ? new Date(value).toLocaleString('zh-CN') : '—');
const badge = (value: string) => (
  <Tag
    color={
      value === 'ready' || value === 'succeeded' || value === 'valid'
        ? 'success'
        : value === 'failed' || value === 'login_required' || value === 'suspended'
          ? 'error'
          : 'default'
    }
  >
    {labels[value] ??
      ({ valid: 'Valid', unknown: 'Unknown' } as Record<string, string>)[value] ??
      value}
  </Tag>
);
function Console() {
  const { message } = AntApp.useApp();
  const [authed, setAuthed] = useState(false),
    [checking, setChecking] = useState(true);
  const [data, setData] = useState<any>({ accounts: [] });
  const [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    [search, setSearch] = useState('');
  const [detail, setDetail] = useState<any>(null);
  const [page, setPage] = useState('accounts');
  const [people, setPeople] = useState<{ users: any[]; emails: any[] }>({ users: [], emails: [] });
  const [platform, setPlatform] = useState<string>();
  const [selected, setSelected] = useState<React.Key[]>([]);
  const [batchResults, setBatchResults] = useState<any[] | null>(null);
  const [batchProgress, setBatchProgress] = useState('');

  const refresh = async () => {
    setData({ accounts: await api('/accounts') });
    setAuthed(true);
  };
  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError('');
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
      message.error((e as Error).message);
    } finally {
      setBusy('');
    }
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
  const openDetail = (id: string) =>
    act('detail', async () => {
      const d = await api(`/accounts/${id}`);
      setDetail(d);
    });
  const accounts = data.accounts.filter(
    (a: any) =>
      (!platform || a.platform === platform) &&
      [a.identity, a.browserNumber, a.profileId]
        .join(' ')
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const runBatch = async (kind: 'proxy' | 'session') => {
    const targets = accounts.filter((a: any) => selected.includes(a.id));
    if (!targets.length || busy) return;
    setBusy('batch');
    const results: any[] = [];
    setBatchResults([]);
    try {
      for (const [index, account] of targets.entries()) {
        setBatchProgress(`${index + 1} / ${targets.length}`);
        try {
          if (kind === 'proxy' && !account.proxy) throw new Error('Proxy not configured');
          if (kind === 'session' && account.platform !== 'tiktok')
            throw new Error('Session checks are not supported for this platform');
          const r = await api(`/accounts/${account.id}/${kind}/check`, 'POST', {});
          results.push({
            id: account.id,
            browser: account.browserNumber ?? account.profileId,
            result:
              kind === 'proxy'
                ? `Proxy available: ${r.ip}`
                : kind === 'session'
                  ? r.reason
                  : 'Settings saved',
          });
        } catch (e) {
          results.push({
            id: account.id,
            browser: account.browserNumber ?? account.profileId,
            result: (e as Error).message,
          });
        }
        setBatchResults([...results]);
      }
      await refresh();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy('');
      setBatchProgress('');
    }
  };
  const accountColumns = [
    { title: 'Browser ID', dataIndex: 'browserNumber', render: (v: string) => v || '—' },
    {
      title: 'Account',
      dataIndex: 'identity',
      render: (value: string) => value || 'Unknown',
    },
    { title: 'Platform', dataIndex: 'platform' },
    {
      title: 'Proxy IP / address',
      render: (_: unknown, a: any) =>
        a.proxy ? `${a.proxy.host}:${a.proxy.port}` : 'Not configured',
    },
    {
      title: 'Actions',
      render: (_: unknown, a: any) => (
        <Space>
          <Button onClick={() => openDetail(a.id)}>Details and routes</Button>
          <Button
            disabled={!a.proxy || !!busy || a.status === 'disabled'}
            loading={busy === `proxy-${a.id}`}
            onClick={() =>
              act(`proxy-${a.id}`, async () => {
                const result = await api(`/accounts/${a.id}/proxy/check`, 'POST', {});
                message.success(`Proxy available, exit IP: ${result.ip}`);
              })
            }
          >
            Check proxy
          </Button>
        </Space>
      ),
    },
  ];
  if (checking)
    return (
      <div className="login">
        <Spin tip="Connecting to backend">
          <div />
        </Spin>
      </div>
    );
  if (!authed)
    return (
      <div className="login">
        <Card title="Datalom Admin" style={{ width: 400 }}>
          <Form
            layout="vertical"
            onFinish={(v) =>
              act('login', async () => {
                await api('/auth', 'POST', v);
              })
            }
          >
            <Form.Item name="email" label="Email" rules={[{ required: true }]}>
              <Input autoComplete="username" placeholder="admin@datalom.com" />
            </Form.Item>
            <Form.Item name="password" label="Password" rules={[{ required: true }]}>
              <Input.Password autoComplete="current-password" />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={busy === 'login'} block>
              Sign in
            </Button>
          </Form>
          {error && <Alert type="error" title={error} />}
        </Card>
      </div>
    );
  return (
    <Layout className="console">
      <Layout.Sider breakpoint="lg" collapsedWidth={0} theme="light">
        <div className="brand">
          <img src="/favicon.svg" alt="" width="28" height="28" />
          <span>datalom</span>
        </div>
        <Menu
          selectedKeys={[page]}
          onClick={({ key }) => {
            setPage(key);
            if (key === 'people')
              act('people', async () => {
                const users = await api('/users');
                setPeople((current) => ({ ...current, users: users.users }));
              });
            if (key === 'whitelist')
              act('whitelist', async () => {
                const emails = await api('/whitelist');
                setPeople((current) => ({ ...current, emails: emails.emails }));
              });
          }}
          items={[
            { key: 'accounts', label: 'Session pool' },
            { key: 'people', label: 'UserAccount' },
            { key: 'whitelist', label: 'Email allowlist' },
          ]}
        />
      </Layout.Sider>
      <Layout>
        <Layout.Header className="header">
          <Typography.Title level={4}>
            {page === 'people'
              ? 'User accounts'
              : page === 'whitelist'
                ? 'Email allowlist'
                : 'Session pool'}
          </Typography.Title>
          <Tag>Internal admin</Tag>
        </Layout.Header>
        <Layout.Content className="content">
          {error && (
            <Alert type="error" title={error} closable onClose={() => setError('')} showIcon />
          )}
          {page === 'whitelist' && (
            <Card title="Allowed registration email domains">
              <Form
                layout="inline"
                onFinish={(values) =>
                  act('allow', async () => {
                    const emails = await api('/whitelist', 'POST', values);
                    setPeople((current) => ({ ...current, emails: emails.emails }));
                  })
                }
              >
                <Form.Item name="email" rules={[{ required: true }]}>
                  <Input placeholder="@163.com" aria-label="EmailDomain" />
                </Form.Item>
                <Button htmlType="submit" type="primary" loading={busy === 'allow'}>
                  Add domain
                </Button>
              </Form>
              <Table
                style={{ marginTop: 16 }}
                rowKey="email"
                dataSource={people.emails}
                pagination={false}
                columns={[
                  { title: 'Domain', dataIndex: 'email' },
                  {
                    title: '',
                    render: (_, row) => (
                      <Button
                        size="small"
                        onClick={() =>
                          act('remove-email', async () => {
                            const emails = await api('/whitelist/remove', 'POST', {
                              email: row.email,
                            });
                            setPeople((current) => ({ ...current, emails: emails.emails }));
                          })
                        }
                      >
                        Remove
                      </Button>
                    ),
                  },
                ]}
              />
            </Card>
          )}
          {page === 'people' && (
            <Card title="Registered users">
              <Table
                rowKey="id"
                dataSource={people.users}
                pagination={false}
                columns={[
                  { title: 'Email', dataIndex: 'email' },
                  { title: 'Name', dataIndex: 'name' },
                  {
                    title: 'Role',
                    dataIndex: 'role',
                    render: (value) => (value === 'admin' ? 'Admin' : 'User'),
                  },
                  { title: 'Sign-in methods', dataIndex: 'providers' },
                ]}
              />
            </Card>
          )}
          {page === 'accounts' && (
            <Card
              title="PlatformAccount"
              extra={
                <Space wrap>
                  <Select
                    aria-label="Filter platform"
                    placeholder="All platforms"
                    allowClear
                    disabled={!!busy}
                    value={platform}
                    style={{ minWidth: 140 }}
                    options={Array.from(
                      new Set<string>(data.accounts.map((a: any) => a.platform)),
                    ).map((value) => ({ value, label: value }))}
                    onChange={(value) => {
                      setPlatform(value);
                      setSelected([]);
                    }}
                  />
                  <Input.Search
                    allowClear
                    placeholder="Search accounts, IDs, or profiles"
                    value={search}
                    disabled={!!busy}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setSelected([]);
                    }}
                    style={{ width: 300 }}
                  />
                </Space>
              }
            >
              <Space wrap style={{ marginBottom: 16 }}>
                <Typography.Text>Selected {selected.length} accounts</Typography.Text>
                <Button disabled={!selected.length || !!busy} onClick={() => runBatch('proxy')}>
                  Check proxies in bulk
                </Button>
                <Button disabled={!selected.length || !!busy} onClick={() => runBatch('session')}>
                  Check sessions in bulk
                </Button>

                <Button disabled={!selected.length || !!busy} onClick={() => setSelected([])}>
                  Clear selection
                </Button>
              </Space>
              <Table
                rowKey="id"
                rowSelection={{
                  selectedRowKeys: selected,
                  onChange: setSelected,
                  getCheckboxProps: () => ({ disabled: !!busy }),
                }}
                dataSource={accounts}
                columns={accountColumns}
                scroll={{ x: 1100 }}
                pagination={{ pageSize: 10, showSizeChanger: true }}
              />
            </Card>
          )}
        </Layout.Content>
      </Layout>
      <Modal
        title={`Bulk operation results ${batchProgress}`}
        open={batchResults !== null}
        onCancel={() => setBatchResults(null)}
        footer={
          <Button onClick={() => setBatchResults(null)} disabled={busy === 'batch'}>
            Close
          </Button>
        }
        closable={busy !== 'batch'}
        maskClosable={busy !== 'batch'}
        keyboard={busy !== 'batch'}
      >
        <Table
          rowKey="id"
          dataSource={batchResults ?? []}
          columns={[
            { title: 'Browser ID', dataIndex: 'browser' },
            { title: 'Result', dataIndex: 'result' },
          ]}
          pagination={{ pageSize: 10 }}
        />
      </Modal>
      <Drawer
        title="Account details"
        size="min(100vw, max(720px, 55vw))"
        open={!!detail}
        onClose={() => setDetail(null)}
      >
        {detail && (
          <div className="detail-stack">
            <Descriptions
              styles={{
                label: { whiteSpace: 'nowrap' },
                content: { overflowWrap: 'anywhere', minWidth: 0 },
              }}
              column={1}
              bordered
              items={[
                { key: 'number', label: 'Browser ID', children: detail.browserNumber ?? '—' },
                { key: 'status', label: 'Request status', children: badge(detail.status) },
                {
                  key: 'session',
                  label: 'Login session',
                  children: (
                    <span>
                      {badge(detail.observed?.sessionCheck?.status ?? 'unknown')}
                      {detail.observed?.sessionCheck?.reason
                        ? ` · ${detail.observed.sessionCheck.reason}`
                        : ''}
                      {typeof detail.observed?.sessionCheck?.httpStatus === 'number'
                        ? ` · HTTP ${detail.observed.sessionCheck.httpStatus}`
                        : ''}
                    </span>
                  ),
                },
                { key: 'cookies', label: 'Cookie count', children: detail.cookieCount },
                {
                  key: 'browser',
                  label: 'Browser version',
                  children: detail.observed?.browserVersion,
                },
                { key: 'zone', label: 'Time zone', children: detail.observed?.timezone },
                {
                  key: 'route',
                  label: 'Proxy route',
                  children: detail.proxy
                    ? `${detail.proxy.protocol}://${detail.proxy.host}:${detail.proxy.port}`
                    : 'Not configured',
                },
                {
                  key: 'ua',
                  label: 'Browser UA',
                  children: detail.observed?.userAgent ?? 'Not extracted',
                },
                {
                  key: 'session-time',
                  label: 'Session check time',
                  children: time(detail.observed?.sessionCheck?.checkedAt),
                },
                {
                  key: 'verified',
                  label: 'Route verification',
                  children: time(detail.route?.verifiedAt),
                },
              ]}
            />

            <Space wrap>
              <Button
                type="primary"
                disabled={detail.status === 'disabled'}
                loading={busy === 'verify'}
                onClick={() =>
                  act('verify', async () => {
                    const r = await api(`/accounts/${detail.id}/route/verify`, 'POST', {});
                    message.info(r.match ? 'Exit matches profile' : 'Exit does not match profile');
                    setDetail(await api(`/accounts/${detail.id}`));
                  })
                }
              >
                Verify proxy route
              </Button>
              <Button
                loading={busy === 'session-check'}
                disabled={!!busy}
                onClick={() =>
                  act('session-check', async () => {
                    const r = await api(`/accounts/${detail.id}/session/check`, 'POST', {});
                    message.info(r.reason);
                    setDetail(await api(`/accounts/${detail.id}`));
                  })
                }
              >
                Check session
              </Button>
            </Space>
          </div>
        )}
      </Drawer>
    </Layout>
  );
}
createRoot(document.getElementById('root')!).render(
  <ConfigProvider locale={zhCN}>
    <AntApp>
      <Console />
    </AntApp>
  </ConfigProvider>,
);
