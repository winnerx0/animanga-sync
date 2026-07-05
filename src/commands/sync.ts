import { getProvider } from '../providers/registry.ts';
import type { MediaKind } from '../providers/types.ts';
import { runSync } from '../sync/engine.ts';
import { log } from '../util/log.ts';

export interface SyncCommandOpts {
  kind: 'anime' | 'manga' | 'all';
  dryRun: boolean;
  providerA: string;
  providerB: string;
}

export async function syncCommand(opts: SyncCommandOpts): Promise<void> {
  const a = getProvider(opts.providerA);
  const b = getProvider(opts.providerB);
  const kinds: MediaKind[] = opts.kind === 'all' ? ['anime', 'manga'] : [opts.kind];

  try {
    const stats = await runSync(a, b, { kinds, dryRun: opts.dryRun });
    log.ok(
      `pairs=${stats.pairs} noop=${stats.noop} ` +
        `updates(${a.name}=${stats.updatesA}, ${b.name}=${stats.updatesB}) ` +
        `pending=${stats.pending} onlyA=${stats.onlyA} onlyB=${stats.onlyB} errors=${stats.errors}`,
    );
    if (stats.pending > 0) {
      log.info(`Wrote pending matches to match.json — run \`animanga-sync resolve\` to triage.`);
    }
    if (stats.onlyA > 0 || stats.onlyB > 0) {
      log.info(`Wrote ${stats.onlyA + stats.onlyB} unmatched entries to match.json under "unmatched".`);
    }
  } catch (e) {
    log.err((e as Error).message);
    process.exitCode = 1;
  }
}
