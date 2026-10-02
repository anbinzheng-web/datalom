'use client';
import { Button, Field, Input } from './ui';

import { useState } from 'react';
export function DatasetOrder() {
  const [records, setRecords] = useState('1000000');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const count = Number(records);
  const valid =
    records !== '' && Number.isSafeInteger(count) && count > 0 && count <= 1000000000000;
  function lastYear() {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const start = new Date(end.getFullYear(), end.getMonth() - 11, 1);
    const month = (d: Date) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    setFrom(month(start));
    setTo(month(end));
  }
  return (
    <section
      className={
        'pricing-calculator grid [grid-template-columns:1fr_1fr] gap-y-16 gap-x-16 p-10 [border:var(--border-width)_solid_var(--line)] rounded-[var(--radius-md)] bg-surface mb-16 [&_h2]:text-[34px] [&_h2]:font-medium [&_h2]:tracking-normal [&_h2]:leading-[1.15] [&_h2]:my-5 [&_h2]:mx-0 [&_p]:text-[13px] [&_p]:leading-[1.9] [&_p]:text-muted [&_p]:my-3 [&_p]:mx-0 max-[901px]:gap-y-8 max-[901px]:gap-x-8 max-[901px]:p-6 max-[641px]:[grid-template-columns:1fr] max-[641px]:p-6 max-[641px]:gap-y-5 max-[641px]:gap-x-5 max-[641px]:[&_h2]:text-[29px] [&_>_*]:min-w-0 dataset-order [border-top-color:var(--purple-tint)] [border-right-color:var(--purple-tint)] [border-bottom-color:var(--purple-tint)] [border-left-color:var(--purple-tint)]'
      }
      aria-labelledby="dataset-estimate-title"
    >
      <div>
        <span
          className={
            'eyebrow block font-mono text-[10px] tracking-normal font-medium text-muted [.editorial-sections_&]:pt-2 max-[641px]:[.closing_&]:text-[8px] max-[641px]:[.closing_&]:relative max-[641px]:[.closing_&]:z-[1] [.pricing-datasets_&]:[color:var(--purple)] [.signal-panel_&]:m-0 [.signal-panel_&]:text-[10px] [.signal-panel_&]:tracking-normal [.signal-engine_&]:text-lime [.home-window-bar_&]:text-lime [.home-price-band_&]:text-lime [.home-final_.home-window-bar_&]:text-brand'
          }
        >
          ONE-TIME DATASET PURCHASE
        </span>
        <h2 id="dataset-estimate-title">Dataset cost calculator</h2>
        <p>
          <strong>$0.20 per 1,000 records · $5 minimum per order.</strong> Months select the data;
          record count determines the price.
        </p>
        <ul
          className={
            "check-list [list-style:none] p-0 my-6 mx-0 text-[12px] [&_li]:my-4 [&_li]:mx-0 [&_li:before]:[content:'✓'] [&_li:before]:mr-3 [&_li:before]:text-muted [.pricing-card_&]:mb-8 [.pricing-card_&]:leading-[1.7] [.dataset-order_&]:leading-[1.8]"
          }
        >
          <li>3 complete downloads per order</li>
          <li>30 days of access after files are ready</li>
          <li>No subscription or automatic refresh</li>
          <li>Contact us to request access again after expiry</li>
        </ul>
        <p>
          Standard structured data only. Media files and custom collection are quoted separately.
        </p>
      </div>
      <div
        className={
          'estimate-controls [&_label]:block [&_label]:text-[12px] [&_label]:mb-3 [&_#estimate-note]:text-[10px] max-[641px]:[.dataset-order_&]:min-w-0'
        }
      >
        <span
          className={
            'pill text-[9px] text-muted [border:var(--border-width)_solid_var(--line)] rounded-[var(--radius-none)] py-1 px-2 inline-block [.home-data-source_&]:ml-auto [.home-data-source_&]:text-lime max-[641px]:[.home-data-source_&]:hidden'
          }
        >
          Estimate only · Checkout coming soon
        </span>
        <div
          className={
            'estimate-presets flex gap-y-2 gap-x-2 mt-3 mx-0 mb-6 [.dataset-order_&]:flex-wrap'
          }
        >
          <Button variant="quiet" size="sm" onClick={lastYear}>
            Last 12 complete months
          </Button>
        </div>
        <div
          className={
            'dataset-months grid [grid-template-columns:1fr_1fr] gap-y-3 gap-x-3 [&_>_div]:min-w-0 max-[641px]:[grid-template-columns:1fr]'
          }
        >
          <Field label="From month">
            <Input
              id="dataset-from"
              type="month"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
          <Field label="Through month">
            <Input
              id="dataset-to"
              type="month"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              aria-invalid={Boolean(from && to && from > to)}
              aria-describedby="dataset-range-note"
            />
          </Field>
        </div>
        <p id="dataset-range-note" aria-live="polite">
          {from && to && from > to
            ? 'The end month must be on or after the start month.'
            : 'Both months are included. Actual month availability will be shown at launch.'}
        </p>
        <label htmlFor="dataset-records">Estimated records in your selection</label>
        <Input
          id="dataset-records"
          type="number"
          min="1"
          max="1000000000000"
          step="1"
          value={records}
          onChange={(e) => setRecords(e.target.value)}
          aria-invalid={!valid}
          aria-describedby="dataset-estimate-note"
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
              aria-pressed={count === n}
              onClick={() => setRecords(String(n))}
            >
              {new Intl.NumberFormat('en-US', { notation: 'compact' }).format(n)} records
            </Button>
          ))}
        </div>
        <div
          className={
            'estimate-result flex justify-between gap-y-4 gap-x-4 items-center [border-top:var(--border-width)_solid_var(--line)] pt-5 [&_>_span]:text-[12px] [&_strong]:text-[30px] [&_strong]:font-medium [&_strong]:[overflow-wrap:anywhere] max-[641px]:[&_strong]:text-[26px]'
          }
          aria-live="polite"
        >
          <span>One-time estimate</span>
          <strong>
            {valid
              ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
                  Math.max(500, Math.ceil(count / 50)) / 100,
                )
              : '—'}
          </strong>
        </div>
        <p id="dataset-estimate-note">
          {valid
            ? 'USD · $5 minimum; rounded up to the nearest cent. Enter records manually: changing months does not retrieve or recalculate inventory.'
            : 'Enter a whole number from 1 to 1,000,000,000,000.'}
        </p>
        <Button disabled>Purchasing coming soon</Button>
        <p>The exact record count, data version, and total will be confirmed before payment.</p>
      </div>
    </section>
  );
}
