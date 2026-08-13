import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ontahi',
  description: 'Executable domains, from applications to living experiences.',
  metadataBase: new URL('https://ontahi.org'),
  icons: {
    icon: '/brand/ontahi-symbol.svg',
    shortcut: '/brand/ontahi-symbol.svg',
    apple: '/brand/ontahi-symbol.svg',
  },
  openGraph: {
    title: 'Ontahi',
    description: 'Executable domains, from applications to living experiences.',
    url: 'https://ontahi.org',
    siteName: 'Ontahi',
    type: 'website',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang='en'>
      <body>{children}</body>
    </html>
  );
}
