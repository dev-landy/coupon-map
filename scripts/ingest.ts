import { getCrawlAdapter } from '../lib/ingest/adapters/index.ts';
import { loadLocalEnvFiles } from '../lib/ingest/localEnv.ts';
import { normalizeCrawlPayload } from '../lib/ingest/normalize.ts';
import {
  createServerSupabaseClient,
  ingestCrawlPayload,
} from '../lib/ingest/supabase.ts';

interface CliArgs {
  source: string;
  dryRun: boolean;
}

async function main(): Promise<void> {
  loadLocalEnvFiles();
  const args = parseArgs(process.argv.slice(2));
  const adapter = getCrawlAdapter(args.source);
  const payload = await adapter.crawl();

  if (args.dryRun) {
    const normalized = normalizeCrawlPayload(payload);
    console.log(
      JSON.stringify(
        {
          source: normalized.brand.source,
          brand: normalized.brand.name,
          stores: normalized.stores.length,
          coupons: normalized.coupons.length,
          fetched_at: normalized.fetched_at,
        },
        null,
        2
      )
    );
    return;
  }

  const client = createServerSupabaseClient();
  const result = await ingestCrawlPayload(client, payload);
  console.log(JSON.stringify(result, null, 2));
}

function parseArgs(argv: string[]): CliArgs {
  let source = process.env.CRAWL_SOURCE ?? 'mcdonalds-kr';
  let dryRun = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg === '--source') {
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        throw new Error('--source requires a value');
      }
      source = next;
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { source, dryRun };
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
