import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Ontahí — Executable domain framework and runtime protocol',
    template: '%s · Ontahí',
  },
  description:
    'Ontahí is an open-source framework and runtime protocol for modeling applications through entities, relationships, selections, commands, and operations.',
  metadataBase: new URL('https://ontahi.org'),
  applicationName: 'Ontahí',
  alternates: {
    canonical: '/',
  },
  keywords: [
    'Ontahí',
    'Ontahi',
    'executable domains',
    'domain modeling',
    'runtime protocol',
    'TypeScript framework',
  ],
  authors: [{ name: 'Javier Fernandes' }],
  icons: {
    icon: '/brand/ontahi-symbol.svg',
    shortcut: '/brand/ontahi-symbol.svg',
    apple: '/brand/ontahi-symbol.svg',
  },
  openGraph: {
    title: 'Ontahí — Executable domain framework and runtime protocol',
    description:
      'Model entities, relationships, selections, commands, and operations once, then execute them across runtimes and interfaces.',
    url: '/',
    siteName: 'Ontahí',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Ontahí — Executable domain framework and runtime protocol',
    description:
      'Model entities, relationships, selections, commands, and operations once, then execute them across runtimes and interfaces.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang='en'>
      <body>{children}</body>
    </html>
  );
}
