import type { Metadata } from 'next';
import { UiPreview } from '@/components/ui-preview';
export const metadata: Metadata = {
  title: 'Design system',
  robots: { index: false, follow: false },
};
export default function Page() {
  return <UiPreview />;
}
