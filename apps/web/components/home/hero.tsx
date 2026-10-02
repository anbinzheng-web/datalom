'use client';
import { useEffect, useRef, useState } from 'react';
import { PlatformIcon } from '@/components/platform-icon';
import { Button, ButtonLink, Table } from '@/components/ui';

const samples = {
  TikTok: [
    ['A small garden in the city', 128400, 8420, 326],
    ['Making everyday things better', 86210, 5610, 218],
    ['A weekend off the grid', 54820, 3240, 147],
    ['Morning at the local market', 36750, 2150, 96],
  ],
  Instagram: [
    ['Objects with a second life', 42180, 3820, 164],
    ['The quiet side of the city', 31920, 2640, 112],
    ['A study in natural light', 28450, 2180, 89],
    ['Colors of the changing season', 19680, 1450, 63],
  ],
  YouTube: [
    ['Designing a smaller home', 216400, 12480, 642],
    ['Inside a working studio', 143820, 8960, 418],
    ['Learning to grow your own food', 97650, 6340, 287],
    ['A walk through the old town', 72410, 4820, 196],
  ],
  Facebook: [
    ['A neighborhood worth exploring', 67400, 4260, 238],
    ['Inside a community workshop', 38200, 2840, 176],
    ['An afternoon by the river', 21900, 1560, 94],
    ['Sharing recipes across generations', 16480, 1120, 68],
  ],
  X: [
    ['Notes on building in public', 18400, 1240, 86],
    ['A small experiment in design', 12600, 860, 54],
    ['What we learned this week', 8900, 620, 38],
    ['An idea worth revisiting', 6350, 430, 27],
  ],
} as const;

type Platform = keyof typeof samples;

function PlatformSources({
  platform,
  onSelect,
}: {
  platform: Platform;
  onSelect: (platform: Platform) => void;
}) {
  return (
    <aside className="flex min-h-0 flex-col gap-3 self-stretch border-b border-line bg-soft p-4 md:border-r md:border-b-0 md:py-5">
      <p className="shrink-0 px-3 text-[11px] font-medium text-muted">PLATFORM SOURCES</p>
      <div
        className="flex min-h-0 max-h-[112px] flex-wrap gap-2 overflow-y-auto p-1 md:max-h-none md:flex-1 md:flex-col md:flex-nowrap"
        aria-label="Platform sources"
      >
        {(Object.keys(samples) as (keyof typeof samples)[]).map((name) => (
          <Button
            key={name}
            variant="quiet"
            size="sm"
            aria-pressed={name === platform}
            onClick={() => onSelect(name)}
            className="justify-start px-3 aria-pressed:border-transparent! aria-pressed:bg-brand/10!"
          >
            <PlatformIcon platform={name.toLowerCase()} />
            {name}
          </Button>
        ))}
      </div>
    </aside>
  );
}

const apiSamples = {
  TikTok: {
    path: '/api/v1/tiktok/web/video/detail',
    query: 'video_id=7685551053554617613',
    response: `{
  "id": "7685551053554617613",
  "desc": "A small garden in the city",
  "author": { "uniqueId": "urban.notes" },
  "stats": { "playCount": 128400 }
}`,
  },
  Instagram: {
    path: '/api/v1/instagram/web/media/detail',
    query: 'media_id=3840123456789012345',
    response: `{
  "items": [{
    "id": "3840123456789012345",
    "user": { "username": "everyday.objects" },
    "play_count": 42180
  }]
}`,
  },
  YouTube: {
    path: '/api/v1/youtube/web/video/detail',
    query: 'video_id=dQw4w9WgXcQ',
    response: `{
  "metadata": {
    "videoMetadataRenderer": {
      "title": "Designing a smaller home",
      "lengthSeconds": "842"
    }
  }
}`,
  },
  Facebook: {
    path: '/api/v1/facebook/web/reel/detail',
    query: 'video_id=1234567890123456',
    response: `{
  "data": {
    "video": {
      "id": "1234567890123456"
    }
  }
}`,
  },
  X: {
    path: '/api/v1/x/web/post/detail',
    query: 'post_id=1840123456789012345',
    response: `{
  "data": {
    "tweetResult": {
      "result": { "rest_id": "1840123456789012345" }
    }
  }
}`,
  },
} satisfies Record<Platform, { path: string; query: string; response: string }>;

