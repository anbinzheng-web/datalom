import { datasetProduct } from './datasets';
export type Page = {
  path: string;
  title: string;
  eyebrow: string;
  description: string;
  sections: { title: string; text: string }[];
  links?: { title: string; href: string; description?: string }[];
  planned?: boolean;
};
export const platforms = [
  ['tiktok', 'TikTok', 'TK', 'Videos, creators, comments, and trends', '#f1f3ef'],
  ['instagram', 'Instagram', 'IG', 'Posts, reels, profiles, and engagement', '#faedf3'],
  ['youtube', 'YouTube', 'YT', 'Videos, channels, captions, and comments', '#fceeea'],
  ['x', 'X (Twitter)', '𝕏', 'Posts, conversations, and public profiles', '#f0f0ef'],
  ['facebook', 'Facebook', 'f', 'Public posts, pages, and conversations', '#edf2fc'],
  ['reddit', 'Reddit', 'r/', 'Communities, discussions, and sentiment', '#fff0e6'],
  ['douyin', 'Douyin', 'DY', 'Short videos, creators, and commerce', '#f0edf8'],
  ['xiaohongshu', 'Rednote', 'R', 'Lifestyle notes, creators, and discovery', '#ffeded'],
  ['linkedin', 'LinkedIn', 'in', 'Professional profiles, companies, and posts', '#eaf2fa'],
  ['bilibili', 'Bilibili', 'B', 'Videos, creators, and live communities', '#eaf7fb'],
  ['weibo', 'Weibo', 'W', 'Posts, topics, and public conversations', '#fff4e7'],
  ['kuaishou', 'Kuaishou', 'K', 'Short videos, live content, and creators', '#fff0e6'],
  ['wechat', 'WeChat', 'WC', 'Public account articles and video content', '#eef9ee'],
  ['lemon8', 'Lemon8', 'L8', 'Lifestyle content and emerging trends', '#f9fbdc'],
  ['zhihu', 'Zhihu', 'Z', 'Questions, answers, and expert content', '#edf3ff'],
  ['threads', 'Threads', '@', 'Public conversations and creator posts', '#f0f0ef'],
] as const;

