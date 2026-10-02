'use client';
import type { CSSProperties } from 'react';
import { Button, Input } from './ui';

import { useState } from 'react';
import Link from 'next/link';
import { PlatformIcon } from './platform-icon';
import { platforms } from '@/lib/content';
export function PlatformExplorer() {
  const [query, setQuery] = useState('');
  const shown = platforms.filter((p) =>
    `${p[1]} ${p[3]}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <label
        className={
          'search flex items-center gap-y-4 gap-x-4 py-3 px-4 [border:var(--border-width)_solid_var(--line)] rounded-[var(--radius-none)] bg-surface mb-6 [&_>_span:last-child]:text-[11px] [&_>_span:last-child]:text-muted max-[641px]:p-2 max-[641px]:[&_input]:text-[12px] max-[641px]:[&_>_span:last-child]:hidden'
        }
      >
        <span>⌕</span>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a platform or data type…"
          aria-label="Search platforms"
        />
        <span>{shown.length} platforms</span>
      </label>
      <div
        className={
          'platform-grid grid [grid-template-columns:repeat(4,_1fr)] gap-y-3 gap-x-3 [.content-main_>_&]:mb-20 max-[901px]:[grid-template-columns:repeat(3,_1fr)] max-[641px]:[grid-template-columns:repeat(2,_1fr)] max-[641px]:gap-y-2 max-[641px]:gap-x-2 max-[641px]:[.content-main_>_&]:mb-12'
        }
      >
        {shown.map((p) => (
          <Link
            className={
              'platform-card [&:hover]:[transform:none] [&:hover]:[border-top-color:var(--line-strong)] [&:hover]:[border-right-color:var(--line-strong)] [&:hover]:[border-bottom-color:var(--line-strong)] [&:hover]:[border-left-color:var(--line-strong)] [&:hover]:[box-shadow:var(--shadow-sm)] block [border:var(--border-width)_solid_var(--line)] bg-paper rounded-[var(--radius-md)] p-5 relative [transition:border-color_0.15s,_box-shadow_0.15s] [&_h3]:text-[17px] [&_h3]:font-medium [&_h3]:mt-5 [&_h3]:mx-0 [&_h3]:mb-2 [&_h3]:tracking-normal [&_p]:text-[11px] [&_p]:leading-[1.7] [&_p]:text-muted [&_p]:min-h-[38px] max-[641px]:p-4 max-[641px]:[&_h3]:text-[16px] max-[641px]:[&_p]:text-[11px] max-[641px]:[&_p]:min-h-[55px]'
            }
            href={`/platforms/${p[0]}`}
            key={p[0]}
          >
            <span
              className={
                'bg-[var(--platform-tint)] platform-icon h-[46px] w-[46px] [display:inline-grid] [place-content:center] text-[15px] font-medium tracking-normal bg-surface! [border:var(--border-width)_solid_var(--teal-tint)] [box-shadow:var(--shadow-sm)]'
              }
              style={{ '--platform-tint': p[4] } as CSSProperties}
            >
              <PlatformIcon platform={p[0]} />
            </span>
            <h3>{p[1]}</h3>
            <p>{p[3]}</p>
            <div
              className={
                'card-meta flex justify-between text-[11px] font-medium [&_>_span]:text-[16px] [.platform-card_&]:mt-5 [.platform-card_&]:pt-3 [.platform-card_&]:[border-top:var(--border-width)_solid_var(--line)] [.platform-card_&]:text-[9px] [.platform-card_&]:text-muted [.product-card_&]:mt-auto [.product-card_&]:pt-6 [.home-platform-card_&]:mt-auto [.home-platform-card_&]:text-[10px] [.home-platform-card_&]:text-brand [.home-final_.home-platform-card_&]:[grid-column:3] [.home-final_.home-platform-card_&]:[grid-row:1_/_span_2] [.home-final_.home-platform-card_&]:m-0 [.home-final_.home-platform-card_&]:font-medium [.home-final_.home-platform-card_&]:whitespace-nowrap max-[641px]:[.home-final_.home-platform-card_&]:[grid-column:2] max-[641px]:[.home-final_.home-platform-card_&]:[grid-row:auto] max-[641px]:[.home-final_.home-platform-card_&]:[align-self:start] max-[641px]:[.home-final_.home-platform-card_&]:mt-1'
              }
            >
              Planned coverage <span></span>
            </div>
          </Link>
        ))}
      </div>
      {shown.length === 0 && (
        <p className={'empty-state p-8 text-muted'}>
          No matching platforms. Try a platform name or a data type such as videos.
        </p>
      )}
    </>
  );
}
export function CodePreview() {
  const [language, setLanguage] = useState('Python');
  const [copied, setCopied] = useState(false);
  const snippets: Record<string, string> = {
    Python:
      '# Illustrative workflow · not a public SDK\nsource = "tiktok"\ncontent_type = "video"\n\n# Your application receives structured records\nrecord = {\n    "platform": source,\n    "type": content_type,\n    "description": "A new perspective",\n    "metrics": {"views": 128400}\n}',
    JavaScript:
      '// Illustrative workflow · not a public SDK\nconst source = "tiktok";\nconst contentType = "video";\n\n// Your application receives structured records\nconst record = {\n  platform: source,\n  type: contentType,\n  description: "A new perspective",\n  metrics: { views: 128400 }\n};',
    JSON: '{\n  "sample": true,\n  "platform": "tiktok",\n  "type": "video",\n  "description": "A new perspective",\n  "metrics": {\n    "views": 128400\n  },\n  "source_url": "https://example.com/sample"\n}',
  };
  return (
    <div
      className={
        'code-window [background:var(--code-bg)] [color:var(--code-text)] [border:var(--border-width)_solid_var(--green-hover)] rounded-[var(--radius-none)] overflow-hidden shadow-[var(--shadow-md)] [--ink:var(--code-text)] [--green:var(--lime)] [--soft:var(--green-hover)] [--line:var(--code-line)] [&_pre]:py-5 [&_pre]:px-6 [&_pre]:text-[12px] [&_pre]:leading-[1.85] [&_pre]:min-h-[270px] [&_pre]:overflow-auto max-[901px]:[&_pre]:text-[10px] max-[901px]:[&_pre]:py-5 max-[901px]:[&_pre]:px-4 max-[641px]:[&_pre]:text-[11px]'
      }
    >
      <div
        className={
          "code-tabs flex justify-between [border-bottom:var(--border-width)_solid_var(--green-hover)] py-0 px-4 [&_>_[role='tablist']]:flex [&_>_[role='tablist']]:flex-wrap"
        }
      >
        <div role="tablist" aria-label="Sample language">
          {Object.keys(snippets).map((l) => (
            <Button
              variant="quiet"
              size="sm"
              key={l}
              role="tab"
              aria-selected={l === language}
              aria-controls="code-panel"
              id={`tab-${l}`}
              onClick={() => {
                setLanguage(l);
                setCopied(false);
              }}
            >
              {l}
            </Button>
          ))}
        </div>
        <Button
          variant="quiet"
          size="sm"
          className="copy"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(snippets[language]);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? 'Copied ✓' : 'Copy ⧉'}
        </Button>
      </div>
      <pre id="code-panel" role="tabpanel" aria-labelledby={`tab-${language}`}>
        <code>{snippets[language]}</code>
      </pre>
      <div
        className={
          'code-footer flex items-center gap-y-2 gap-x-2 [border-top:var(--border-width)_solid_var(--green-hover)] py-3 px-5 text-[9px] [color:var(--code-muted)] [&_>_span:last-child]:ml-auto'
        }
      >
        <span
          className={
            'status-dot inline-block w-[6px] h-[6px] rounded-[var(--radius-round)] bg-brand shrink-0'
          }
        />
        Illustrative sample
        <span aria-live="polite">{copied ? 'Copied to clipboard' : 'No live request'}</span>
      </div>
    </div>
  );
}
