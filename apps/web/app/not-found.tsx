import { ButtonLink } from '@/components/ui';
export default function NotFound() {
  return (
    <main
      id="main-content"
      className={
        'wrap w-[min(var(--layout-width),_calc(100%_-_112px))] m-auto [.source-strip_>_&]:flex [.source-strip_>_&]:justify-between [.source-strip_>_&]:items-center [.source-strip_>_&]:gap-y-6 [.source-strip_>_&]:gap-x-6 [.source-strip_>_&]:min-h-[102px] [.source-strip_>_&_>_span]:text-[8px] [.source-strip_>_&_>_span]:leading-[1.8] [.source-strip_>_&_>_span]:tracking-normal [.source-strip_>_&_>_span]:text-muted [.source-strip_>_&_>_span]:shrink-0 max-[1151px]:w-[calc(100%_-_64px)] max-[1151px]:[.source-strip_>_&]:gap-y-4 max-[1151px]:[.source-strip_>_&]:gap-x-4 max-[901px]:[.source-strip_>_&_>_span]:hidden max-[901px]:[.source-strip_>_&]:flex-wrap max-[901px]:[.source-strip_>_&]:justify-center max-[901px]:[.source-strip_>_&]:py-6 max-[901px]:[.source-strip_>_&]:px-0 max-[901px]:[.source-strip_>_&]:gap-y-5 max-[901px]:[.source-strip_>_&]:gap-x-5 max-[641px]:w-[calc(100%_-_40px)] max-[641px]:[.source-strip_>_&]:gap-y-5 max-[641px]:[.source-strip_>_&]:gap-x-6 page-hero pt-16 px-0 pb-12 max-w-[920px] [&_h1]:text-[length:var(--text-page)] [&_h1]:font-medium [&_h1]:leading-[1.08] [&_h1]:tracking-normal [&_h1]:my-6 [&_h1]:mx-0 [&_p]:text-muted [&_p]:text-[17px] [&_p]:leading-[1.8] [&_p]:max-w-[720px] max-[641px]:pt-10 max-[641px]:px-0 max-[641px]:pb-8 max-[641px]:[&_h1]:tracking-normal max-[641px]:[&_p]:text-[15px] not-found min-h-[65vh]'
      }
    >
      <span
        className={
          'eyebrow block font-mono text-[10px] tracking-normal font-medium text-muted [.editorial-sections_&]:pt-2 max-[641px]:[.closing_&]:text-[8px] max-[641px]:[.closing_&]:relative max-[641px]:[.closing_&]:z-[1] [.pricing-datasets_&]:[color:var(--purple)] [.signal-panel_&]:m-0 [.signal-panel_&]:text-[10px] [.signal-panel_&]:tracking-normal [.signal-engine_&]:text-lime [.home-window-bar_&]:text-lime [.home-price-band_&]:text-lime [.home-final_.home-window-bar_&]:text-brand'
        }
      >
        404 / A LITTLE OFF THE MAP
      </span>
      <h1>
        There’s more to
        <br />
        explore elsewhere.
      </h1>
      <p>This page doesn’t exist. Find your way back to the product directory.</p>
      <ButtonLink href="/products">Explore products</ButtonLink>
    </main>
  );
}
