import Link from 'next/link';
import { ButtonLink } from '@/components/ui';
import { Mark } from '@/components/site';
import { homeVideo } from '@/lib/content';

export function VideoSection() {
  return (
    <section className="mx-auto grid w-[min(1240px,calc(100%-112px))] grid-cols-2 items-center gap-16 py-20 max-lg:grid-cols-1 max-sm:w-[calc(100%-40px)] max-sm:gap-8 max-sm:py-12">
      <div className="min-w-0">
        <div className="flex aspect-video overflow-hidden rounded-lg flex-col items-center justify-center gap-4 bg-ink p-5 text-center text-white [&>img]:size-12 [&>small]:text-white/65 [&>iframe]:size-full [&>iframe]:border-0">
          {homeVideo.videoId ? (
            <iframe
              src={`https://www.youtube.com/embed/${homeVideo.videoId}`}
              title={homeVideo.title}
              allowFullScreen
            />
          ) : (
            <>
              <Mark />
              <span>Video coming soon</span>
              <small>{homeVideo.title}</small>
            </>
          )}
        </div>
        {homeVideo.videoId && (
          <a
            href={homeVideo.channelUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-10 items-center text-[13px] font-medium hover:underline hover:underline-offset-4"
          >
            Watch Datalom on YouTube
          </a>
        )}
      </div>
      <div className="[&>h2]:text-[length:var(--text-section)] [&>h2]:font-medium [&>h2]:leading-[1.04] [&>h2]:tracking-normal [&>p]:my-6 [&>p]:leading-relaxed [&>p]:text-muted">
        <h2>Start with the data your next idea needs.</h2>
        <p>
          Browse a documented dataset, test an endpoint, and connect your first AI workflow from one
          account.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <ButtonLink href="/login">Create an account</ButtonLink>
          <ButtonLink variant="secondary" href="/datasets">
            Browse datasets
          </ButtonLink>
          <Link
            className="inline-flex min-h-10 items-center text-[13px] font-medium hover:underline hover:underline-offset-4"
            href="/docs/api"
          >
            Try the API
          </Link>
        </div>
      </div>
    </section>
  );
}
