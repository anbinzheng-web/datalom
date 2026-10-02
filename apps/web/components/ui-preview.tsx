'use client';
import { useState, type CSSProperties } from 'react';
import {
  Accordion,
  Button,
  ButtonLink,
  Field,
  Form,
  Input,
  Message,
  Modal,
  Select,
  Textarea,
  Table,
} from './ui';
export function UiPreview() {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  return (
    <main
      id="main-content"
      className={
        'ui-showcase max-w-[1100px] m-auto py-16 px-6 grid gap-y-8 gap-x-8 [&_h1]:text-[length:var(--text-page)] [&_h1]:font-medium [&_h2]:text-[22px] [&_h2]:font-medium [&_h3]:font-medium'
      }
    >
      <header>
        <span
          className={
            'eyebrow block font-mono text-[10px] tracking-normal font-medium text-muted [.editorial-sections_&]:pt-2 max-[641px]:[.closing_&]:text-[8px] max-[641px]:[.closing_&]:relative max-[641px]:[.closing_&]:z-[1] [.pricing-datasets_&]:[color:var(--purple)] [.signal-panel_&]:m-0 [.signal-panel_&]:text-[10px] [.signal-panel_&]:tracking-normal [.signal-engine_&]:text-lime [.home-window-bar_&]:text-lime [.home-price-band_&]:text-lime [.home-final_.home-window-bar_&]:text-brand'
          }
        >
          DATALOM DESIGN SYSTEM
        </span>
        <h1>Component library</h1>
        <p>
          Development preview of the shared production components, design tokens, and interaction
          states.
        </p>
      </header>
      <section className={'ui-showcase-section grid gap-y-5 gap-x-5 py-8 border-t border-line'}>
        <h2>Foundations · Borderless & balanced</h2>
        <p>
          Soft fills define controls. Focus adds a clear outline; floating surfaces use elevation.
        </p>
        <div
          className={
            'ui-foundation-grid grid [grid-template-columns:repeat(auto-fit,_minmax(180px,_1fr))] gap-y-4 gap-x-4'
          }
        >
          {[
            ['Brand', '--brand'],
            ['Text', '--ink'],
            ['Muted text', '--muted'],
            ['Page', '--paper'],
            ['Surface', '--surface'],
            ['Border', '--line'],
            ['API / Info', '--blue'],
            ['Datasets / AI', '--purple'],
            ['Integrations / Warning', '--amber'],
            ['Tools / Success', '--teal'],
            ['Monitoring', '--rose'],
            ['Error', '--danger'],
          ].map(([label, token]) => (
            <div
              className={
                'ui-swatch grid gap-y-2 gap-x-2 text-[14px] [&_>_span]:h-[48px] [&_>_span]:border border-line [&_code]:text-[12px] [&_code]:text-muted'
              }
              key={token}
            >
              <span
                className="bg-[var(--swatch-color)]"
                style={{ '--swatch-color': 'var(' + token + ')' } as CSSProperties}
                aria-hidden="true"
              />
              <strong>{label}</strong>
              <code>{token}</code>
            </div>
          ))}
        </div>
        <h3>Typography</h3>
        <div className="divide-y divide-line [&>div]:py-5">
          <div>
            <p className="text-xs text-muted">Page · 56 / 36px</p>
            <p className="text-[length:var(--text-page)] leading-tight">Public data.</p>
          </div>
          <div>
            <p className="text-xs text-muted">Section · 40 / 28px</p>
            <p className="text-[length:var(--text-section)] leading-tight">
              Ready for your next idea.
            </p>
          </div>
          <div>
            <p className="text-xs text-muted">Component · 24px</p>
            <p className="text-2xl">Structured records</p>
          </div>
          <div>
            <p className="text-base leading-relaxed">Body · 16px / 1.7</p>
            <p className="text-xs text-muted">Caption · 12px / 1.5</p>
          </div>
        </div>
        <h3>Spacing · 4px base grid</h3>
        <div className={'ui-showcase-row flex flex-wrap items-center gap-y-3 gap-x-3'}>
          {[4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80].map((value, index) => (
            <div
              className={
                'ui-space-sample [&_code]:text-[12px] [&_code]:text-muted grid gap-y-2 gap-x-2 [align-self:end] [&_>_span]:h-[var(--space-4)] [&_>_span]:bg-brand'
              }
              key={value}
            >
              <span
                className="w-[var(--sample-width)]"
                style={{ '--sample-width': 'var(--space-' + (index + 1) + ')' } as CSSProperties}
              />
              <code>{value}px</code>
            </div>
          ))}
        </div>
        <h3>Edges & elevation</h3>
        <div
          className={
            'ui-foundation-grid grid [grid-template-columns:repeat(auto-fit,_minmax(180px,_1fr))] gap-y-4 gap-x-4'
          }
        >
          {['none', 'sm', 'md', 'lg'].map((level) => (
            <div
              className={
                'ui-elevation-sample shadow-[var(--sample-shadow)] [&_code]:text-[12px] [&_code]:text-muted grid gap-y-3 gap-x-3 p-[var(--panel-padding)] bg-surface'
              }
              key={level}
              style={{ '--sample-shadow': 'var(--shadow-' + level + ')' } as CSSProperties}
            >
              <strong>
                {level === 'none'
                  ? 'Flat surface'
                  : level === 'sm'
                    ? 'Hover surface'
                    : level === 'md'
                      ? 'Dropdown'
                      : 'Modal'}
              </strong>
              <code>--shadow-{level}</code>
            </div>
          ))}
        </div>
        <p>
          Borderless defaults · 1px active fields · 3px keyboard focus · 6px controls · 8px cards ·
          12px dialogs.
        </p>
      </section>
      <section className={'ui-showcase-section grid gap-y-5 gap-x-5 py-8 border-t border-line'}>
        <h2>Buttons</h2>
        <div className={'ui-showcase-row flex flex-wrap items-center gap-y-3 gap-x-3'}>
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="quiet">Quiet</Button>
          <Button variant="secondary" aria-pressed>
            Selected
          </Button>
          <Button variant="danger">Danger</Button>
          <ButtonLink href="/">Link button</ButtonLink>
        </div>
        <div className={'ui-showcase-row flex flex-wrap items-center gap-y-3 gap-x-3'}>
          {(['xl', 'lg', 'md', 'sm', 'xs'] as const).map((size, index) => (
            <Button key={size} size={size}>
              {size} · {[44, 40, 36, 32, 28][index]}px
            </Button>
          ))}
          <Button disabled>Disabled</Button>
          <Button loading>Saving</Button>
        </div>
      </section>
      <section className={'ui-showcase-section grid gap-y-5 gap-x-5 py-8 border-t border-line'}>
        <h2>Form controls</h2>
        <p>Soft backgrounds at rest, white backgrounds and a brand outline on focus.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          {(['xl', 'lg', 'md', 'sm', 'xs'] as const).map((size) => (
            <div key={size} className="grid gap-2">
              <p>{size}</p>
              <Input size={size} aria-label={size + ' input'} placeholder={size + ' input'} />
              <Select
                size={size}
                aria-label={size + ' select'}
                placeholder="Choose a platform"
                options={[
                  { value: 'tiktok', label: 'TikTok' },
                  { value: 'instagram', label: 'Instagram' },
                  { value: 'youtube', label: 'YouTube' },
                  { value: 'unavailable', label: 'Unavailable option', disabled: true },
                ]}
              />
              <Textarea
                size={size}
                aria-label={size + ' textarea'}
                placeholder={size + ' textarea'}
              />
            </div>
          ))}
        </div>
        <Form
          onSubmit={(event) => {
            event.preventDefault();
            setSaved(true);
          }}
        >
          <Field label="Email" hint="Used only in this preview.">
            <Input type="email" required placeholder="you@example.com" />
          </Field>
          <Field label="Platform">
            <Select
              name="platform"
              defaultValue="tiktok"
              options={[
                { value: 'tiktok', label: 'TikTok' },
                { value: 'youtube', label: 'YouTube' },
              ]}
            />
          </Field>
          <Field label="Notes">
            <Textarea placeholder="Tell us what you need" />
          </Field>
          <Field label="Disabled field">
            <Input disabled value="Unavailable" />
          </Field>
          <Field label="Validation example" error="Enter a valid API key.">
            <Input defaultValue="invalid-key" />
          </Field>
          <div className={'ui-showcase-row flex flex-wrap items-center gap-y-3 gap-x-3'}>
            <Button type="submit">Save example</Button>
            <Button variant="secondary" onClick={() => setOpen(true)}>
              Open dialog
            </Button>
          </div>
        </Form>
        {saved && (
          <Message tone="success" onDismiss={() => setSaved(false)}>
            Example saved locally. No data was sent.
          </Message>
        )}
      </section>
      <section className={'ui-showcase-section grid gap-y-5 gap-x-5 py-8 border-t border-line'}>
        <h2>Messages</h2>
        <Message>Information about your request.</Message>
        <Message tone="success">Your export is ready.</Message>
        <Message tone="warning">Download access expires soon.</Message>
        <Message tone="error">The request failed. Please try again.</Message>
      </section>
      <section className="grid gap-5 py-8">
        <h2>Table</h2>
        <p>Borderless rows with alternating backgrounds. Scroll horizontally on narrow screens.</p>
        <div className="overflow-x-auto" role="region" aria-label="Example data table" tabIndex={0}>
          <Table className="min-w-[560px]" aria-label="Dataset examples">
            <thead>
              <tr>
                <th scope="col">Dataset</th>
                <th scope="col">Platform</th>
                <th scope="col">Format</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Public profiles</td>
                <td>TikTok</td>
                <td>JSON</td>
              </tr>
              <tr>
                <td>Video records</td>
                <td>YouTube</td>
                <td>CSV</td>
              </tr>
              <tr>
                <td>Public posts</td>
                <td>Instagram</td>
                <td>JSON</td>
              </tr>
              <tr>
                <td>Comments</td>
                <td>Facebook</td>
                <td>CSV</td>
              </tr>
            </tbody>
          </Table>
        </div>
      </section>
      <section className={'ui-showcase-section grid gap-y-5 gap-x-5 py-8 border-t border-line'}>
        <h2>Accordion</h2>
        <Accordion
          items={[
            {
              id: 'one',
              title: 'Are these shared components?',
              content: 'Yes. The website uses the same components shown here.',
            },
            {
              id: 'two',
              title: 'Can multiple items stay open?',
              content: 'Pass multiple to Accordion to allow independent open items.',
            },
          ]}
        />
      </section>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Example dialog"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setOpen(false);
                setSaved(true);
              }}
            >
              Confirm
            </Button>
          </>
        }
      >
        <Field label="Export name">
          <Input autoFocus placeholder="My dataset" />
        </Field>
        <p>Press Escape to close. Focus returns to the opening button.</p>
      </Modal>
    </main>
  );
}
