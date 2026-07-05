import { describe, expect, test } from 'bun:test';
import { compareEntries } from './compare.ts';
import type { MediaEntry } from '../providers/types.ts';

function entry(over: Partial<MediaEntry> = {}): MediaEntry {
  return {
    providerId: '1',
    kind: 'anime',
    titles: { synonyms: [] },
    status: 'current',
    progress: 0,
    updatedAt: 0,
    ...over,
  };
}

describe('compareEntries', () => {
  test('equal entries → equal', () => {
    const a = entry({ progress: 5, status: 'current' });
    const b = entry({ progress: 5, status: 'current' });
    expect(compareEntries(a, b)).toEqual({ equal: true });
  });

  test('higher progress wins', () => {
    const a = entry({ progress: 12, status: 'current', updatedAt: 100 });
    const b = entry({ progress: 5, status: 'current', updatedAt: 200 });
    const r = compareEntries(a, b);
    expect(r.equal).toBe(false);
    if (!r.equal) {
      expect(r.winner).toBe('a');
      expect(r.patch.progress).toBe(12);
    }
  });

  test('progress tie → completed beats current', () => {
    const a = entry({ progress: 12, status: 'current', updatedAt: 500 });
    const b = entry({ progress: 12, status: 'completed', updatedAt: 100 });
    const r = compareEntries(a, b);
    expect(r.equal).toBe(false);
    if (!r.equal) {
      expect(r.winner).toBe('b');
      expect(r.patch.status).toBe('completed');
    }
  });

  test('paused vs current → current (higher rank) wins', () => {
    const a = entry({ progress: 5, status: 'paused', updatedAt: 999 });
    const b = entry({ progress: 5, status: 'current', updatedAt: 1 });
    const r = compareEntries(a, b);
    expect(r.equal).toBe(false);
    if (!r.equal) {
      expect(r.winner).toBe('b');
      expect(r.patch.status).toBe('current');
    }
  });

  test('score-only diff propagates from winner', () => {
    const a = entry({ progress: 5, status: 'current', updatedAt: 200, score: 9 });
    const b = entry({ progress: 5, status: 'current', updatedAt: 100 });
    const r = compareEntries(a, b);
    expect(r.equal).toBe(false);
    if (!r.equal) {
      expect(r.winner).toBe('a');
      expect(r.patch.score).toBe(9);
    }
  });
});
