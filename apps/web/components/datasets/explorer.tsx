'use client';

import { useState } from 'react';
import { Button, ButtonLink, Table } from '@/components/ui';
import { datasetExamples, datasetProduct } from '@/lib/datasets';

export function DatasetExplorer() {
  const [selected, setSelected] = useState(0);
  const [view, setView] = useState<'table' | 'json'>('table');
  const example = datasetExamples[selected];
  return (
    <div className="min-w-0 rounded-lg bg-soft p-4 sm:p-7">
      <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Dataset type">
        {datasetExamples.map((item, index) => (
          <Button
            key={item.id}
            variant="quiet"
            aria-pressed={selected === index}
            aria-controls="dataset-preview"
            onClick={() => setSelected(index)}
          >
            {item.name}
          </Button>
        ))}
      </div>
      <div id="dataset-preview" className="min-w-0">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-medium">{example.name}</h3>
            <p className="mt-1 text-xs text-muted">
              {datasetProduct.status} · Authored example, not a delivery schema
            </p>
          </div>
          <div className="flex gap-1" role="group" aria-label="Sample format">
            <Button
              size="sm"
              variant="quiet"
              aria-pressed={view === 'table'}
              onClick={() => setView('table')}
            >
              Table
            </Button>
            <Button
              size="sm"
              variant="quiet"
              aria-pressed={view === 'json'}
              onClick={() => setView('json')}
            >
              JSON
            </Button>
          </div>
        </div>
        {view === 'json' ? (
          <pre
            tabIndex={0}
            aria-label="Example JSON record"
            className="min-h-[370px] overflow-x-auto rounded-md bg-ink p-5 font-mono text-sm leading-7 text-white"
          >
            <code>{JSON.stringify(example.record, null, 2)}</code>
          </pre>
        ) : (
          <div
            className="overflow-x-auto rounded-md"
            tabIndex={0}
            role="region"
            aria-label="Example record table"
          >
            <Table className="w-full min-w-[620px]">
              <caption className="sr-only">Illustrative record values</caption>
              <thead>
                <tr>
                  <th scope="col">Field</th>
                  <th scope="col">Example value</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(example.record).map(([key, value]) => (
                  <tr key={key}>
                    <th scope="row" className="font-mono font-normal">
                      {key}
                    </th>
                    <td className="break-words">{value === null ? 'null' : String(value)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
        <div className="mt-7 grid gap-6 lg:grid-cols-[1fr_2fr]">
          <div>
            <h4 className="font-medium">Task fit</h4>
            <p className="mt-2 text-sm leading-6 text-muted">{example.fit}</p>
            <h4 className="mt-5 font-medium">Interpretation limits</h4>
            <p className="mt-2 text-sm leading-6 text-muted">{example.limitation}</p>
            <ButtonLink className="mt-5" variant="secondary" href={`/datasets/${example.id}`}>
              View dataset concept
            </ButtonLink>
          </div>
          <div
            className="overflow-x-auto"
            tabIndex={0}
            role="region"
            aria-label="Example field definitions"
          >
            <Table className="w-full min-w-[520px]">
              <caption className="mb-3 text-left text-sm font-medium">
                Field notes · Example coverage only
              </caption>
              <thead>
                <tr>
                  <th scope="col">Field / type</th>
                  <th scope="col">Meaning & availability</th>
                </tr>
              </thead>
              <tbody>
                {example.fields.map(([field, type, coverage, meaning]) => (
                  <tr key={field}>
                    <th scope="row" className="font-normal">
                      <span className="font-mono">{field}</span>
                      <span className="mt-1 block text-xs text-muted">{type}</span>
                    </th>
                    <td>
                      <span className="mb-1 block text-xs text-brand">{coverage}</span>
                      {meaning}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}
