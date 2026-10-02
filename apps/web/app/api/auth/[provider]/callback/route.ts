import { finishOAuth, isProvider } from '@/lib/oauth';
import { NextResponse } from 'next/server';

export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider } = await context.params;
  if (!isProvider(provider))
    return NextResponse.json({ error: { message: 'Unsupported sign-in method' } }, { status: 404 });
  return finishOAuth(provider, request);
}
