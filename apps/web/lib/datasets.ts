/** Editorial examples, not inventory or a promised delivery schema. */
export const datasetProduct = {
  title: 'Real-world datasets for training and evaluation.',
  description:
    'Explore public-platform content for domain corpora, task-specific training examples, and reproducible evaluation. Inspect the source material before deciding how it belongs in your pipeline.',
  status: 'Concept preview',
  availability: 'Collections are in preview. Purchasing and downloads are not available yet.',
};

export const datasetExamples = [
  {
    id: 'social-conversations',
    name: 'Discussions & comments',
    fit: 'Text classification, context-aware summarization, and retrieval research.',
    limitation:
      'Replies are conversational context, not verified answers. Thread completeness and annotation quality must be checked before constructing supervised examples.',
    record: {
      record_id: 'demo-comment-02',
      thread_id: 'demo-thread-01',
      parent_id: 'demo-comment-01',
      text: 'The search is faster now, but it still misses exact product codes.',
      language: 'en',
      source_ref: 'demo://discussion/01/02',
      published_at: '2026-01-14T09:20:00Z',
      collected_at: '2026-01-15T08:00:00Z',
    },
    fields: [
      [
        'record_id',
        'string',
        'Required in example',
        'Stable reference for tracing derived samples.',
      ],
      [
        'thread_id / parent_id',
        'string / string | null',
        'Parent may be null',
        'Conversation grouping and reply context; not an answer-quality label.',
      ],
      [
        'text / language',
        'string / string',
        'Present in example',
        'Source text and illustrative language metadata.',
      ],
      [
        'source_ref',
        'string',
        'Synthetic reference',
        'Provenance reference; demo:// is not a live source.',
      ],
      [
        'published_at / collected_at',
        'datetime / datetime',
        'Present in example',
        'Content time and acquisition time have different meanings.',
      ],
    ],
  },
  {
    id: 'tiktok-video-metadata',
    name: 'Video metadata',
    fit: 'Topic classification, text-based content retrieval, and ranking research.',
    limitation:
      'Metadata is not video, audio, captions, or a multimodal training set. Engagement counts are time-bound observations, not relevance judgments.',
    record: {
      record_id: 'demo-video-01',
      description: 'Comparing lexical and semantic search on technical documentation.',
      creator_ref: 'demo-creator-01',
      language: 'en',
      observed_likes: 42,
      source_ref: 'demo://video/01',
      published_at: '2026-01-12T10:00:00Z',
      collected_at: '2026-01-15T08:00:00Z',
    },
    fields: [
      [
        'record_id / creator_ref',
        'string / string',
        'Present in example',
        'Record and entity references for grouping.',
      ],
      [
        'description / language',
        'string / string',
        'Present in example',
        'Descriptive text, not a transcript.',
      ],
      [
        'observed_likes',
        'integer',
        'Illustrative value',
        'A snapshot count; not a preference or quality label.',
      ],
      ['source_ref', 'string', 'Synthetic reference', 'Source provenance placeholder.'],
      [
        'published_at / collected_at',
        'datetime / datetime',
        'Present in example',
        'Separate content time from observation time.',
      ],
    ],
  },
  {
    id: 'creator-profiles',
    name: 'Public creator profiles',
    fit: 'Structured extraction, entity normalization, and entity-matching research.',
    limitation:
      'Public attributes may be incomplete or change over time. Profile similarity does not establish identity, and profile records are not a general-purpose language-model corpus.',
    record: {
      record_id: 'demo-profile-01',
      display_name: 'Example Research Lab',
      biography: 'Notes on information retrieval and language models.',
      website: null,
      source_ref: 'demo://profile/01',
      collected_at: '2026-01-15T08:00:00Z',
    },
    fields: [
      ['record_id', 'string', 'Required in example', 'Reference to the observed profile.'],
      [
        'display_name / biography',
        'string / string',
        'Present in example',
        'Public descriptive attributes, not verified identity.',
      ],
      [
        'website',
        'string | null',
        'Null in example',
        'No value in this example; actual null semantics require release documentation.',
      ],
      ['source_ref', 'string', 'Synthetic reference', 'Source provenance placeholder.'],
      [
        'collected_at',
        'datetime',
        'Present in example',
        'Time of observation, not account creation.',
      ],
    ],
  },
];

export const objectiveRows = [
  [
    'Domain-adaptive pretraining',
    'Topical text, discussions, descriptions',
    'Filter the corpus; inspect token and source distributions; deduplicate; verify permitted use.',
  ],
  [
    'Supervised fine-tuning',
    'Text and context suitable for a defined task',
    'Construct instructions and target outputs; annotate and validate. A reply is not automatically a reference answer.',
  ],
  [
    'Classification & extraction',
    'Comments, posts, public attributes',
    'Define labels and extraction rules; audit agreement, ambiguity, and class balance.',
  ],
  [
    'Retrieval & reranking',
    'Questions, discussions, document collections',
    'Build queries, relevance judgments, and hard negatives; exclude false negatives.',
  ],
  [
    'Model evaluation',
    'Content organized by domain and conditions',
    'Reserve independent examples; define references or scoring rubrics; version the benchmark.',
  ],
];

