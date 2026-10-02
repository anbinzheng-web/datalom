import Link from 'next/link';
import { AccordionItem } from '@/components/ui';
import { homeFaq } from '@/lib/content';

export function FaqSection() {
  return (
    <section className="bg-[var(--paper)]" id="faq">
      <div className="mx-auto grid w-[min(1240px,calc(100%-112px))] grid-cols-[1fr_1.2fr] gap-16 py-20 max-lg:grid-cols-1 max-sm:w-[calc(100%-40px)] max-sm:gap-8 max-sm:py-12 [&_h2]:text-[length:var(--text-section)] [&_h2]:leading-[1.04] [&_h2]:font-medium [&_h2]:tracking-normal [&>div>p]:my-6 [&>div>p]:leading-relaxed [&>div>p]:text-muted">
        <div>
          <h2>Useful data starts with clear boundaries.</h2>
          <p>
            We publish public-source data for learning and analysis, with context about where it
            came from and how it can be used.
          </p>
          <Link
            className="inline-flex min-h-10 items-center text-[13px] font-medium hover:underline hover:underline-offset-4"
            href="/legal/data-policy"
          >
            Read the data policy
          </Link>
        </div>
        <div className="grid gap-2">
          {homeFaq.map(([q, a]) => (
            <AccordionItem key={q} title={q}>
              <p>{a}</p>
            </AccordionItem>
          ))}
        </div>
      </div>
    </section>
  );
}