export const datasetUseCases = [
  [
    'AI training & evaluation',
    'Build clean, versioned examples for model training, fine-tuning, and evaluation.',
  ],
  [
    'RAG & agent retrieval',
    'Give research agents current public context with source links and collection timestamps.',
  ],
  [
    'Creator & competitor research',
    'Compare public content, creators, engagement, and conversations over time.',
  ],
  [
    'Commerce & product discovery',
    'Study public product signals, categories, creators, and shopping trends.',
  ],
  ['Trend monitoring', 'Track topics, formats, and conversations as they change across platforms.'],
] as const;
export const sdkLanguages = [
  ['Rust', 'cargo add datalom', 'Systems tools and high-throughput pipelines'],
  ['Go', 'go get github.com/datalom/sdk-go', 'Services, workers, and data infrastructure'],
  ['TypeScript', 'pnpm add @datalom/sdk', 'Web apps, scripts, and agent workflows'],
  ['Python', 'pip install datalom', 'Notebooks, research, and model pipelines'],
] as const;
export const agentIntegrations = [
  'MCP servers',
  'Skills',
  'Claude',
  'Cursor',
  'n8n',
  'Zapier',
  'Custom agents',
] as const;
export const homeFaq = [
  [
    'Where does Datalom data come from?',
    'Datalom collects publicly accessible platform content and publishes the source context, schema, coverage window, and collection time for each dataset.',
  ],
  [
    'Do you collect private or restricted platform data?',
    'No. We do not bypass permissions, authentication barriers, access controls, or platform restrictions to collect non-public data.',
  ],
  [
    'What can I use the data for?',
    'The datasets are designed for student learning, AI research, training preparation, social media analysis, market research, and cross-border commerce analysis.',
  ],
  [
    'Can I use the data for anything?',
    'No. You must not use Datalom data for illegal activity, privacy violations, harassment, fraud, evading platform controls, or other harmful purposes.',
  ],
  [
    'What rules apply to my project?',
    'You are responsible for following applicable law, platform terms, privacy requirements, and the usage conditions listed with each dataset.',
  ],
  [
    'Can dataset coverage change?',
    'Yes. Public content, fields, platform availability, and coverage windows can change. Dataset versions document what was collected and when.',
  ],
] as const;
export const homeVideo = {
  videoId: '',
  title: 'How Datalom helps you learn from platform data',
  description: 'A short tour of datasets, APIs, and AI agent workflows.',
  channelUrl: 'https://www.youtube.com/',
} as const;
export const products = [
  [
    'social-media-api',
    'Social Media APIs',
    '01',
    'Structured data. Built for your code.',
    'API access to public profiles, posts, videos, and comments.',
    'Profiles, content, and conversations',
    'Pagination and predictable responses',
  ],
  [
    'datasets',
    'Datasets',
    '02',
    'Less preparation. More discovery.',
    'Explore collections designed for analysis, research, and AI workflows, with explicit schemas and delivery details.',
    'Inspectable samples and field definitions',
    'Versioned collections and export formats',
  ],
  [
    'mcp',
    'MCP Servers',
    '03',
    'Social context for your AI agents.',
    'Planned MCP tools for retrieving social data from AI clients.',
    'Platform-specific tools for AI clients',
    'Documented authentication and setup',
  ],
  [
    'browser-extension',
    'Browser Extension',
    '04',
    'From the page to your workflow.',
    'A planned browser companion for exploring public content, collecting context, and exporting useful records.',
    'Content and conversation exploration',
    'Portable exports for further analysis',
  ],
  [
    'live-data',
    'Live Data',
    '05',
    'Follow the moments that matter.',
    'Planned event-based access to live activity for monitoring, alerts, and time-sensitive analysis.',
    'Event schemas and delivery controls',
    'Reconnect and retry guidance',
  ],
] as const;
export const solutions = [
  [
    'ai-training',
    'AI training & fine-tuning',
    'Build a better starting point.',
    'Prepare structured social content for evaluation, fine-tuning, and research.',
    'Define the language, time range, and content types your research needs.',
    'Inspect schemas, provenance, and usage conditions before building a training pipeline.',
  ],
  [
    'ai-agents',
    'AI agents & RAG',
    'Give your agents more context.',
    'Ground research and retrieval workflows in public social conversations.',
    'Choose the sources and tools relevant to your agent’s task.',
    'Keep source references and retrieval timestamps alongside generated answers.',
  ],
  [
    'market-research',
    'Market & competitor research',
    'See the bigger picture.',
    'Study content patterns, emerging categories, and competitive activity.',
    'Compare a defined set of public accounts and topics over a consistent time window.',
    'Combine content metadata with engagement snapshots without treating them as full audience measurements.',
  ],
  [
    'brand-monitoring',
    'Brand & trend monitoring',
    'Understand the conversation.',
    'Explore public mentions, recurring themes, and changes in discussion.',
    'Define your brand terms, topic queries, and collection schedule.',
    'Inspect comments in context and preserve timestamps when comparing trends.',
  ],
  [
    'creator-analytics',
    'Creator analytics',
    'Look beyond a single post.',
    'Organize creator content and public engagement for more informed analysis.',
    'Select creators and the public content types relevant to your analysis.',
    'Compare like-for-like time windows and document missing or unavailable fields.',
  ],
  [
    'social-commerce',
    'Social commerce',
    'Connect content and commerce.',
    'Plan research around public product content, creators, and shopping trends.',
    'Identify the platforms and product attributes your workflow requires.',
    'Validate platform coverage and freshness before making commercial decisions.',
  ],
  [
    'automation',
    'Automation & workflows',
    'Turn repeated work into a workflow.',
    'Connect data access to reporting, monitoring, and downstream tools.',
    'Choose a trigger, a data source, and a destination for the result.',
    'Plan for rate limits, retries, and duplicate records before enabling a schedule.',
  ],
] as const;
const productPath = (id: string) => (id === 'datasets' ? '/datasets' : `/products/${id}`);
export const pages: Page[] = [
  {
    path: '/products',
    title: 'Products',
    eyebrow: 'PRODUCTS',
    description:
      'Explore the Datalom product roadmap: from API requests and datasets to AI tools and automated workflows.',
    sections: [],
    links: products.map((p) => ({ title: p[1], href: productPath(p[0]), description: p[4] })),
  },
  ...products
    .filter((p) => p[0] !== 'datasets')
    .map((p) => ({
      path: productPath(p[0]),
      title: p[1],
      eyebrow: p[1].toUpperCase(),
      description: p[4],
      planned: true,
      sections: [
        {
          title: p[5],
          text: 'This capability is part of the Datalom roadmap. Platform coverage, supported fields, and access requirements will be documented before public availability.',
        },
        {
          title: p[6],
          text: 'The planned experience includes clear examples, explicit limitations, and a documented path from a sample to your own workflow.',
        },
      ],
      links: [
        { title: 'Explore platform coverage', href: '/platforms' },
        { title: 'Read the development roadmap', href: '/changelog' },
      ],
    })),
  {
    path: '/platforms',
    title: 'Platform directory',
    eyebrow: 'PLATFORM DIRECTORY',
    description:
      'Explore our planned platform coverage. Each platform has its own data objects, capabilities, and access considerations.',
    sections: [],
    links: platforms.map((p) => ({ title: p[1], href: `/platforms/${p[0]}`, description: p[3] })),
  },
  ...platforms.map((p) => ({
    path: `/platforms/${p[0]}`,
    title: `${p[1]} API and datasets`,
    eyebrow: `${p[1].toUpperCase()} API`,
    description: `Explore planned access to ${p[3].toLowerCase()}. Public API access is not yet available.`,
    planned: true,
    sections: [
      {
        title: 'What the platform page will cover',
        text: `${p[3]}. Availability will be documented separately for each data object, including field definitions and collection limitations.`,
      },
      {
        title: 'Choose your delivery method',
        text: 'API access is intended for application requests; datasets are intended for defined collections. MCP support and live delivery will be listed independently when available.',
      },
      {
        title: 'Understand the data',
        text: 'Future documentation will include pagination, collection timestamps, source references, and examples. Public content availability can change; a planned platform does not imply support for every feature.',
      },
    ],
    links: [
      { title: 'Explore the API product', href: '/products/social-media-api' },
      { title: 'Browse dataset concepts', href: '/datasets' },
      { title: 'View the roadmap', href: '/changelog' },
    ],
  })),
  {
    path: '/datasets',
    title: datasetProduct.title,
    eyebrow: 'DATASET CATALOG',
    description: datasetProduct.description,
    sections: [
      {
        title: 'Know what is inside',
        text: 'Every published collection will have a schema, a sample, a coverage window, and a clear explanation of its source and permitted use.',
      },
    ],
    links: [
      {
        title: 'TikTok video metadata',
        href: '/datasets/tiktok-video-metadata',
        description: 'Video descriptions, source references, and engagement snapshots.',
      },
      {
        title: 'Social conversation samples',
        href: '/datasets/social-conversations',
        description: 'Comment and reply structures for exploratory analysis.',
      },
      {
        title: 'Creator profile snapshots',
        href: '/datasets/creator-profiles',
        description: 'Public profile attributes with collection context.',
      },
    ],
  },
  ...[
    [
      'tiktok-video-metadata',
      'TikTok video metadata',
      'Video identifiers, descriptions, creator references, and engagement snapshots.',
    ],
    [
      'social-conversations',
      'Social conversation samples',
      'Comment text, reply relationships, source references, and collection timestamps.',
    ],
    [
      'creator-profiles',
      'Creator profile snapshots',
      'Public profile identifiers, descriptions, and available account metrics.',
    ],
  ].map(([id, title, description]) => ({
    path: `/datasets/${id}`,
    title,
    eyebrow: 'DATASET CONCEPT',
    description,
    planned: true,
    sections: [
      {
        title: 'Schema and sample',
        text: 'The final field schema and downloadable sample will be published after validation. No records are available to purchase or download from this page.',
      },
      {
        title: 'Coverage and delivery',
        text: 'Choose available months or the latest 12 complete months. Standard datasets cost $0.20 per 1,000 records, with a $5 minimum. Each order includes 3 complete downloads within 30 days after files are ready. No automatic refresh or renewal. Failed transfers and resumed downloads do not consume another complete download. Contact us to request an extension or additional downloads; administrators can reopen order access. Exact inventory and formats will be confirmed before purchase.',
      },
      {
        title: 'Provenance and permitted use',
        text: 'Source documentation, collection context, and applicable usage conditions will accompany each release. Availability of public content does not automatically grant unrestricted reuse.',
      },
    ],
    links: [
      { title: 'Compare API and dataset access', href: '/pricing' },
      { title: 'Read our publication approach', href: '/legal/data-policy' },
    ],
  })),
  {
    path: '/solutions',
    title: 'Use cases',
    eyebrow: 'SOLUTIONS',
    description:
      'Different questions need different data. Explore workflows for AI, research, monitoring, and product development.',
    sections: [],
    links: solutions.map((s) => ({ title: s[1], href: `/solutions/${s[0]}`, description: s[3] })),
  },
  ...solutions.map((s) => ({
    path: `/solutions/${s[0]}`,
    title: s[1],
    eyebrow: s[1].toUpperCase(),
    description: s[3],
    sections: [
      { title: 'Define the question', text: s[4] },
      { title: 'Build with context', text: s[5] },
      {
        title: 'Plan the delivery',
        text: 'Use datasets for bounded collections, APIs for application access, and integrations for connected workflows. Product availability is shown on each product page.',
      },
    ],
    links: [
      { title: 'Explore datasets', href: '/datasets' },
      { title: 'Explore APIs', href: '/products/social-media-api' },
    ],
  })),
  {
    path: '/integrations',
    title: 'Integrations',
    eyebrow: 'INTEGRATIONS',
    description:
      'Our planned connections span AI clients, orchestration tools, and automation platforms. No native integrations are publicly available yet.',
    sections: [],
    links: ['Claude', 'Cursor', 'n8n', 'Zapier', 'LangChain'].map((name) => ({
      title: name,
      href: `/integrations/${name.toLowerCase()}`,
      description:
        name === 'Claude' || name === 'Cursor'
          ? 'Planned MCP workflow'
          : 'Planned workflow integration',
    })),
  },
  ...['Claude', 'Cursor', 'n8n', 'Zapier', 'LangChain'].map((name) => ({
    path: `/integrations/${name.toLowerCase()}`,
    title: `Datalom integration for ${name}.`,
    eyebrow: 'PLANNED INTEGRATION',
    description: `Explore the intended Datalom workflow for ${name}. Installation packages and supported actions have not been released.`,
    planned: true,
    sections: [
      {
        title: 'Connection approach',
        text:
          name === 'Claude' || name === 'Cursor'
            ? 'The planned integration uses MCP to expose documented data tools to your AI client.'
            : 'The planned workflow connects data requests with downstream processing. A native connector has not been announced.',
      },
      {
        title: 'Before you start',
        text: 'A working integration will require public Datalom access, documented authentication, and supported platform capabilities. Setup instructions will be published when these prerequisites are available.',
      },
    ],
    links: [
      { title: 'Explore MCP', href: '/products/mcp' },
      { title: 'View the roadmap', href: '/changelog' },
    ],
  })),
  {
    path: '/pricing',
    title: 'API and dataset pricing',
    eyebrow: 'SIMPLE, TRANSPARENT PRICING',
    description:
      '$0.0005 per successful API request. No monthly subscription, no volume tiers, and no throughput fees. Standard datasets cost $0.20 per 1,000 records, with a $5 minimum.',
    sections: [],
  },
  {
    path: '/enterprise',
    title: 'Enterprise data requirements',
    eyebrow: 'ENTERPRISE',
    description:
      'Plan your coverage, delivery, and support requirements with a clear view of the data you need.',
    sections: [
      {
        title: 'Define your requirements',
        text: 'Identify your target platforms, content types, collection windows, refresh cadence, and intended use. These determine the scope of a future delivery.',
      },
      {
        title: 'Design the handoff',
        text: 'Choose the formats and destinations your team uses. Agree on schema expectations, versioning, and quality checks before integrating a collection.',
      },
      {
        title: 'Availability',
        text: 'Enterprise onboarding and sales contact channels are not open yet. This page describes the intended service structure, not an active service commitment.',
      },
    ],
    links: [
      { title: 'Product roadmap', href: '/changelog' },
      { title: 'Explore platforms', href: '/platforms' },
    ],
  },
  {
    path: '/docs',
    title: 'Developer documentation',
    eyebrow: 'DEVELOPER RESOURCES',
    description:
      'Understand the product model and explore the documentation roadmap. Public API endpoints and credentials are not available yet.',
    sections: [],
    links: [
      {
        title: 'Quickstart',
        href: '/docs/quickstart',
        description: 'Plan your first data workflow.',
      },
      {
        title: 'API reference',
        href: '/docs/api',
        description: 'Browse endpoints, fill parameters, and send a live request after login.',
      },
      {
        title: 'Dataset delivery',
        href: '/docs/datasets',
        description: 'Schemas, formats, and collection context.',
      },
      {
        title: 'MCP setup',
        href: '/docs/mcp',
        description: 'How the planned AI tool connection fits together.',
      },
    ],
  },
  ...[
    [
      'quickstart',
      'Your first Datalom workflow',
      'Choose a source',
      'Start with a platform and the objects you need: profiles, posts, videos, or conversations.',
      'Choose a delivery method',
      'Use a bounded dataset for offline analysis or API access for application requests. Public access will be announced in the changelog.',
    ],
    [
      'api',
      'API reference roadmap',
      'Public API availability',
      'Endpoint URLs, request parameters, authentication, error codes, and rate limits will be published alongside public access. Internal research interfaces are not public API contracts.',
      'What to expect',
      'Reference pages will describe each endpoint independently, with request examples, response schemas, pagination, and limitations.',
    ],
    [
      'datasets',
      'Understanding dataset delivery',
      'Inspect before integrating',
      'Review field types, nullable values, time coverage, provenance, and usage conditions. A collection should have enough context to be useful beyond a single download.',
      'Plan for change',
      'Versioned releases and collection timestamps help distinguish schema changes from newly collected records. Formats and refresh policies will be documented per release.',
    ],
    [
      'mcp',
      'Connecting AI tools with MCP',
      'The connection model',
      'An MCP client discovers tools from a server and calls them with structured inputs. Datalom plans platform-specific data tools for compatible clients.',
      'Setup availability',
      'Server addresses, configuration examples, and supported client versions will be published when the service is available. Do not use illustrative product diagrams as connection instructions.',
    ],
  ].map(([id, title, a, b, c, d]) => ({
    path: `/docs/${id}`,
    title,
    eyebrow: 'DOCUMENTATION',
    description: 'Developer guidance for the upcoming Datalom platform.',
    sections: [
      { title: a, text: b },
      { title: c, text: d },
    ],
    links: [
      { title: 'All documentation', href: '/docs' },
      { title: 'Product roadmap', href: '/changelog' },
    ],
  })),
  {
    path: '/marketplace',
    title: 'Marketplace',
    eyebrow: 'MARKETPLACE · PLANNED',
    description:
      'A planned marketplace for APIs, datasets, AI agents, and crawlers. Listings, purchases, and seller applications are not open yet.',
    planned: true,
    sections: [
      {
        title: 'Discover',
        text: 'Compare tools by capability, documentation, supported platforms, and delivery requirements.',
      },
      {
        title: 'Publish',
        text: 'The intended seller experience includes listing information, setup guidance, pricing, and support details. Commission and payout terms have not been decided.',
      },
    ],
    links: [{ title: 'Seller roadmap', href: '/marketplace/sell' }],
  },
  {
    path: '/marketplace/sell',
    title: 'Publish on the marketplace',
    eyebrow: 'FOR FUTURE SELLERS',
    description:
      'The seller program is in planning. There is no application or payment process at this stage.',
    planned: true,
    sections: [
      {
        title: 'Prepare your listing',
        text: 'Describe your product’s capabilities, dependencies, sample outputs, pricing model, and support expectations.',
      },
      {
        title: 'Publication standards',
        text: 'Listings will need accurate availability, clear usage terms, and verifiable setup instructions before they can be offered.',
      },
    ],
    links: [{ title: 'Marketplace overview', href: '/marketplace' }],
  },
  {
    path: '/changelog',
    title: 'Product roadmap',
    eyebrow: 'PRODUCT ROADMAP',
    description:
      'A transparent view of the public product direction. These stages are not release-date commitments.',
    sections: [
      {
        title: 'Now · Website foundation',
        text: 'English product discovery, platform pages, dataset concepts, and developer guidance. Public account creation and paid services are not enabled.',
      },
      {
        title: 'Next · Developer and dataset access',
        text: 'Publish validated API contracts, collection schemas, samples, authentication, and usage documentation alongside working services.',
      },
      {
        title: 'Later · Connected workflows',
        text: 'Expand into MCP, browser tools, automation, live data, multilingual content, and the marketplace.',
      },
    ],
  },
  {
    path: '/about',
    title: 'About Datalom',
    eyebrow: 'ABOUT DATALOM',
    description:
      'Datalom is being built to make social data easier to understand and integrate into useful products.',
    sections: [
      {
        title: 'Context belongs with the data',
        text: 'A record is more useful when its fields, source, collection time, and limitations are clear. That principle shapes our API and dataset plans.',
      },
      {
        title: 'Build a shared foundation',
        text: 'Our roadmap connects developer APIs, research collections, and AI workflows through a consistent product experience.',
      },
    ],
  },
  {
    path: '/contact',
    title: 'Contact',
    eyebrow: 'CONTACT',
    description:
      'Sales and support channels are being set up. We are not collecting inquiries through this website yet.',
    sections: [
      {
        title: 'Exploring the product?',
        text: 'Browse the product roadmap and platform directory to understand the intended coverage and current availability.',
      },
      {
        title: 'Planning a project?',
        text: 'Prepare your target platforms, data fields, volume, refresh cadence, and intended use. These will help scope a conversation when inquiries open.',
      },
    ],
    links: [
      { title: 'View the roadmap', href: '/changelog' },
      { title: 'Explore platforms', href: '/platforms' },
    ],
  },
  {
    path: '/legal/data-policy',
    title: 'Data sources and usage conditions',
    eyebrow: 'DATA PUBLICATION APPROACH',
    description:
      'Our intended approach to documenting sources, collection context, and usage conditions. Dataset-specific terms will accompany published releases.',
    sections: [
      {
        title: 'Source and collection context',
        text: 'Published datasets should identify their sources, collection windows, field meanings, and known limitations.',
      },
      {
        title: 'Usage conditions',
        text: 'Public availability is not a blanket license. Review source restrictions and collection-specific terms before using data in your project.',
      },
      {
        title: 'Changes and removals',
        text: 'Release documentation will explain how corrections, unavailable content, and version changes are handled.',
      },
    ],
  },
];
export const getPage = (path: string) => pages.find((p) => p.path === path);
export type NavigationItem = { title: string; href: string; children?: NavigationItem[] };
export const navigation: { title: string; href: string; items: NavigationItem[] }[] = [
  {
    title: 'Products',
    href: '/products',
    items: products
      .map((p) => ({
        title: String(p[1]),
        href: productPath(p[0]),
        ...(p[0] === 'social-media-api'
          ? {
              children: platforms
                .map((platform) => ({
                  title: String(platform[1]),
                  href: `/platforms/${platform[0]}`,
                }))
                .concat([{ title: 'View all platforms', href: '/platforms' }]),
            }
          : {}),
      }))
      .concat([
        { title: 'Integrations', href: '/integrations' },
        { title: 'Marketplace', href: '/marketplace' },
      ]),
  },
  {
    title: 'Solutions',
    href: '/solutions',
    items: solutions.map((s) => ({ title: s[1], href: `/solutions/${s[0]}` })),
  },
  {
    title: 'Developers',
    href: '/docs',
    items: [
      { title: 'Documentation', href: '/docs' },
      { title: 'Quickstart', href: '/docs/quickstart' },
      { title: 'API reference', href: '/docs/api' },
      { title: 'Product roadmap', href: '/changelog' },
    ],
  },
];
