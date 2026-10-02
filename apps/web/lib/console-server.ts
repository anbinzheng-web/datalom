import { cookies } from 'next/headers';

export const userCookie = 'datalom_user';
export const apiOrigin = process.env.DATALOM_API_ORIGIN ?? 'http://127.0.0.1:4317';

export async function currentSession() {
  const id = (await cookies()).get(userCookie)?.value ?? '';
  if (!id) return null;
  const response = await fetch(
    new URL(`/api/auth/session?id=${encodeURIComponent(id)}`, apiOrigin),
    {
      cache: 'no-store',
    },
  ).catch(() => undefined);
  const body = await response?.json().catch(() => ({ user: null }));
  return body?.user ?? null;
}
