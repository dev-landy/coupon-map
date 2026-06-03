import type { CrawlAdapter } from '../types.ts';

export const mcdonaldsKrAdapter: CrawlAdapter = {
  source: 'mcdonalds-kr',
  async crawl() {
    throw new Error(
      'mcdonalds-kr adapter is waiting for captured app API details. ' +
        'Capture the coupon endpoint, then implement URL/headers/body parsing here.'
    );
  },
};
