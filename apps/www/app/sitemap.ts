import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://ontahi.org/',
      changeFrequency: 'monthly',
      priority: 1,
    },
    {
      url: 'https://ontahi.org/vision/',
      changeFrequency: 'monthly',
      priority: 0.7,
    },
  ];
}
