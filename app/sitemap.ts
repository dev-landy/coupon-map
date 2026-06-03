import type { MetadataRoute } from 'next';

import { getCanonicalUrl } from '../lib/seo';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: getCanonicalUrl('/'),
      lastModified: new Date(),
      changeFrequency: 'hourly',
      priority: 1,
    },
  ];
}
