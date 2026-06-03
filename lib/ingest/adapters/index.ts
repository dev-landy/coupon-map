import type { CrawlAdapter } from '../types.ts';
import { burgerkingKrAdbAdapter } from './burgerkingKrAdb.ts';
import { fixtureAdapter } from './fixture.ts';
import { kfcKrAdbAdapter } from './kfcKrAdb.ts';
import { mcdonaldsKrAdbAdapter } from './mcdonaldsKrAdb.ts';
import { mcdonaldsKrAdapter } from './mcdonaldsKr.ts';

const ADAPTERS: Record<string, CrawlAdapter> = {
  [burgerkingKrAdbAdapter.source]: burgerkingKrAdbAdapter,
  [fixtureAdapter.source]: fixtureAdapter,
  [kfcKrAdbAdapter.source]: kfcKrAdbAdapter,
  [mcdonaldsKrAdbAdapter.source]: mcdonaldsKrAdbAdapter,
  [mcdonaldsKrAdapter.source]: mcdonaldsKrAdapter,
};

export function getCrawlAdapter(source: string): CrawlAdapter {
  const adapter = ADAPTERS[source];
  if (!adapter) {
    throw new Error(
      `Unknown crawl source "${source}". Available sources: ${Object.keys(ADAPTERS).join(', ')}`
    );
  }
  return adapter;
}
