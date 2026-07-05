import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { MATCH_FILE } from '../config.ts';
import type { MediaEntry, MediaKind, ProviderName } from '../providers/types.ts';
import { similarity } from '../util/normalize.ts';

export interface MatchCandidate {
  provider: ProviderName;
  id: string;
  title: string;
  score: number;
}

export interface PendingMatch {
  kind: MediaKind;
  source: { provider: ProviderName; id: string; title: string };
  candidates: MatchCandidate[];
  discoveredAt: string;
}

export interface ResolvedMatch {
  kind?: MediaKind;
  anilistId?: number;
  malId?: number;
  [providerKey: string]: number | string | undefined;
}

export interface RejectedMatch {
  kind?: MediaKind;
  provider: ProviderName;
  id: string;
  note?: string;
}

export interface UnmatchedEntry {
  kind: MediaKind;
  provider: ProviderName;
  id: string;
  title: string;
  status: string;
  progress: number;
}

export interface MatchFile {
  pending: PendingMatch[];
  resolved: ResolvedMatch[];
  rejected: RejectedMatch[];
  unmatched: UnmatchedEntry[];
}

export function readMatchFile(): MatchFile {
  if (!existsSync(MATCH_FILE)) {
    return { pending: [], resolved: [], rejected: [], unmatched: [] };
  }
  const data = JSON.parse(readFileSync(MATCH_FILE, 'utf8')) as Partial<MatchFile>;
  return {
    pending: data.pending ?? [],
    resolved: data.resolved ?? [],
    rejected: data.rejected ?? [],
    unmatched: data.unmatched ?? [],
  };
}

export function writeMatchFile(file: MatchFile): void {
  writeFileSync(MATCH_FILE, JSON.stringify(file, null, 2));
}

export interface PairResult {
  pairs: Array<[MediaEntry, MediaEntry]>;
  onlyA: MediaEntry[];
  onlyB: MediaEntry[];
  pending: PendingMatch[];
}

export interface PairOptions {
  providerA: ProviderName;
  providerB: ProviderName;
  threshold?: number;
  resolved?: ResolvedMatch[];
  rejected?: RejectedMatch[];
}

export function pairLists(
  a: MediaEntry[],
  b: MediaEntry[],
  opts: PairOptions,
): PairResult {
  const threshold = opts.threshold ?? 0.92;
  const pairs: Array<[MediaEntry, MediaEntry]> = [];
  const matchedB = new Set<MediaEntry>();
  const onlyA: MediaEntry[] = [];
  const onlyB: MediaEntry[] = [];
  const pending: PendingMatch[] = [];

  // 1) cross-ref id: AniList exposes idMal; MAL entries carry malId
  const byMal = new Map<number, MediaEntry>();
  const byAnilist = new Map<number, MediaEntry>();
  for (const e of b) {
    if (e.malId !== undefined) byMal.set(e.malId, e);
    if (e.anilistId !== undefined) byAnilist.set(e.anilistId, e);
  }

  // resolved overrides (manual id pairing)
  const resolvedPairs = new Map<string, string>(); // key: providerA:id => providerB:id
  for (const r of opts.resolved ?? []) {
    const aId = r[`${opts.providerA}Id`] ?? r[opts.providerA];
    const bId = r[`${opts.providerB}Id`] ?? r[opts.providerB];
    if (aId !== undefined && bId !== undefined) {
      resolvedPairs.set(String(aId), String(bId));
    }
  }

  const rejectedKeys = new Set(
    (opts.rejected ?? []).map((r) => `${r.provider}:${r.id}`),
  );

  for (const ea of a) {
    if (rejectedKeys.has(`${opts.providerA}:${ea.providerId}`)) continue;

    // explicit resolved override
    const overrideB = resolvedPairs.get(ea.providerId);
    if (overrideB) {
      const eb = b.find((x) => x.providerId === overrideB);
      if (eb) {
        pairs.push([ea, eb]);
        matchedB.add(eb);
        continue;
      }
    }

    let eb: MediaEntry | undefined;
    if (ea.malId !== undefined) eb = byMal.get(ea.malId);
    if (!eb && ea.anilistId !== undefined) eb = byAnilist.get(ea.anilistId);
    if (eb && !matchedB.has(eb)) {
      pairs.push([ea, eb]);
      matchedB.add(eb);
      continue;
    }

    // 2) title fuzzy
    const candidates = scoreCandidates(ea, b.filter((x) => !matchedB.has(x)));
    const top = candidates[0];
    if (top && top.score >= threshold && (candidates.length === 1 || (candidates[1] && top.score - candidates[1].score >= 0.05))) {
      pairs.push([ea, top.entry]);
      matchedB.add(top.entry);
      continue;
    }

    if (candidates.length === 0 || (top && top.score < 0.6)) {
      onlyA.push(ea);
      continue;
    }

    pending.push({
      kind: ea.kind,
      source: {
        provider: opts.providerA,
        id: ea.providerId,
        title: bestTitle(ea),
      },
      candidates: candidates.slice(0, 5).map((c) => ({
        provider: opts.providerB,
        id: c.entry.providerId,
        title: bestTitle(c.entry),
        score: Math.round(c.score * 1000) / 1000,
      })),
      discoveredAt: new Date().toISOString(),
    });
  }

  for (const eb of b) {
    if (!matchedB.has(eb)) onlyB.push(eb);
  }

  return { pairs, onlyA, onlyB, pending };
}

function bestTitle(e: MediaEntry): string {
  return e.titles.english ?? e.titles.romaji ?? e.titles.native ?? e.providerId;
}

function scoreCandidates(
  source: MediaEntry,
  pool: MediaEntry[],
): Array<{ entry: MediaEntry; score: number }> {
  const titles = collectTitles(source);
  const scored: Array<{ entry: MediaEntry; score: number }> = [];
  for (const candidate of pool) {
    const cand = collectTitles(candidate);
    let best = 0;
    for (const t of titles) {
      for (const c of cand) {
        const s = similarity(t, c);
        if (s > best) best = s;
      }
    }
    if (best > 0.5) scored.push({ entry: candidate, score: best });
  }
  scored.sort((x, y) => y.score - x.score);
  return scored;
}

function collectTitles(e: MediaEntry): string[] {
  const list = [e.titles.romaji, e.titles.english, e.titles.native, ...e.titles.synonyms];
  return list.filter((x): x is string => Boolean(x && x.trim()));
}
