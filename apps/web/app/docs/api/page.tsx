import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ApiConsole } from '@/components/api-console';

export const metadata: Metadata = {
  title: 'API reference',
  description: 'Browse Datalom APIs, send requests, and inspect responses after signing in.',
};

export default function ApiReferencePage() {
  return (
    <main id="main-content">
      <Suspense fallback={<p className={'api-loading p-12 text-muted'}>Loading API catalog…</p>}>
        <ApiConsole />
      </Suspense>
    </main>
  );
}
