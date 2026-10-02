'use client';
import { useRef } from 'react';
export function MobileMenu({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  return (
    <details
      className="group/mobile min-[901px]:hidden [&>summary]:cursor-pointer [&>summary]:list-none [&>summary]:px-2 [&>summary]:py-3 [&>summary::-webkit-details-marker]:hidden [&>nav]:absolute [&>nav]:inset-x-0 [&>nav]:top-full [&>nav]:max-h-[calc(100dvh-var(--header-height))] [&>nav]:overflow-y-auto [&>nav]:border-b [&>nav]:border-line [&>nav]:bg-paper [&>nav]:p-5 [&>nav]:shadow-md [&>nav>a]:block [&>nav>a]:py-3 [&>nav>a]:text-sm"
      ref={ref}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && ref.current) {
          ref.current.open = false;
          ref.current.querySelector('summary')?.focus();
        }
      }}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('a') && ref.current) ref.current.open = false;
      }}
    >
      {children}
    </details>
  );
}
