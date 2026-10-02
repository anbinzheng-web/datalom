import { NextResponse } from 'next/server';
import { findOperation } from '@/lib/api-catalog';
import { apiOrigin, userCookie } from '@/lib/console-server';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  const session = (await cookies()).get(userCookie)?.value ?? '';
  if (!session)
    return NextResponse.json(
      { error: { message: 'Sign in before sending a request' } },
      { status: 401 },
    );
  const body = (await request.json().catch(() => null)) as {
    id?: unknown;
    values?: unknown;
  } | null;
  const operation = typeof body?.id === 'string' ? findOperation(body.id)?.operation : undefined;
  if (!operation)
    return NextResponse.json(
      { error: { message: 'Endpoint is not in the catalog' } },
      { status: 400 },
    );
  const values = body?.values;
  if (!values || typeof values !== 'object' || Array.isArray(values))
    return NextResponse.json({ error: { message: 'Invalid parameter' } }, { status: 400 });
  const query: Record<string, string> = {};
  const payload: Record<string, string> = {};
  for (const param of operation.params) {
    const raw = (values as Record<string, unknown>)[param.name];
    if (raw === undefined || raw === '') continue;
    if (typeof raw !== 'string' || raw.length > 16000)
      return NextResponse.json(
        { error: { message: `Invalid parameter：${param.name}` } },
        { status: 400 },
      );
    if (param.in === 'body') payload[param.name] = raw;
    else query[param.name] = raw;
  }
  for (const name of operation.params
    .filter((param) => param.required)
    .map((param) => param.name)) {
    const present =
      operation.params.find((param) => param.name === name)?.in === 'body'
        ? payload[name]
        : query[name];
    if (!present)
      return NextResponse.json(
        { error: { message: `Missing parameter: ${name}` } },
        { status: 400 },
      );
  }
  if (operation.requireAny && !operation.requireAny.some((name) => query[name] || payload[name]))
    return NextResponse.json(
      { error: { message: `Provide at least one of: ${operation.requireAny.join('、')}` } },
      { status: 400 },
    );
  const upstream = await fetch(new URL('/api/docs/try', apiOrigin), {
    method: 'POST',
    headers: { 'x-datalom-session': session, 'content-type': 'application/json' },
    body: JSON.stringify({
      method: operation.method,
      path: operation.path,
      query,
      body: operation.method === 'POST' ? payload : undefined,
    }),
    cache: 'no-store',
  }).catch(() => undefined);
  if (!upstream)
    return NextResponse.json({ error: { message: 'Local API is not running' } }, { status: 503 });
  const result = await upstream
    .json()
    .catch(() => ({ error: { message: 'Unable to parse response' } }));
  return NextResponse.json(result, { status: upstream.ok ? 200 : upstream.status });
}
