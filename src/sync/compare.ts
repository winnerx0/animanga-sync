import type { EntryPatch, MediaEntry, Status } from '../providers/types.ts';

const statusRank: Record<Status, number> = {
  completed: 4,
  repeating: 3,
  current: 3,
  paused: 2,
  dropped: 1,
  planning: 0,
};

export type CompareResult =
  | { equal: true }
  | { equal: false; winner: 'a' | 'b'; patch: EntryPatch };

export function compareEntries(a: MediaEntry, b: MediaEntry): CompareResult {
  const sameStatus = a.status === b.status;
  const sameProgress = a.progress === b.progress;
  const sameScore = (a.score ?? 0) === (b.score ?? 0);
  if (sameStatus && sameProgress && sameScore) return { equal: true };

  const winner = pickWinner(a, b);
  const w = winner === 'a' ? a : b;
  const l = winner === 'a' ? b : a;

  const patch: EntryPatch = {};
  if (w.status !== l.status) patch.status = w.status;
  if (w.progress !== l.progress) patch.progress = w.progress;
  if ((w.score ?? 0) !== (l.score ?? 0) && w.score !== undefined) patch.score = w.score;

  if (Object.keys(patch).length === 0) return { equal: true };
  return { equal: false, winner, patch };
}

function pickWinner(a: MediaEntry, b: MediaEntry): 'a' | 'b' {
  if (a.progress !== b.progress) return a.progress > b.progress ? 'a' : 'b';
  const ra = statusRank[a.status];
  const rb = statusRank[b.status];
  if (ra !== rb) return ra > rb ? 'a' : 'b';
  return a.updatedAt >= b.updatedAt ? 'a' : 'b';
}
