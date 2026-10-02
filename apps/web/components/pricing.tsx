'use client';
import { AccordionItem, Button, ButtonLink, Input } from './ui';

import { useState } from 'react';
import { DatasetOrder } from './dataset-order';
export function Pricing() {
  const [requests, setRequests] = useState('1000000');
  const count = Number(requests);
  const valid =
    requests !== '' && Number.isSafeInteger(count) && count >= 0 && count <= 1000000000000;
  return (
    <div className="pricing-content">
      <div
        className={
          'pricing-grid grid [grid-template-columns:1.25fr_1fr] gap-y-6 gap-x-6 mb-16 max-[641px]:[grid-template-columns:1fr] [&_>_*]:min-w-0'
        }
      >
        <section
          className={
            'pricing-card [border:var(--border-width)_solid_var(--line)] rounded-[var(--radius-md)] p-10 flex flex-col items-start [&_h2]:text-[35px] [&_h2]:font-medium [&_h2]:tracking-normal [&_h2]:leading-[1.15] [&_h2]:my-6 [&_h2]:mx-0 [&_p]:text-[13px] [&_p]:leading-[1.8] [&_p]:text-muted [&_p]:my-3 [&_p]:mx-0 max-[901px]:p-6 max-[641px]:p-6 max-[641px]:[&_h2]:text-[30px] pricing-api [background:var(--green-soft)] [border-top-color:var(--line-strong)] [border-right-color:var(--line-strong)] [border-bottom-color:var(--line-strong)] [border-left-color:var(--line-strong)]'
          }
        >
          <div
            className={
              'pricing-card-label flex items-center justify-between gap-y-5 gap-x-5 w-full'
            }
          >
            <span
              className={
                'eyebrow block font-mono text-[10px] tracking-normal font-medium text-muted [.editorial-sections_&]:pt-2 max-[641px]:[.closing_&]:text-[8px] max-[641px]:[.closing_&]:relative max-[641px]:[.closing_&]:z-[1] [.pricing-datasets_&]:[color:var(--purple)] [.signal-panel_&]:m-0 [.signal-panel_&]:text-[10px] [.signal-panel_&]:tracking-normal [.signal-engine_&]:text-lime [.home-window-bar_&]:text-lime [.home-price-band_&]:text-lime [.home-final_.home-window-bar_&]:text-brand'
              }
            >
              SOCIAL MEDIA APIs
            </span>
            <span
              className={
                'pill text-[9px] text-muted [border:var(--border-width)_solid_var(--line)] rounded-[var(--radius-none)] py-1 px-2 inline-block [.home-data-source_&]:ml-auto [.home-data-source_&]:text-lime max-[641px]:[.home-data-source_&]:hidden'
              }
            >
              One flat rate
            </span>
          </div>
          <h2>API usage</h2>
          <div
            className={
              'pricing-amount text-[62px] tracking-normal font-medium leading-[1.1] [&_>_span]:block [&_>_span]:text-[13px] [&_>_span]:tracking-0 [&_>_span]:mt-3 [&_>_span]:text-muted max-[901px]:text-[49px] max-[641px]:text-[54px]'
            }
          >
            $0.0005<span>/ successful request</span>
          </div>
          <p className={'pricing-equivalent mt-3'}>$0.50 per 1,000 successful requests · USD</p>
          <ul
            className={
              "check-list [list-style:none] p-0 my-6 mx-0 text-[12px] [&_li]:my-4 [&_li]:mx-0 [&_li:before]:[content:'✓'] [&_li:before]:mr-3 [&_li:before]:text-muted [.pricing-card_&]:mb-8 [.pricing-card_&]:leading-[1.7] [.dataset-order_&]:leading-[1.8]"
            }
          >
            <li>The same price at every volume</li>
            <li>No monthly subscription</li>
            <li>No RPS plans or throughput fees</li>
            <li>No fixed per-customer RPS tier</li>
            <li>Server errors and timeouts aren’t charged</li>
          </ul>
          <ButtonLink href="/docs/api">Explore the API reference</ButtonLink>
          <p
            className={
              'pricing-availability [.pricing-card_&]:text-[10px] [.pricing-card_&]:mt-3 [.pricing-card_&]:mx-0 [.pricing-card_&]:mb-0'
            }
          >
            Public API access and billing are not open yet.
          </p>
        </section>
        <section
          className={
            'pricing-card [border:var(--border-width)_solid_var(--line)] rounded-[var(--radius-md)] p-10 flex flex-col items-start [&_h2]:text-[35px] [&_h2]:font-medium [&_h2]:tracking-normal [&_h2]:leading-[1.15] [&_h2]:my-6 [&_h2]:mx-0 [&_p]:text-[13px] [&_p]:leading-[1.8] [&_p]:text-muted [&_p]:my-3 [&_p]:mx-0 max-[901px]:p-6 max-[641px]:p-6 max-[641px]:[&_h2]:text-[30px] pricing-datasets [border-top-color:var(--purple-line)] [border-right-color:var(--purple-line)] [border-bottom-color:var(--purple-line)] [border-left-color:var(--purple-line)]'
          }
        >
          <span
            className={
              'eyebrow block font-mono text-[10px] tracking-normal font-medium text-muted [.editorial-sections_&]:pt-2 max-[641px]:[.closing_&]:text-[8px] max-[641px]:[.closing_&]:relative max-[641px]:[.closing_&]:z-[1] [.pricing-datasets_&]:[color:var(--purple)] [.signal-panel_&]:m-0 [.signal-panel_&]:text-[10px] [.signal-panel_&]:tracking-normal [.signal-engine_&]:text-lime [.home-window-bar_&]:text-lime [.home-price-band_&]:text-lime [.home-final_.home-window-bar_&]:text-brand'
            }
          >
            DATASETS
          </span>
          <h2>One-time dataset purchase</h2>
          <div
            className={
              'dataset-price text-[29px] tracking-normal my-2 mx-0 [.pricing-datasets_&]:[color:var(--purple)]'
            }
          >
            $0.20 / 1,000 records
          </div>
          <p>Choose your months and pay for the records. $5 minimum per order.</p>
          <ul
            className={
              "check-list [list-style:none] p-0 my-6 mx-0 text-[12px] [&_li]:my-4 [&_li]:mx-0 [&_li:before]:[content:'✓'] [&_li:before]:mr-3 [&_li:before]:text-muted [.pricing-card_&]:mb-8 [.pricing-card_&]:leading-[1.7] [.dataset-order_&]:leading-[1.8]"
            }
          >
            <li>One-time payment, no subscription</li>
            <li>3 complete downloads per order</li>
            <li>30 days to download after files are ready</li>
            <li>Request renewed access after expiry</li>
          </ul>
          <ButtonLink variant="secondary" href="/datasets">
            Explore datasets
          </ButtonLink>
          <p
            className={
              'pricing-availability [.pricing-card_&]:text-[10px] [.pricing-card_&]:mt-3 [.pricing-card_&]:mx-0 [.pricing-card_&]:mb-0'
            }
          >
            Standard structured data. Purchasing is not open yet.
          </p>
        </section>
      </div>
      <section
        className={
          'pricing-calculator grid [grid-template-columns:1fr_1fr] gap-y-16 gap-x-16 p-10 [border:var(--border-width)_solid_var(--line)] rounded-[var(--radius-md)] bg-surface mb-16 [&_h2]:text-[34px] [&_h2]:font-medium [&_h2]:tracking-normal [&_h2]:leading-[1.15] [&_h2]:my-5 [&_h2]:mx-0 [&_p]:text-[13px] [&_p]:leading-[1.9] [&_p]:text-muted [&_p]:my-3 [&_p]:mx-0 max-[901px]:gap-y-8 max-[901px]:gap-x-8 max-[901px]:p-6 max-[641px]:[grid-template-columns:1fr] max-[641px]:p-6 max-[641px]:gap-y-5 max-[641px]:gap-x-5 max-[641px]:[&_h2]:text-[29px] [&_>_*]:min-w-0'
        }
        aria-labelledby="estimate-title"
      >
        <div>
          <span
            className={
              'eyebrow block font-mono text-[10px] tracking-normal font-medium text-muted [.editorial-sections_&]:pt-2 max-[641px]:[.closing_&]:text-[8px] max-[641px]:[.closing_&]:relative max-[641px]:[.closing_&]:z-[1] [.pricing-datasets_&]:[color:var(--purple)] [.signal-panel_&]:m-0 [.signal-panel_&]:text-[10px] [.signal-panel_&]:tracking-normal [.signal-engine_&]:text-lime [.home-window-bar_&]:text-lime [.home-price-band_&]:text-lime [.home-final_.home-window-bar_&]:text-brand'
            }
          >
            USAGE ESTIMATE
          </span>
          <h2 id="estimate-title">API cost calculator</h2>
          <p>One rate, whether you make a thousand requests or a million.</p>
        </div>
        <div
          className={
            'estimate-controls [&_label]:block [&_label]:text-[12px] [&_label]:mb-3 [&_#estimate-note]:text-[10px] max-[641px]:[.dataset-order_&]:min-w-0'
          }
        >
          <label htmlFor="request-count">Successful API requests</label>
          <Input
            id="request-count"
            type="number"
            min="0"
            max="1000000000000"
            step="1"
            value={requests}
            aria-invalid={!valid}
            aria-describedby="estimate-note"
            onChange={(e) => setRequests(e.target.value)}
          />
          <div
            className={
              'estimate-presets flex gap-y-2 gap-x-2 mt-3 mx-0 mb-6 [.dataset-order_&]:flex-wrap'
            }
          >
            {[10000, 100000, 1000000].map((n) => (
              <Button
                variant="quiet"
                size="sm"
                key={n}
                onClick={() => setRequests(String(n))}
                aria-pressed={count === n}
              >
                {new Intl.NumberFormat('en-US', { notation: 'compact' }).format(n)}
              </Button>
            ))}
          </div>
          <div
            className={
              'estimate-result flex justify-between gap-y-4 gap-x-4 items-center [border-top:var(--border-width)_solid_var(--line)] pt-5 [&_>_span]:text-[12px] [&_strong]:text-[30px] [&_strong]:font-medium [&_strong]:[overflow-wrap:anywhere] max-[641px]:[&_strong]:text-[26px]'
            }
            aria-live="polite"
          >
            <span>Estimated API usage</span>
            <strong>
              {valid
                ? new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'USD',
                    maximumFractionDigits: 4,
                  }).format(count * 0.0005)
                : '—'}
            </strong>
          </div>
          <p id="estimate-note">
            {valid
              ? 'USD · API usage only. Dataset purchases are separate.'
              : 'Enter a whole number from 0 to 1,000,000,000,000.'}
          </p>
        </div>
      </section>
      <DatasetOrder />
      <section
        className={
          'pricing-throughput [&_h2]:text-[34px] [&_h2]:font-medium [&_h2]:tracking-normal [&_h2]:leading-[1.15] [&_h2]:my-5 [&_h2]:mx-0 [&_p]:text-[13px] [&_p]:leading-[1.9] [&_p]:text-muted [&_p]:my-3 [&_p]:mx-0 max-w-[820px] mt-0 mx-0 mb-16 max-[641px]:[&_h2]:text-[29px]'
        }
      >
        <span
          className={
            'eyebrow block font-mono text-[10px] tracking-normal font-medium text-muted [.editorial-sections_&]:pt-2 max-[641px]:[.closing_&]:text-[8px] max-[641px]:[.closing_&]:relative max-[641px]:[.closing_&]:z-[1] [.pricing-datasets_&]:[color:var(--purple)] [.signal-panel_&]:m-0 [.signal-panel_&]:text-[10px] [.signal-panel_&]:tracking-normal [.signal-engine_&]:text-lime [.home-window-bar_&]:text-lime [.home-price-band_&]:text-lime [.home-final_.home-window-bar_&]:text-brand'
          }
        >
          REQUEST CAPACITY
        </span>
        <h2>More requests. Same rate.</h2>
        <p>
          There is no paid speed upgrade or fixed RPS package. Requests are served according to
          available capacity, with infrastructure scaled as demand grows. During capacity limits,
          requests may queue or receive a retry response. Throughput is not unlimited or guaranteed.
        </p>
      </section>
      <section
        className={
          'faq grid [grid-template-columns:0.85fr_1.15fr] gap-y-16 gap-x-16 [&_details]:[border-bottom:var(--border-width)_solid_var(--line)] [&_summary]:flex [&_summary]:justify-between [&_summary]:gap-y-6 [&_summary]:gap-x-6 [&_summary]:text-[13px] [&_summary]:py-5 [&_summary]:px-0 [&_summary]:[list-style:none] [&_summary::-webkit-details-marker]:hidden [&_summary_span]:text-muted [&_details[open]_summary_span]:[transform:rotate(45deg)] [&_details_p]:text-[13px] [&_details_p]:leading-[1.8] [&_details_p]:text-muted [&_details_p]:mt-0 [&_details_p]:mr-8 [&_details_p]:mb-5 [&_details_p]:ml-0 max-[901px]:gap-y-8 max-[901px]:gap-x-8 max-[641px]:[grid-template-columns:1fr] max-[641px]:gap-y-8 max-[641px]:gap-x-8 max-[641px]:[&_summary]:text-[12px] max-[641px]:[&_summary]:leading-[1.6] [.home-faq-section_&_p]:text-muted [.home-faq-section_&_p]:leading-[1.7] [.home-faq-section_&_p]:text-[13px] pricing-faq [&_h2]:text-[34px] [&_h2]:font-medium [&_h2]:tracking-normal [&_h2]:leading-[1.15] [&_h2]:my-5 [&_h2]:mx-0 pt-0 px-0 pb-20 max-[641px]:pb-12'
        }
      >
        <div>
          <span
            className={
              'eyebrow block font-mono text-[10px] tracking-normal font-medium text-muted [.editorial-sections_&]:pt-2 max-[641px]:[.closing_&]:text-[8px] max-[641px]:[.closing_&]:relative max-[641px]:[.closing_&]:z-[1] [.pricing-datasets_&]:[color:var(--purple)] [.signal-panel_&]:m-0 [.signal-panel_&]:text-[10px] [.signal-panel_&]:tracking-normal [.signal-engine_&]:text-lime [.home-window-bar_&]:text-lime [.home-price-band_&]:text-lime [.home-final_.home-window-bar_&]:text-brand'
            }
          >
            PRICING, EXPLAINED
          </span>
          <h2>Pricing FAQ</h2>
        </div>
        <div className="grid gap-2">
          {[
            [
              'Does the price change with volume?',
              'No. Every successful API request costs $0.0005. There are no volume tiers, daily discount thresholds, or monthly subscriptions.',
            ],
            [
              'Do I need to pay for higher RPS?',
              'No. We do not sell RPS plans or charge throughput fees. Available service capacity determines throughput; traffic protection and upstream platform constraints still apply.',
            ],
            [
              'What happens if a request fails?',
              'Server errors, timeouts, and capacity-related retry responses are not charged. Endpoint documentation will define successful responses and valid empty results before billing opens.',
            ],
            [
              'Are datasets included?',
              'No. Standard datasets cost $0.20 per 1,000 records with a $5 order minimum. Each order includes 3 complete downloads within 30 days after files are ready. Contact us to request an extension or additional downloads after access expires.',
            ],
            [
              'Can I start paying today?',
              'Not yet. This is our API pricing model; public account access and billing are still in development. You can explore the API reference and product roadmap now.',
            ],
          ].map(([q, a]) => (
            <AccordionItem key={q} title={q}>
              <p>{a}</p>
            </AccordionItem>
          ))}
        </div>
      </section>
    </div>
  );
}
