import type { ReactNode } from 'react';

const palette = ['#4656c8', '#26745e', '#704a9b', '#805b12'];
function Figure({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <figure className="min-w-0 rounded-lg bg-soft p-6 text-ink sm:p-8">
      <figcaption>
        <h3 className="text-xl font-medium">{title}</h3>
        <p className="mt-2 text-xs leading-6 text-muted">
          Illustrative data · Not a Datalom measurement
        </p>
      </figcaption>
      {children}
      <p className="mt-5 text-sm leading-7 text-muted">{note}</p>
    </figure>
  );
}

export function CorpusChart() {
  const bins = [12, 27, 34, 18, 9];
  return (
    <div className="mb-10 grid gap-5 lg:grid-cols-2">
      <Figure
        title="A corpus has a distribution."
        note="A dominant source can dominate the learned behavior. Compare this mix with the population your model should serve."
      >
        <div className="mt-7 flex flex-col items-center gap-6 sm:flex-row sm:gap-10">
          <svg
            viewBox="0 0 160 160"
            role="img"
            aria-label="Illustrative source mix: discussions 45%, comments 30%, descriptions 15%, profiles 10%."
            className="w-[140px] shrink-0 sm:w-[170px]"
          >
            {[45, 30, 15, 10].map((value, i, values) => (
              <circle
                key={i}
                cx="80"
                cy="80"
                r="59"
                fill="none"
                stroke={palette[i]}
                strokeWidth="19"
                pathLength="100"
                strokeDasharray={`${value - 1} ${101 - value}`}
                strokeDashoffset={-values.slice(0, i).reduce((a, b) => a + b, 0)}
                transform="rotate(-90 80 80)"
              />
            ))}
            <text x="80" y="78" textAnchor="middle" className="fill-ink text-[24px] font-medium">
              10k
            </text>
            <text x="80" y="99" textAnchor="middle" className="fill-muted text-[11px]">
              demo records
            </text>
          </svg>
          <ul className="w-full flex-1 space-y-4 text-sm">
            {['Discussions', 'Comments', 'Descriptions', 'Profiles'].map((label, i) => (
              <li key={label} className="flex flex-wrap items-center gap-2">
                <svg width="9" height="9" aria-hidden="true">
                  <rect width="9" height="9" rx="2" fill={palette[i]} />
                </svg>
                <span>{label}</span>
                <span className="ml-auto font-mono">{[45, 30, 15, 10][i]}%</span>
              </li>
            ))}
          </ul>
        </div>
      </Figure>
      <Figure
        title="Length changes the learning problem."
        note="Short records favor local signals. Long records need a deliberate context and truncation policy. Character counts here are not token counts."
      >
        <div className="mt-7 flex justify-between text-xs text-muted">
          <span>Share of records</span>
          <span>0–40%</span>
        </div>
        <div
          className="mt-3 grid h-[170px] grid-cols-5 items-end gap-3"
          role="img"
          aria-label="Illustrative character-length distribution: 0–100: 12%; 101–300: 27%; 301–1000: 34%; 1001–3000: 18%; over 3000: 9%."
        >
          {bins.map((value, i) => (
            <div key={i} className="flex h-full flex-col justify-end gap-2 text-center">
              <span className="font-mono text-xs text-muted">{value}%</span>
              <svg
                viewBox="0 0 40 160"
                preserveAspectRatio="none"
                className="h-[136px] w-full"
                aria-hidden="true"
              >
                <rect
                  x="0"
                  y={160 - value * 4}
                  width="40"
                  height={value * 4}
                  rx="3"
                  fill={i === 2 ? palette[1] : '#a9b2ed'}
                />
              </svg>
              <span className="text-[11px] text-muted">
                {['≤100', '≤300', '≤1k', '≤3k', '>3k'][i]}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-right text-xs text-muted">Characters per record · Exclusive bins</p>
      </Figure>
    </div>
  );
}

export function SplitChart() {
  return (
    <figure className="mt-8 rounded-lg bg-white p-6 sm:p-8">
      <figcaption className="grid gap-4 md:grid-cols-2">
        <h3 className="text-xl font-medium">Split groups, not individual replies.</h3>
        <p className="text-sm leading-7 text-muted">
          Illustrative assignment of 10 conversation threads. Each block is one thread; its replies
          travel together. Group counts do not imply equal record counts.
        </p>
      </figcaption>
      <div
        className="mt-7 grid grid-cols-5 gap-2 sm:grid-cols-10"
        role="img"
        aria-label="Threads 1 through 8 assigned to training, thread 9 to validation, thread 10 to test."
      >
        {Array.from({ length: 10 }, (_, i) => (
          <div
            key={i}
            className={`rounded-md p-3 text-center ${i < 8 ? 'bg-lime text-brand' : i === 8 ? 'bg-[var(--teal-soft)] text-[var(--teal)]' : 'bg-[var(--purple-soft)] text-[var(--purple)]'}`}
          >
            <span className="font-mono text-xs">T{i + 1}</span>
            <div className="mt-3 space-y-1" aria-hidden="true">
              {[0, 1, 2].map((j) => (
                <div key={j} className="h-1 rounded-sm bg-current opacity-40" />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap gap-6 text-sm">
        <span className="text-brand">Training · 8 groups</span>
        <span className="text-[var(--teal)]">Validation · 1 group</span>
        <span className="text-[var(--purple)]">Test · 1 group</span>
      </div>
    </figure>
  );
}

export function QualityChart() {
  const rows = [
    ['Source records', 10000, '#4656c8'],
    ['After exact deduplication', 8800, '#7785d8'],
    ['After near-duplicate review', 8200, '#9580bb'],
    ['After task-specific filtering', 7600, '#26745e'],
  ] as const;
  return (
    <div className="mb-9">
      <Figure
        title="Account for every record you exclude."
        note="Sequential example: 1,200 exact duplicates, 600 additional near-duplicates, and 600 task-ineligible records are removed. Retention is 76%; that is not a quality score."
      >
        <div className="mt-7 space-y-5">
          {rows.map(([label, value, color]) => (
            <div key={label} className="grid items-center gap-2 sm:grid-cols-[220px_1fr_70px]">
              <span className="text-sm">{label}</span>
              <svg
                viewBox="0 0 100 12"
                preserveAspectRatio="none"
                className="h-7 w-full"
                role="img"
                aria-label={`${label}: ${value.toLocaleString('en-US')} records`}
              >
                <rect width="100" height="12" fill="#e8ecf3" rx="1" />
                <rect width={value / 100} height="12" fill={color} rx="1" />
              </svg>
              <span className="text-right font-mono text-sm">{value.toLocaleString('en-US')}</span>
            </div>
          ))}
        </div>
      </Figure>
    </div>
  );
}

export function EvaluationChart() {
  const slices = [
    ['Short / single aspect', 0.88, 400],
    ['Long context', 0.74, 160],
    ['Mixed feedback', 0.61, 120],
    ['Rare classes', 0.53, 60],
  ] as const;
  return (
    <div className="mt-10">
      <Figure
        title="An overall result can hide a difficult slice."
        note="Synthetic aspect-classification scores for an unnamed model. Slices may overlap. Compare sample counts and uncertainty before interpreting differences; these are not measured model results."
      >
        <div className="mt-6 space-y-5">
          {slices.map(([label, value, count], i) => (
            <div key={label} className="grid items-center gap-2 sm:grid-cols-[210px_1fr_110px]">
              <span className="text-sm">{label}</span>
              <svg
                viewBox="0 0 100 10"
                preserveAspectRatio="none"
                className="h-6 w-full"
                role="img"
                aria-label={`${label}: illustrative Macro-F1 ${value}, n=${count}`}
              >
                <rect width="100" height="10" rx="1" fill="#e8ecf3" />
                <rect width={value * 100} height="10" rx="1" fill={palette[i]} />
              </svg>
              <span className="font-mono text-xs sm:text-right">
                {value.toFixed(2)} · n={count}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-right text-xs text-muted">
          Macro-F1 · Fixed scale 0–1 · Higher is better
        </p>
      </Figure>
    </div>
  );
}
