import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { apiOrigin } from '@/lib/console-server';

export async function GET() {
  const id = (await cookies()).get('datalom_user')?.value ?? '';
  if (!id) return NextResponse.json({ user: null });
  const response = await fetch(
    new URL(`/api/auth/session?id=${encodeURIComponent(id)}`, apiOrigin),
    {
      cache: 'no-store',
    },
  ).catch(() => undefined);
  const body = await response?.json().catch(() => ({ user: null }));
  return NextResponse.json({ user: body?.user ?? null });
}

export async function DELETE() {
  const jar = await cookies();
  const id = jar.get('datalom_user')?.value ?? '';
  if (id) {
    await fetch(new URL(`/api/auth/session?id=${encodeURIComponent(id)}`, apiOrigin), {
      method: 'DELETE',
      cache: 'no-store',
    }).catch(() => undefined);
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.delete('datalom_user');
  return response;
}
