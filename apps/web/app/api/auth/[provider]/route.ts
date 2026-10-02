import { beginOAuth, isProvider } from '@/lib/oauth';
import { NextResponse } from 'next/server';

export async function GET(_request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider } = await context.params;
  if (!isProvider(provider))
    return NextResponse.json({ error: { message: 'Unsupported sign-in method' } }, { status: 404 });
  return beginOAuth(provider);
}
