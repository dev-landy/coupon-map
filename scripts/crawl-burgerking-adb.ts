import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { burgerkingKrAdbAdapter } from '../lib/ingest/adapters/burgerkingKrAdb.ts';
import { normalizeCrawlPayload } from '../lib/ingest/normalize.ts';

interface CliArgs {
  output: string;
  stdout: boolean;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const payload = await burgerkingKrAdbAdapter.crawl();
  const normalized = normalizeCrawlPayload(payload);
  const json = `${JSON.stringify(normalized, null, 2)}\n`;

  if (args.stdout) {
    process.stdout.write(json);
    return;
  }

  const outputPath = resolve(args.output);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, json, 'utf8');

  console.log(
    JSON.stringify(
      {
        source: normalized.brand.source,
        brand: normalized.brand.name,
        coupons: normalized.coupons.length,
        fetched_at: normalized.fetched_at,
        output: outputPath,
      },
      null,
      2
    )
  );
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    output: 'data/crawls/burgerking-kr.latest.json',
    stdout: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--stdout') {
      args.stdout = true;
      continue;
    }
    if (arg === '--output') {
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        throw new Error('--output requires a file path');
      }
      args.output = next;
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
