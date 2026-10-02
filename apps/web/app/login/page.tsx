import { ButtonAnchor } from '@/components/ui';
import { PasswordAuth } from '@/components/password-auth';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Sign in' };

const errors: Record<string, string> = {
  whitelist: 'This email domain is not allowlisted yet.',
  state: 'Your sign-in session expired. Please try again.',
  provider: 'This sign-in provider is not configured.',
  failed: 'Sign-in could not be completed.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main id="main-content" className="flex min-h-dvh flex-col bg-paper p-2 sm:p-6">
      <div className="mx-auto my-auto grid w-full max-w-[1200px] overflow-hidden rounded-lg border border-line bg-surface shadow-[var(--shadow-md)] lg:grid-cols-[1.05fr_1fr]">
        <section className="relative flex flex-col justify-between overflow-hidden bg-ink p-8 text-white max-lg:hidden">
          <div>
            <Link
              href="/"
              aria-label="Datalom home"
              className="mb-5 inline-flex rounded-sm focus-visible:outline-white"
            >
              <img src="/datalom-logo-light.svg" width="142" height="37" alt="Datalom" />
            </Link>
            <h2 className="max-w-[420px] text-[40px] font-medium leading-[1.15]">
              The world’s content.
              <br />
              <span className="text-[#a5aeff]">Your next idea.</span>
            </h2>
            <p className="mt-6 max-w-[350px] text-sm leading-7 text-white/65">
              Start with a dataset or an API call,
              <br />
              and turn public data into your next idea.
            </p>
          </div>
          <div className="my-6 rounded-md border border-white/15 bg-white/5 p-6">
            <div className="flex items-center justify-between border-b border-white/15 pb-4">
              <span className="text-xs text-white/80">From public content to structured data</span>
              <span className="font-mono text-[10px] text-[#a5aeff]">DATALOM</span>
            </div>
            <div className="mt-5 flex items-center gap-3" aria-hidden="true">
              {['tiktok-light', 'instagram', 'youtube', 'facebook'].map((name) => (
                <span
                  key={name}
                  className="flex size-10 items-center justify-center rounded-sm bg-white"
                >
                  <img src={`/platforms/${name}.svg`} alt="" className="size-6" />
                </span>
              ))}
            </div>
            <pre className="mt-4 text-xs leading-5 text-white/75">
              <code>
                {
                  '{\n  "source": "public platforms",\n  "formats": ["JSON", "CSV", "Parquet"],\n  "next": "your idea"\n}'
                }
              </code>
            </pre>
          </div>
          <div className="flex gap-6 text-xs text-white/60">
            <span>Datasets</span>
            <span>REST API</span>
            <span>MCP & Skills</span>
          </div>
        </section>
        <section className="flex flex-col justify-center px-6 py-3 sm:px-12 sm:py-5">
          <div className="mx-auto w-full max-w-[360px]">
            <Link href="/" aria-label="Datalom home" className="mb-2 inline-flex lg:hidden">
              <img src="/datalom-logo.svg" width="142" height="37" alt="Datalom" />
            </Link>
            <p className="mb-2 text-xs font-medium text-brand max-sm:hidden">WELCOME TO DATALOM</p>
            <h1 className="text-[28px] sm:text-[32px] font-medium leading-tight">
              Start your data journey
            </h1>
            <div className="mt-3">
              <PasswordAuth />
            </div>
            <div className="my-3 flex items-center gap-3 text-[11px] text-muted">
              <span className="h-px flex-1 bg-line" />
              <span>OR CONTINUE WITH</span>
              <span className="h-px flex-1 bg-line" />
            </div>
            <div className="grid gap-2">
              <ButtonAnchor
                variant="secondary"
                size="xl"
                className="w-full gap-3"
                href="/api/auth/google"
              >
                <img
                  src="/platforms/google.svg"
                  alt=""
                  aria-hidden="true"
                  width="20"
                  height="20"
                  className="size-5"
                />
                Sign in with Google
              </ButtonAnchor>
              <ButtonAnchor
                variant="secondary"
                size="xl"
                className="w-full gap-3"
                href="/api/auth/github"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="currentColor">
                  <path d="M12 .8a11.2 11.2 0 0 0-3.54 21.83c.56.1.76-.24.76-.54v-2.1c-3.12.68-3.78-1.33-3.78-1.33-.5-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.68.08-.68 1.13.08 1.72 1.16 1.72 1.16 1 1.71 2.62 1.22 3.26.94.1-.73.39-1.22.71-1.5-2.49-.28-5.1-1.24-5.1-5.53 0-1.22.44-2.22 1.15-3-.12-.29-.5-1.42.11-2.96 0 0 .94-.3 3.08 1.15A10.7 10.7 0 0 1 12 6.21c.95 0 1.9.13 2.8.38 2.13-1.45 3.07-1.15 3.07-1.15.61 1.54.23 2.67.11 2.96.72.78 1.15 1.78 1.15 3 0 4.3-2.62 5.25-5.12 5.53.4.35.76 1.03.76 2.08v3.08c0 .3.2.65.77.54A11.2 11.2 0 0 0 12 .8Z" />
                </svg>
                Sign in with GitHub
              </ButtonAnchor>
            </div>
            {error && (
              <p
                role="alert"
                className="mt-4 rounded-sm border border-danger/20 bg-danger/5 p-3 text-xs leading-5 text-danger"
              >
                {errors[error] ?? 'Sign-in could not be completed.'}
              </p>
            )}
            <p className="mt-3 text-[11px] leading-5 text-muted">
              Learn how we use public data. Read our{' '}
              <Link
                href="/legal/data-policy"
                className="text-ink underline underline-offset-4 hover:text-brand"
              >
                data policy
              </Link>
              .
            </p>
          </div>
        </section>
      </div>
      <p className="mx-auto shrink-0 pt-4 text-center text-[11px] text-muted">
        © {new Date().getFullYear()} Datalom · Public data for learning and analysis
      </p>
    </main>
  );
}