export const engineeringSteps = [
  {
    title: 'Select a corpus, inspect its distribution.',
    body: 'Define the target language, domain, source mix, and time window before filtering. Inspect text length, missing fields, and class coverage. Source selection creates a bias even before training begins.',
    evidence:
      'Keep: selection criteria, source counts, exclusion reasons, and separate publication / collection timestamps.',
    code: 'source: demo-comment-02\nthread: demo-thread-01\nlanguage: en\ncontent time: 2026-01-14\ncollection time: 2026-01-15',
  },
  {
    title: 'Clean the text without erasing context.',
    body: 'Handle boilerplate, link noise, encoding errors, and mixed-language content. Check exact duplicates before near-duplicate clusters. Preserve the original text and reply relationships so normalization remains auditable.',
    evidence:
      'Keep: source text, normalized text, transformation version, duplicate-cluster membership, and context completeness.',
    code: 'raw_text: “The search is faster now, but it\nstill misses exact product codes.”\nnormalized_text: unchanged\ncontext_ref: demo-comment-01\ndeduplication: must be checked',
  },
  {
    title: 'Construct supervision explicitly.',
    body: 'For this example, classify feedback by aspect rather than forcing a single sentiment label. Define how annotators handle mixed feedback. Human and model-generated labels need provenance; generated labels still require validation.',
    evidence:
      'Keep: source IDs, task definition, annotation method, label-schema version, and review decisions.',
    code: 'task: aspect_sentiment\ninput_ref: demo-comment-02\nillustrative_target:\n  search_speed: positive\n  exact_match_recall: negative\nlabel_origin: editorial demonstration',
  },
  {
    title: 'Split by the unit that could leak.',
    body: 'Keep related replies in the same split. Depending on the task, also group by entity or use a time cutoff. Deduplicate across partitions and fit learned preprocessing on training data only. Random row splits can hide overlap.',
    evidence:
      'Keep: corpus version, processing configuration, group assignments, split seed or cutoff, and overlap-audit results.',
    code: 'group_key: thread_id\nexample_group: demo-thread-01\npartition: assigned at group level\ncross_split_overlap: must be audited\nmanifest: sources + transforms + split policy',
  },
];

export const qualityRows = [
  [
    'Completeness',
    'Missing-field rates; orphan replies; truncated context.',
    'Decide which records are usable for the target task. Distinguish absent, unknown, and not applicable.',
  ],
  [
    'Duplication',
    'Exact hashes; near-duplicate clusters; overlap between splits.',
    'Prevent repeated examples from distorting weights or inflating evaluation results.',
  ],
  [
    'Coverage',
    'Language, topic, length, time, and source distributions.',
    'Compare the observed corpus with the intended deployment distribution; inspect underrepresented slices.',
  ],
  [
    'Label quality',
    'Annotation method; disagreement; adjudicated error samples.',
    'Measure whether the supervision supports the task. Automated labels are not ground truth by default.',
  ],
  [
    'Traceability',
    'Source references; collection time; transformation lineage.',
    'Reproduce derived examples and trace failures back to their source and processing configuration.',
  ],
];

export const datasetFaq = [
  [
    'Are the datasets already cleaned, deduplicated, and labeled?',
    'Do not assume these properties from the dataset category. Release documentation must identify processing steps, quality checks, and available annotations. The workflows on this page describe recommended downstream preparation, not verified processing included in every collection.',
  ],
  [
    'Can source records go directly into SFT?',
    'Usually a task-specific construction step is required. Define instructions, expected outputs, context boundaries, and annotation rules. Public replies can contain errors, disagreement, or missing context; they are not automatically validated instruction–response pairs.',
  ],
  [
    'How do I determine whether training use is appropriate?',
    'Check the release’s source information and applicable usage conditions against your intended use. Public accessibility does not itself grant unrestricted training or commercial rights. Dataset suitability also depends on coverage, quality, and the task you intend to learn.',
  ],
  [
    'Do video datasets include media files?',
    'The video concept shown here concerns metadata. Do not infer that video, audio, captions, or media rights are included. Actual assets and formats must be specified by the release.',
  ],
  [
    'Are versions fixed, and does data update automatically?',
    'The current product direction is a bounded, one-time snapshot rather than automatic refresh. Published releases need explicit coverage and version information. Exact inventory, versions, and delivery formats remain to be confirmed.',
  ],
  [
    'Can I buy or download a dataset now?',
    datasetProduct.availability +
      ' The examples on this page are editorial demonstrations, not downloadable inventory.',
  ],
];
