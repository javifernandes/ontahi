import type { Metadata } from 'next';
import { VisionExperience } from './vision-experience';

export const metadata: Metadata = {
  title: 'Vision',
  description:
    'Ontahí is a semantic kernel for entities and computations across runtimes, interfaces, and infrastructure.',
  alternates: {
    canonical: '/vision/',
  },
};

export default function VisionPage() {
  return <VisionExperience />;
}
