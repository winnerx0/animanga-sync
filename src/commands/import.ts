import { readFileSync } from 'node:fs';
import { getProvider } from '../providers/registry.ts';
import type { MediaKind, Status } from '../providers/types.ts';
import { readMatchFile, writeMatchFile } from '../sync/match.ts';
import { similarity } from '../util/normalize.ts';
import { log } from '../util/log.ts';

export interface ImportOpts {
  file: string;
  kind: MediaKind;
  targets: string[];
  status: Status;
}

export async function importCommand(opts: ImportOpts): Promise<void> {
  const titles = readFileSync(opts.file, 'utf8')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('#'));

  const providers = opts.targets.map(getProvider);
  const matchFile = readMatchFile();
  let added = 0;
  let pending = 0;

  for (const title of titles) {
    log.step(`Searching: ${title}`);
    for (const provider of providers) {
      try {
        const results = await provider.search(title, opts.kind);
        if (!results.length) {
          log.warn(`  ${provider.name}: no results`);
          continue;
        }
        const scored = results.map((r) => {
          const candTitles = [r.titles.romaji, r.titles.english, r.titles.native, ...r.titles.synonyms].filter(Boolean) as string[];
          const score = Math.max(...candTitles.map((t) => similarity(title, t)), 0);
          return { entry: r, score };
        }).sort((a, b) => b.score - a.score);

        const top = scored[0];
        if (top && top.score >= 0.92 && (scored.length === 1 || (scored[1] && top.score - scored[1].score >= 0.05))) {
          if (!provider.add) {
            log.warn(`  ${provider.name}: add() not supported`);
            continue;
          }
          await provider.add({ kind: opts.kind, providerId: top.entry.providerId, status: opts.status });
          added += 1;
          log.ok(`  ${provider.name}: added "${top.entry.titles.romaji ?? top.entry.titles.english}"`);
        } else {
          matchFile.pending.push({
            kind: opts.kind,
            source: { provider: 'wordlist', id: title, title },
            candidates: scored.slice(0, 5).map((s) => ({
              provider: provider.name,
              id: s.entry.providerId,
              title: s.entry.titles.romaji ?? s.entry.titles.english ?? s.entry.providerId,
              score: Math.round(s.score * 1000) / 1000,
            })),
            discoveredAt: new Date().toISOString(),
          });
          pending += 1;
          log.warn(`  ${provider.name}: ambiguous, queued for resolve`);
        }
      } catch (e) {
        log.err(`  ${provider.name}: ${(e as Error).message}`);
      }
    }
  }

  writeMatchFile(matchFile);
  log.ok(`Imported ${added}, pending ${pending}`);
}
