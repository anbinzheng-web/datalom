import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { apiOrigin } from './console-server';

export const providers = ['google', 'github'] as const;
export type Provider = (typeof providers)[number];

const stateCookie = 'datalom_oauth';

export function isProvider(value: string): value is Provider {
  return value === 'google' || value === 'github';
}

export function providerConfigured(provider: Provider) {
  return provider === 'google'
    ? Boolean(process.env.DATALOM_GOOGLE_CLIENT_ID && process.env.DATALOM_GOOGLE_CLIENT_SECRET)
    : Boolean(process.env.DATALOM_GITHUB_CLIENT_ID && process.env.DATALOM_GITHUB_CLIENT_SECRET);
}

export function authOrigin() {
  return process.env.DATALOM_AUTH_ORIGIN ?? 'http://127.0.0.1:4320';
}

export async function beginOAuth(provider: Provider) {
  if (!providerConfigured(provider))
    return NextResponse.redirect(new URL('/login?error=provider', authOrigin()));
  const state = randomBytes(24).toString('base64url');
  const redirectUri = `${authOrigin()}/api/auth/${provider}/callback`;
  const url =
    provider === 'google'
      ? new URL('https://accounts.google.com/o/oauth2/v2/auth')
      : new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set(
    'client_id',
    provider === 'google'
      ? process.env.DATALOM_GOOGLE_CLIENT_ID!
      : process.env.DATALOM_GITHUB_CLIENT_ID!,
  );
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set(
    'scope',
    provider === 'google' ? 'openid email profile' : 'read:user user:email',
  );
  if (provider === 'google') url.searchParams.set('response_type', 'code');
  const response = NextResponse.redirect(url);
  response.cookies.set(stateCookie, state, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return response;
}

export async function finishOAuth(provider: Provider, request: Request) {
  const current = new URL(request.url);
  const code = current.searchParams.get('code') ?? '';
  const state = current.searchParams.get('state') ?? '';
  const expected = (await cookies()).get(stateCookie)?.value ?? '';
  if (!code || !state || state !== expected)
    return NextResponse.redirect(new URL('/login?error=state', authOrigin()));
  try {
    const profile = await providerProfile(provider, code);
    const created = await fetch(new URL('/api/auth/complete', apiOrigin), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider, ...profile }),
      cache: 'no-store',
    });
    const body = await created.json().catch(() => ({}));
    if (!created.ok) {
      const reason = created.status === 403 ? 'whitelist' : 'failed';
      return NextResponse.redirect(new URL(`/login?error=${reason}`, authOrigin()));
    }
    const response = NextResponse.redirect(new URL('/account', authOrigin()));
    response.cookies.set('datalom_user', body.sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 14,
    });
    response.cookies.delete(stateCookie);
    return response;
  } catch {
    return NextResponse.redirect(new URL('/login?error=failed', authOrigin()));
  }
}

async function providerProfile(provider: Provider, code: string) {
  const redirectUri = `${authOrigin()}/api/auth/${provider}/callback`;
  if (provider === 'google') {
    const token = await postForm('https://oauth2.googleapis.com/token', {
      code,
      client_id: process.env.DATALOM_GOOGLE_CLIENT_ID!,
      client_secret: process.env.DATALOM_GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });
    const profile = await getJson(
      'https://openidconnect.googleapis.com/v1/userinfo',
      token.access_token,
    );
    if (!profile.email || profile.email_verified === false) throw new Error('email');
    return {
      subject: String(profile.sub),
      email: String(profile.email),
      name: String(profile.name ?? ''),
      avatarUrl: String(profile.picture ?? ''),
    };
  }
  const token = await postForm('https://github.com/login/oauth/access_token', {
    code,
    client_id: process.env.DATALOM_GITHUB_CLIENT_ID!,
    client_secret: process.env.DATALOM_GITHUB_CLIENT_SECRET!,
    redirect_uri: redirectUri,
  });
  const profile = await getJson('https://api.github.com/user', token.access_token);
  const emails = (await getJson('https://api.github.com/user/emails', token.access_token)) as {
    email?: string;
    primary?: boolean;
    verified?: boolean;
  }[];
  const email =
    emails.find((item) => item.primary && item.verified)?.email ??
    emails.find((item) => item.verified)?.email;
  if (!email) throw new Error('email');
  return {
    subject: String(profile.id),
    email,
    name: String(profile.name ?? profile.login ?? ''),
    avatarUrl: String(profile.avatar_url ?? ''),
  };
}

async function postForm(url: string, body: Record<string, string>) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  const json = (await response.json()) as { access_token?: string };
  if (!response.ok || !json.access_token) throw new Error('token');
  return { access_token: json.access_token };
}

async function getJson(url: string, token: string) {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
      'user-agent': 'datalom',
    },
  });
  if (!response.ok) throw new Error('profile');
  return (await response.json()) as Record<string, any>;
}
