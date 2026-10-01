import type { Metadata } from 'next';
import { LearnDeck } from './learn-deck';

export const metadata: Metadata = {
  title: 'Learn Ontahí',
  description:
    'A short, exploratory introduction to entities, relations, selections, operations, and runtimes in Ontahí.',
};

export default function LearnPage() {
  return <LearnDeck />;
}