export function HeroSection() {
  const [slide, setSlide] = useState<'api' | 'datasets'>('datasets');
  const [focused, setFocused] = useState(false);
  const [progress, setProgress] = useState(0);
  const elapsed = useRef(0);
  const [hovered, setHovered] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [visible, setVisible] = useState(false);
  const carousel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener('change', update);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      threshold: 0.3,
    });
    if (carousel.current) observer.observe(carousel.current);
    return () => {
      query.removeEventListener('change', update);
      observer.disconnect();
    };
  }, []);
  useEffect(() => {
    if (focused || hovered || reducedMotion || !visible) return;
    let previous = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const delta = now - previous;
      previous = now;
      if (document.hidden) return;
      elapsed.current += Math.min(delta, 100);
      if (elapsed.current >= 8000) {
        elapsed.current = 0;
        setSlide((current) => (current === 'datasets' ? 'api' : 'datasets'));
      }
      setProgress(elapsed.current / 8000);
    }, 50);
    return () => window.clearInterval(timer);
  }, [focused, hovered, reducedMotion, visible]);
  const chooseSlide = (next: 'api' | 'datasets') => {
    elapsed.current = 0;
    setProgress(0);
    setSlide(next);
  };
  const [platform, setPlatform] = useState<keyof typeof samples>('TikTok');
  const api = apiSamples[platform];
  const [format, setFormat] = useState<'JSON' | 'CSV' | 'Parquet'>('Parquet');
  const records = samples[platform].map(([title, views, likes, comments], index) => ({
    title,
    views,
    likes,
    comments,
    source_url: `https://example.com/sample-video-${index + 1}`,
  }));
  return (
    <section className="mx-auto max-w-[1240px] px-5 pt-12 md:px-10 md:pt-16">
      <div className="text-center">
        <div className="mb-5 flex flex-col items-center justify-center gap-2 sm:flex-row sm:gap-3">
          <div className="flex shrink-0 items-center gap-3" aria-hidden="true">
            <svg viewBox="0 0 48 48" className="size-9">
              <circle cx="24" cy="24" r="23" fill="#003399" />
              {Array.from({ length: 12 }, (_, index) => {
                const angle = (index * Math.PI) / 6 - Math.PI / 2;
                // Normalize floating-point differences between server and browser runtimes.
                return (
                  <text
                    key={index}
                    x={(24 + 16 * Math.cos(angle)).toFixed(6)}
                    y={(24 + 16 * Math.sin(angle)).toFixed(6)}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize="6"
                    fill="#FFCC00"
                  >
                    ★
                  </text>
                );
              })}
              <text
                x="24"
                y="24"
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="9"
                fontWeight="bold"
                fill="#fff"
                fontFamily="system-ui, sans-serif"
              >
                GDPR
              </text>
            </svg>
            <svg viewBox="0 0 48 48" className="size-9">
              <path
                d="M24 2 42 9v13c0 11.5-7.7 20.4-18 24C13.7 42.4 6 33.5 6 22V9l18-7z"
                fill="#B7950B"
              />
              <path
                d="M24 5.2 39 11v11c0 9.9-6.5 17.6-15 20.8C15.5 39.6 9 31.9 9 22V11l15-5.8z"
                fill="#F5C518"
              />
              <text
                x="24"
                y="23"
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="8.5"
                fontWeight="bold"
                fill="#5C4500"
                fontFamily="system-ui, sans-serif"
              >
                CCPA
              </text>
              <path
                d="m17.5 31.5 4.5 4.5 9-9"
                stroke="#5C4500"
                strokeWidth="2.5"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <p className="max-w-[480px] text-xs leading-relaxed text-muted sm:max-w-none sm:text-[13px]">
            Public data, collected responsibly with GDPR and CCPA in mind.
          </p>
        </div>
        <h1 className="text-[36px] leading-[1.08] font-medium sm:text-[56px] lg:text-[68px]">
          The world's content.
          <br />
          <span className="text-brand">Ready for your next idea.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-[560px] text-base leading-[1.7] text-muted md:text-[17px]">
          Explore public posts, videos, and conversations.
          <br className="hidden sm:block" /> Bring structured data into your research, apps, and AI.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/datasets" size="xl">
            Explore datasets
          </ButtonLink>
          <ButtonLink href="/docs/api" variant="secondary" size="xl">
            View API docs
          </ButtonLink>
        </div>
      </div>
      <div
        ref={carousel}
        role="region"
        aria-roledescription="carousel"
        aria-label="Explore API and datasets"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
        }}
        className="mt-12"
      >
        <div className="flex h-[620px] flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-[var(--shadow-md)] md:h-[440px]">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 md:px-7">
            <h2 className="text-sm font-medium">Two ways to build with public data</h2>
            <span className="font-mono text-[11px] text-muted">ILLUSTRATIVE SAMPLE</span>
          </div>
          <div
            className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)]"
            aria-live={!focused && !hovered && !reducedMotion ? 'off' : 'polite'}
          >
            <div
              id="hero-api"
              role="group"
              aria-roledescription="slide"
              aria-label="2 of 2: API"
              aria-hidden={slide !== 'api'}
              inert={slide !== 'api'}
              className={`col-start-1 row-start-1 grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] transition-[opacity,transform] duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transform-none motion-reduce:transition-none md:grid-cols-[210px_minmax(0,1fr)] md:grid-rows-1 ${slide === 'api' ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-full opacity-0'}`}
            >
              <PlatformSources platform={platform} onSelect={setPlatform} />
              <div className="min-h-0 min-w-0 overflow-y-auto p-5 md:px-7">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-[17px] font-medium">{platform} · API request</h3>
                    <p className="mt-1 text-xs text-muted">
                      Connect public platform data to your application.
                    </p>
                  </div>
                  <span className="text-xs text-brand">REST API</span>
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="min-w-0 rounded-md border border-line bg-soft">
                    <p className="border-b border-line px-4 py-3 text-xs font-medium">
                      Request · cURL
                    </p>
                    <pre className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] p-4 font-mono text-xs leading-5 text-ink">{`curl --get "$DATALOM_API_BASE${api.path}" \\
  --header "Authorization: Bearer $DATALOM_API_KEY" \\
  --data-urlencode "${api.query}"`}</pre>
                  </div>
                  <div className="min-w-0 rounded-md border border-line bg-soft">
                    <p className="border-b border-line px-4 py-3 text-xs font-medium">
                      Response · Illustrative excerpt
                    </p>
                    <pre className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] p-4 font-mono text-xs leading-5 text-brand">
                      {api.response}
                    </pre>
                  </div>
                </div>
                <p className="mt-4 text-[11px] text-muted">
                  Example only · No live request is sent. Explore the API docs for the full response
                  schema.
                </p>
              </div>
            </div>
            <div
              id="hero-datasets"
              role="group"
              aria-roledescription="slide"
              aria-label="1 of 2: Datasets"
              aria-hidden={slide !== 'datasets'}
              inert={slide !== 'datasets'}
              className={`col-start-1 row-start-1 grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] transition-[opacity,transform] duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transform-none motion-reduce:transition-none md:grid-cols-[210px_minmax(0,1fr)] md:grid-rows-1 ${slide === 'datasets' ? 'translate-x-0 opacity-100' : 'pointer-events-none -translate-x-full opacity-0'}`}
            >
              <PlatformSources platform={platform} onSelect={setPlatform} />
              <div className="min-h-0 min-w-0 overflow-y-auto p-5 md:px-7">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-[17px] font-medium">
                      {platform} · {platform === 'X' ? 'Post records' : 'Video records'}
                    </h3>
                    <p className="mt-1 text-xs text-muted">
                      Content, context, and engagement in one schema.
                    </p>
                  </div>
                  <div className="flex rounded-sm bg-soft p-0.5" aria-label="Data format">
                    {(['JSON', 'CSV', 'Parquet'] as const).map((name) => (
                      <Button
                        key={name}
                        variant="quiet"
                        size="xs"
                        aria-pressed={format === name}
                        onClick={() => setFormat(name)}
                      >
                        {name}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="min-h-[172px]" aria-live="polite">
                  {format === 'Parquet' ? (
                    <div className="min-w-0 overflow-x-auto">
                      <Table className="min-w-[560px] table-fixed text-xs" aria-label="Dataset preview">
                        <thead>
                          <tr>
                            {['Title', 'Views', 'Likes', 'Comments'].map((key) => (
                              <th
                                key={key}
                                scope="col"
                                className={key === 'Title' ? 'w-[38%]' : undefined}
                              >
                                {key}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {records.map((record) => (
                            <tr key={record.title}>
                              <td className="font-medium">{record.title}</td>
                              <td className="font-mono text-muted">
                                {record.views.toLocaleString('en-US')}
                              </td>
                              <td className="font-mono text-muted">{record.likes.toLocaleString('en-US')}</td>
                              <td className="font-mono text-muted">{record.comments.toLocaleString('en-US')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </div>
                  ) : (
                    <pre className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded-sm bg-soft p-4 font-mono text-xs leading-5 text-brand">
                      {format === 'CSV'
                        ? [
                            'title,views,likes,comments',
                            ...records.map(({ title, views, likes, comments }) =>
                              [JSON.stringify(title), views, likes, comments].join(','),
                            ),
                          ].join('\n')
                        : `{\n  \"platform\": \"${platform.toLowerCase()}\",\n  \"records\": [{\n${Object.entries(
                            records[0],
                          )
                            .map(
                              ([key, value]) =>
                                `    ${JSON.stringify(key)}: ${JSON.stringify(value)}`,
                            )
                            .join(',\n')}\n  }]\n}`}
                    </pre>
                  )}
                </div>
                <div className="mt-4 flex flex-wrap justify-between gap-2 text-[11px] text-muted">
                  <span>
                    {format === 'JSON' ? '1 sample record' : `${records.length} sample records`} · Preview only
                  </span>
                  {format === 'Parquet' && <span>Parquet · Decoded table preview</span>}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="mx-auto my-5 flex w-fit items-center gap-1 rounded-md bg-soft p-1">
          {(['datasets', 'api'] as const).map((item, index) => (
            <Button
              key={item}
              variant="quiet"
              size="sm"
              className="relative min-w-[140px] overflow-hidden pb-3 text-muted aria-pressed:border-transparent! aria-pressed:bg-surface! aria-pressed:text-ink!"
              aria-pressed={slide === item}
              aria-controls={`hero-${item}`}
              onClick={() => chooseSlide(item)}
            >
              {index === 0 ? '01 · Datasets' : '02 · API calls'}
              {slide === item && !reducedMotion && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-4 bottom-1 h-0.5 rounded-full bg-line"
                >
                  <span
                    className="block h-full origin-left rounded-full bg-brand"
                    style={{ transform: `scaleX(${progress})` }}
                  />
                </span>
              )}
            </Button>
          ))}
        </div>
      </div>
    </section>
  );
}
