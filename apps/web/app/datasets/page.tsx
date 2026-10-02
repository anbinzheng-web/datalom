import {
  CorpusChart,
  SplitChart,
  QualityChart,
  EvaluationChart,
} from '@/components/datasets/charts';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { AccordionItem, ButtonLink, Table } from '@/components/ui';
import { DatasetExplorer } from '@/components/datasets/explorer';
import {
  datasetProduct,
  datasetExamples,
  objectiveRows,
  engineeringSteps,
  qualityRows,
  datasetFaq,
} from '@/lib/datasets';
import { metadataFor, siteUrl } from '@/lib/seo';

export const metadata = metadataFor(datasetProduct.title, datasetProduct.description, '/datasets');
const wrap =
  'mx-auto w-[min(1240px,calc(100%-112px))] max-lg:w-[calc(100%-64px)] max-sm:w-[calc(100%-40px)]';
function Heading({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-10 max-w-[850px]">
      <h2 className="text-[length:var(--text-section)] font-medium leading-[1.2]">{title}</h2>
      <p className="mt-5 max-w-[760px] text-base leading-[1.7] text-muted">{children}</p>
    </div>
  );
}
function Matrix({ headers, rows, label }: { headers: string[]; rows: string[][]; label: string }) {
  return (
    <div className="overflow-x-auto rounded-md" tabIndex={0} role="region" aria-label={label}>
      <Table className="w-full min-w-[740px]">
        <caption className="sr-only">{label}</caption>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header} scope="col">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([first, ...rest]) => (
            <tr key={first}>
              <th scope="row" className="w-[24%] font-medium">
                {first}
              </th>
              {rest.map((cell) => (
                <td key={cell}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
export default function DatasetsPage() {
  return (
    <main id="main-content" className="bg-paper text-ink">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: siteUrl },
              { '@type': 'ListItem', position: 2, name: 'Datasets', item: `${siteUrl}/datasets` },
            ],
          }).replace(/</g, '\\u003c'),
        }}
      />
      <header className={`${wrap} pb-16 sm:pb-24`}>
        <div className="pt-14 pb-12 sm:pt-20">
          <h1 className="max-w-[940px] text-[length:var(--text-page)] font-medium leading-[1.1]">
            {datasetProduct.title}
          </h1>
          <p className="mt-6 max-w-[760px] text-base leading-[1.8] text-muted">
            {datasetProduct.description}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="#examples" size="xl">
              Inspect dataset examples
            </ButtonLink>
            <ButtonLink href="#engineering" variant="secondary" size="xl">
              Explore training workflows
            </ButtonLink>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg bg-soft">
          <div className="flex flex-wrap justify-between gap-3 px-6 py-4 text-xs text-muted">
            <span>Authored demonstration · Not inventory</span>
          </div>
          <div className="grid lg:grid-cols-[1.2fr_1fr_1fr]">
            <div className="bg-ink p-6 text-white sm:p-8">
              <blockquote className="text-xl leading-[1.6]">
                “{datasetExamples[0].record.text}”
              </blockquote>
              <p className="mt-7 font-mono text-xs leading-6 text-white/70">
                record_id: demo-comment-02
                <br />
                thread_id: demo-thread-01
                <br />
                parent_id: demo-comment-01
              </p>
            </div>
            <div className="bg-white p-6 sm:p-8">
              <dl className="space-y-4 text-sm">
                {[
                  ['text', 'string · source content'],
                  ['parent_id', 'string | null · reply context'],
                  ['published_at', 'datetime · content time'],
                  ['collected_at', 'datetime · observation time'],
                ].map(([key, value]) => (
                  <div key={key}>
                    <dt className="font-mono">{key}</dt>
                    <dd className="mt-1 text-muted">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="bg-lime p-6 sm:p-8">
              <h2 className="text-xl font-medium">One record. Two aspects.</h2>
              <div className="mt-5 space-y-3 text-sm">
                <p>
                  Search speed <span className="block font-mono text-brand">positive</span>
                </p>
                <p>
                  Exact-match recall <span className="block font-mono text-brand">negative</span>
                </p>
              </div>
              <p className="mt-6 text-xs leading-6 text-muted">
                Illustrative annotations, not source fields. Mixed feedback needs an explicit
                labeling policy.
              </p>
            </div>
          </div>
        </div>
        <nav
          aria-label="On this page"
          className="mt-7 flex flex-wrap gap-x-7 gap-y-3 text-sm text-muted"
        >
          {[
            ['#objectives', 'Corpus fit'],
            ['#engineering', 'Data engineering'],
            ['#quality', 'Quality'],
            ['#evaluation', 'Evaluation'],
            ['#examples', 'Examples'],
            ['#delivery', 'Delivery'],
          ].map(([href, label]) => (
            <Link key={href} href={href} className="hover:text-brand hover:underline">
              {label}
            </Link>
          ))}
        </nav>
      </header>
      <section id="objectives" className={`${wrap} scroll-mt-24 pb-20 sm:pb-28`}>
        <Heading title="Match the corpus to the objective.">
          A source collection is not a training objective. Start with the behavior you want to
          learn, then identify the transformations and supervision that are still missing.
        </Heading>
        <CorpusChart />
        <Matrix
          label="Training objectives and required preparation"
          headers={['Objective', 'Source material', 'Required preparation']}
          rows={objectiveRows}
        />
        <p className="mt-5 max-w-[900px] text-sm leading-7 text-muted">
          Reply relationships do not establish answer quality. Likes and views do not establish
          preference labels. Both can inform a research design, but neither replaces task-specific
          validation.
        </p>
      </section>
      <section id="engineering" className="scroll-mt-20 bg-soft py-16 sm:py-24">
        <div className={wrap}>
          <Heading title="From source records to controlled training examples.">
            Follow one discussion record through a reproducible preparation workflow. These are
            recommended engineering steps, not processing guarantees for every Datalom collection.
          </Heading>
          <div>
            {engineeringSteps.map((step, index) => (
              <article
                key={step.title}
                className="grid gap-6 py-8 first:pt-0 lg:grid-cols-[56px_1.2fr_1fr] lg:gap-8"
              >
                <span className="font-mono text-[28px] text-brand/60">0{index + 1}</span>
                <div>
                  <h3 className="text-2xl font-medium leading-[1.3]">{step.title}</h3>
                  <p className="mt-4 text-base leading-[1.8] text-muted">{step.body}</p>
                  <p className="mt-5 text-sm leading-7 text-brand">{step.evidence}</p>
                </div>
                <pre
                  tabIndex={0}
                  aria-label={`Illustrative processing step ${index + 1}`}
                  className="overflow-x-auto rounded-md bg-surface p-6 font-mono text-xs leading-7 text-ink"
                >
                  <code>{step.code}</code>
                </pre>
              </article>
            ))}
          </div>
          <SplitChart />
          <div className="mt-6 rounded-md bg-lime p-6 text-sm leading-7">
            <strong className="font-medium">Source → derived sample → experiment.</strong> Retain
            the mapping between all three. If a result changes, you should be able to distinguish a
            corpus change from a transformation, split, or model change.
          </div>
        </div>
      </section>
      <section id="quality" className={`${wrap} scroll-mt-24 py-16 sm:py-24`}>
        <Heading title="Assess quality before you train.">
          Quality is fitness for a task, not a universal score. Ask for observable checks and
          inspect the failures behind the aggregate.
        </Heading>
        <QualityChart />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-xs">
          <span className="text-muted">Checks to request · Not a measured quality report</span>
        </div>
        <Matrix
          label="Dataset quality review framework"
          headers={['Dimension', 'Evidence to inspect', 'Why it matters']}
          rows={qualityRows}
        />
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <p className="text-sm leading-7 text-muted">
            <strong className="font-medium text-ink">Define the denominator.</strong> A
            missing-field rate needs a field, a population, and a handling rule. A duplicate rate
            needs a matching method and threshold. Record both before comparing releases.
          </p>
          <p className="text-sm leading-7 text-muted">
            <strong className="font-medium text-ink">Inspect what was excluded.</strong> Filtering
            can remove useful minority-language or long-tail examples. Review exclusion samples
            alongside retained data and document the tradeoff.
          </p>
        </div>
      </section>
      <section id="evaluation" className="scroll-mt-20 bg-ink py-16 text-white sm:py-24">
        <div className={wrap}>
          <h2 className="max-w-[760px] text-[length:var(--text-section)] font-medium leading-[1.2]">
            Build evaluations you can trust.
          </h2>
          <p className="mt-5 max-w-[760px] text-base leading-[1.8] text-white/70">
            A collection becomes a benchmark only when the task, split, scoring policy, and version
            are defined. Test the experimental design as carefully as the model.
          </p>
          <EvaluationChart />
          <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_1.1fr]">
            <div className="space-y-8">
              {[
                [
                  'Independence before scoring',
                  'Audit duplicates, entity overlap, and temporal leakage between accessible training and evaluation sets. Unknown model pretraining data prevents a blanket claim of zero contamination.',
                ],
                [
                  'Slices before averages',
                  'Report performance by language, topic, length, source, and long-tail class. Include sample counts; small slices should not support broad conclusions.',
                ],
                [
                  'Metrics matched to the task',
                  'Use per-class results and Macro-F1 for classification; Recall@k and nDCG for retrieval. For generation, define a rubric, fact checks, or human review. Audit model-judge agreement when used.',
                ],
                [
                  'A comparison you can reproduce',
                  'Fix corpus version, prompt, model configuration, and scoring policy. Record seeds where relevant and uncertainty where sample size supports it.',
                ],
              ].map(([title, body]) => (
                <div key={title}>
                  <h3 className="text-xl font-medium">{title}</h3>
                  <p className="mt-3 text-sm leading-7 text-white/70">{body}</p>
                </div>
              ))}
            </div>
            <article className="self-start rounded-lg bg-white p-6 text-ink sm:p-8">
              <p className="font-mono text-xs text-brand">Authored evaluation example</p>
              <h3 className="mt-5 text-2xl font-medium">An average sentiment hides the failure.</h3>
              <dl className="mt-7 space-y-6 text-sm leading-7">
                <div>
                  <dt className="text-xs text-muted">INPUT</dt>
                  <dd className="mt-2 rounded-md bg-soft p-4">{datasetExamples[0].record.text}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">ILLUSTRATIVE MODEL OUTPUT</dt>
                  <dd className="mt-2 font-mono">sentiment: positive</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">TARGET CRITERION</dt>
                  <dd className="mt-2">
                    Preserve both aspects: improved speed and negative feedback about exact-match
                    recall.
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">FAILURE ATTRIBUTION</dt>
                  <dd className="mt-2">
                    A single-label task collapses mixed feedback. Check the task definition and
                    annotation policy before attributing the entire error to the model.
                  </dd>
                </div>
              </dl>
              <p className="mt-7 rounded-md bg-lime p-4 text-sm leading-7 text-brand">
                Next check: review contrastive statements in a dedicated slice and compare
                aspect-level predictions.
              </p>
            </article>
          </div>
        </div>
      </section>
      <section id="examples" className={`${wrap} scroll-mt-24 py-16 sm:py-24`}>
        <Heading title="Inspect the data behind the workflow.">
          Examine illustrative records, field semantics, and task boundaries. These examples explain
          the data concepts; final schemas, coverage, and inventory remain to be published.
        </Heading>
        <DatasetExplorer />
      </section>
      <section className={`${wrap} pb-16 sm:pb-24`}>
        <Heading title="The same corpus. A different data contract.">
          Training examples encode supervision. Retrieval units must preserve enough context to
          answer a query and lead back to the source.
        </Heading>
        <div className="grid gap-1 rounded-lg bg-soft p-2 md:grid-cols-4">
          {[
            [
              'Source record',
              'Keep provenance and thread context. A reply detached from its parent can change meaning.',
            ],
            [
              'Document chunk',
              'Choose boundaries by semantic unit and token budget. Retain overlap only where context requires it.',
            ],
            [
              'Retrieval unit',
              'Associate text with source IDs, time, and filters. Keep indexing transformations versioned.',
            ],
            [
              'Relevance evaluation',
              'Define queries and graded relevance. Check hard negatives and compare retrieval with reranking.',
            ],
          ].map(([title, body], i) => (
            <div key={title} className="p-5">
              <p className="mb-4 font-mono text-xs text-brand">0{i + 1}</p>
              <h3 className="text-xl font-medium">{title}</h3>
              <p className="mt-3 text-sm leading-7 text-muted">{body}</p>
            </div>
          ))}
        </div>
        <p className="mt-5 text-sm leading-7 text-muted">
          A snapshot provides bounded context, not live knowledge. This workflow does not imply a
          hosted vector database or managed RAG service.
        </p>
      </section>
      <section id="delivery" className="scroll-mt-20 bg-soft py-16 sm:py-24">
        <div className={wrap}>
          <Heading title="Know what enters your pipeline.">
            Before integrating a release, verify the data contract and the conditions that apply to
            your intended use.
          </Heading>
          <div className="grid gap-8 lg:grid-cols-[1fr_2fr]">
            <div>
              <h3 className="text-2xl font-medium">Dataset release sheet</h3>
              <p className="mt-4 text-sm leading-7 text-muted">{datasetProduct.availability}</p>
              <p className="mt-4 text-sm leading-7 text-muted">
                Public accessibility does not grant unrestricted training or commercial rights.
              </p>
              <Link
                href="/legal/data-policy"
                className="mt-5 inline-block text-sm text-brand hover:underline"
              >
                Read the data policy
              </Link>
            </div>
            <dl className="space-y-2">
              {[
                ['Scope', 'Sources, coverage window, languages, selection criteria.'],
                ['Schema', 'Field definitions, null semantics, formats, and sample records.'],
                [
                  'Processing',
                  'Raw versus derived content, transformations, and annotation origins.',
                ],
                [
                  'Reproducibility',
                  'Version, record count, quality evidence, and known limitations.',
                ],
                [
                  'Use conditions',
                  'Applicable permissions and restrictions for the intended task.',
                ],
              ].map(([title, body]) => (
                <div
                  key={title}
                  className="grid gap-2 rounded-md bg-white p-5 sm:grid-cols-[140px_1fr]"
                >
                  <dt className="font-medium">{title}</dt>
                  <dd className="text-sm leading-6 text-muted">
                    {body}
                    <span className="mt-2 block text-xs">
                      Release-specific details pending publication
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-between gap-5 rounded-md bg-lime p-6">
            <div>
              <p className="font-medium">Standard structured datasets · $0.20 / 1,000 records</p>
              <p className="mt-2 text-sm text-muted">
                $5 minimum · One-time snapshot · Estimate only; checkout is not open
              </p>
            </div>
            <ButtonLink href="/pricing" variant="secondary">
              View pricing details
            </ButtonLink>
          </div>
        </div>
      </section>
      <section className={`${wrap} pt-16 pb-20`}>
        <div className="grid gap-10 lg:grid-cols-[1fr_2fr]">
          <h2 className="text-[length:var(--text-section)] font-medium leading-[1.2]">
            Before you build.
          </h2>
          <div className="space-y-2">
            {datasetFaq.map(([question, answer]) => (
              <AccordionItem key={question} title={question}>
                <p>{answer}</p>
              </AccordionItem>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
