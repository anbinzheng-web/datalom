import { metadataFor } from '@/lib/seo';
import { HeroSection } from '@/components/home/hero';
import { DatasetsSection } from '@/components/home/datasets';
import { ApiSection } from '@/components/home/api';
import { FaqSection } from '@/components/home/faq';
import { VideoSection } from '@/components/home/video';
export const metadata = metadataFor(
  'Public platform datasets for AI learning and analysis',
  'Learn, train, and analyze with structured public platform datasets, APIs, SDKs, MCP, and AI agent integrations.',
  '/',
);
export default function Home() {
  return (
    <main id="main-content" className="mx-auto w-full overflow-clip bg-paper text-ink">
      <HeroSection />
      <DatasetsSection />
      <ApiSection />
      <FaqSection />
      <VideoSection />
    </main>
  );
}
