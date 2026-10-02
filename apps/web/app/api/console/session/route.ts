import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { apiOrigin, currentSession, userCookie } from '@/lib/console-server';

export async function GET() {
  const user = await currentSession();
  return NextResponse.json({ authenticated: Boolean(user), user });
}

export async function DELETE() {
  const id = (await cookies()).get(userCookie)?.value ?? '';
  if (id) {
    await fetch(new URL(`/api/auth/session?id=${encodeURIComponent(id)}`, apiOrigin), {
      method: 'DELETE',
      cache: 'no-store',
    }).catch(() => undefined);
  }
  const response = NextResponse.json({ authenticated: false });
  response.cookies.delete(userCookie);
  return response;
}
