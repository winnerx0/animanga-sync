import type { MediaKind, Provider } from '../providers/types.ts';
import { compareEntries } from './compare.ts';
import {
  pairLists,
  readMatchFile,
  writeMatchFile,
  type PendingMatch,
  type UnmatchedEntry,
} from './match.ts';
import type { MediaEntry, ProviderName } from '../providers/types.ts';
import { log } from '../util/log.ts';

export interface SyncOptions {
  kinds: MediaKind[];
  dryRun: boolean;
}

export interface SyncStats {
  pairs: number;
  updatesA: number;
  updatesB: number;
  noop: number;
  pending: number;
  errors: number;
  onlyA: number;
  onlyB: number;
}

export async function runSync(
  providerA: Provider,
  providerB: Provider,
  opts: SyncOptions,
): Promise<SyncStats> {
  const stats: SyncStats = {
    pairs: 0, updatesA: 0, updatesB: 0, noop: 0, pending: 0, errors: 0, onlyA: 0, onlyB: 0,
  };

  if (!(await providerA.authenticated())) {
    throw new Error(`${providerA.name} not authenticated`);
  }
  if (!(await providerB.authenticated())) {
    throw new Error(`${providerB.name} not authenticated`);
  }

  const matchFile = readMatchFile();
  const newPending: PendingMatch[] = [];
  const newUnmatched: UnmatchedEntry[] = [];

  for (const kind of opts.kinds) {
    log.info(`Fetching ${kind} lists from ${providerA.name} and ${providerB.name}…`);
    const [listA, listB] = await Promise.all([providerA.list(kind), providerB.list(kind)]);
    log.step(`${providerA.name}: ${listA.length} entries · ${providerB.name}: ${listB.length} entries`);

    const { pairs, onlyA, onlyB, pending } = pairLists(listA, listB, {
      providerA: providerA.name,
      providerB: providerB.name,
      resolved: matchFile.resolved,
      rejected: matchFile.rejected,
    });
    stats.pairs += pairs.length;
    stats.onlyA += onlyA.length;
    stats.onlyB += onlyB.length;
    newPending.push(...pending);
    for (const e of onlyA) newUnmatched.push(toUnmatched(e, providerA.name));
    for (const e of onlyB) newUnmatched.push(toUnmatched(e, providerB.name));

    for (const [a, b] of pairs) {
      const result = compareEntries(a, b);
      if (result.equal) {
        stats.noop += 1;
        continue;
      }
      const target = result.winner === 'a' ? b : a;
      const targetProvider = result.winner === 'a' ? providerB : providerA;
      const titleHint = a.titles.english ?? a.titles.romaji ?? a.providerId;
      log.step(
        `${pc(opts.dryRun)} ${targetProvider.name} ← ${result.winner === 'a' ? providerA.name : providerB.name} :: ${titleHint} :: ${JSON.stringify(result.patch)}`,
      );
      if (opts.dryRun) continue;
      try {
        await targetProvider.update(target, result.patch);
        if (targetProvider.name === providerA.name) stats.updatesA += 1;
        else stats.updatesB += 1;
      } catch (e) {
        stats.errors += 1;
        log.err(`update failed for ${titleHint}: ${(e as Error).message}`);
      }
    }
  }

  // merge pending matches: dedupe by source provider+id
  const pendingKey = (p: PendingMatch) => `${p.source.provider}:${p.source.id}`;
  const existingPending = new Set(matchFile.pending.map(pendingKey));
  for (const p of newPending) {
    if (!existingPending.has(pendingKey(p))) matchFile.pending.push(p);
  }
  stats.pending = newPending.length;

  // replace unmatched for the kinds we just synced (so stale entries drop out)
  const syncedKinds = new Set(opts.kinds);
  matchFile.unmatched = matchFile.unmatched.filter((u) => !syncedKinds.has(u.kind));
  matchFile.unmatched.push(...newUnmatched);

  if (!opts.dryRun) writeMatchFile(matchFile);
  return stats;
}

function toUnmatched(e: MediaEntry, provider: ProviderName): UnmatchedEntry {
  return {
    kind: e.kind,
    provider,
    id: e.providerId,
    title: e.titles.english ?? e.titles.romaji ?? e.titles.native ?? e.providerId,
    status: e.status,
    progress: e.progress,
  };
}

function pc(dry: boolean): string {
  return dry ? '[dry-run]' : '[apply]';
}
