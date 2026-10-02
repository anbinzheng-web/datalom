'use client';
import { Button, ButtonLink } from '@/components/ui';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type User = { email: string; name: string; role: 'admin' | 'user'; avatarUrl: string };

export default function AccountPage() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => {
    void fetch('/api/auth/me')
      .then((response) => response.json())
      .then((body: { user: User | null }) => setUser(body.user))
      .catch(() => setUser(null));
  }, []);
  async function logout() {
    await fetch('/api/auth/me', { method: 'DELETE' });
    location.href = '/';
  }
  return (
    <main
      id="main-content"
      className={
        'content-main pt-8 wrap w-[min(var(--layout-width),_calc(100%_-_112px))] m-auto [.source-strip_>_&]:flex [.source-strip_>_&]:justify-between [.source-strip_>_&]:items-center [.source-strip_>_&]:gap-y-6 [.source-strip_>_&]:gap-x-6 [.source-strip_>_&]:min-h-[102px] [.source-strip_>_&_>_span]:text-[8px] [.source-strip_>_&_>_span]:leading-[1.8] [.source-strip_>_&_>_span]:tracking-normal [.source-strip_>_&_>_span]:text-muted [.source-strip_>_&_>_span]:shrink-0 max-[1151px]:w-[calc(100%_-_64px)] max-[1151px]:[.source-strip_>_&]:gap-y-4 max-[1151px]:[.source-strip_>_&]:gap-x-4 max-[901px]:[.source-strip_>_&_>_span]:hidden max-[901px]:[.source-strip_>_&]:flex-wrap max-[901px]:[.source-strip_>_&]:justify-center max-[901px]:[.source-strip_>_&]:py-6 max-[901px]:[.source-strip_>_&]:px-0 max-[901px]:[.source-strip_>_&]:gap-y-5 max-[901px]:[.source-strip_>_&]:gap-x-5 max-[641px]:w-[calc(100%_-_40px)] max-[641px]:[.source-strip_>_&]:gap-y-5 max-[641px]:[.source-strip_>_&]:gap-x-6 account-page pt-12 px-0 pb-20 [&_h1]:mb-2'
      }
    >
      <h1>My account</h1>
      {user === undefined && <p>Loading account…</p>}
      {user === null && (
        <p>
          You are not signed in. <Link href="/login">Sign in</Link>
        </p>
      )}
      {user && (
        <>
          <p>
            {user.name || user.email} · {user.role === 'admin' ? 'Admin' : 'User'}
          </p>
          <p>{user.email}</p>
          <div className={'account-actions flex flex-wrap gap-y-3 gap-x-3 my-6 mx-0'}>
            <ButtonLink href="/docs/api">API console</ButtonLink>
            <Button variant="secondary" type="button" onClick={() => void logout()}>
              Sign out
            </Button>
          </div>
        </>
      )}
    </main>
  );
}
