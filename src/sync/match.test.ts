import { describe, expect, test } from 'bun:test';
import { pairLists } from './match.ts';
import type { MediaEntry } from '../providers/types.ts';

function e(over: Partial<MediaEntry>): MediaEntry {
  return {
    providerId: '0',
    kind: 'anime',
    titles: { synonyms: [] },
    status: 'current',
    progress: 0,
    updatedAt: 0,
    ...over,
  };
}

describe('pairLists', () => {
  test('cross-ref by malId pairs entries', () => {
    const a = [e({ providerId: '1', anilistId: 1, malId: 100, titles: { romaji: 'Foo', synonyms: [] } })];
    const b = [e({ providerId: '100', malId: 100, titles: { romaji: 'FooMal', synonyms: [] } })];
    const r = pairLists(a, b, { providerA: 'anilist', providerB: 'mal' });
    expect(r.pairs.length).toBe(1);
    expect(r.pending.length).toBe(0);
  });

  test('fuzzy title above threshold pairs; ambiguous goes to pending', () => {
    const a = [e({ providerId: '1', titles: { romaji: 'Attack on Titan', synonyms: [] } })];
    const b = [
      e({ providerId: '10', titles: { romaji: 'Attack on Titan', synonyms: [] } }),
      e({ providerId: '11', titles: { romaji: 'Attack on Titan: Junior High', synonyms: [] } }),
    ];
    const r = pairLists(a, b, { providerA: 'anilist', providerB: 'mal' });
    expect(r.pairs.length).toBe(1);
    expect(r.pairs[0]?.[1].providerId).toBe('10');
  });

  test('resolved override forces a pair', () => {
    const a = [e({ providerId: '1', titles: { romaji: 'Wholly Different A', synonyms: [] } })];
    const b = [e({ providerId: '999', titles: { romaji: 'Wholly Different B', synonyms: [] } })];
    const r = pairLists(a, b, {
      providerA: 'anilist',
      providerB: 'mal',
      resolved: [{ anilistId: 1, malId: 999 }],
    });
    expect(r.pairs.length).toBe(1);
  });
});
