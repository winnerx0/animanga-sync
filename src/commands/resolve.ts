import * as p from '@clack/prompts';
import { readMatchFile, writeMatchFile, type ResolvedMatch } from '../sync/match.ts';
import { log } from '../util/log.ts';

export async function resolveCommand(): Promise<void> {
  const file = readMatchFile();
  if (!file.pending.length) {
    log.ok('No pending matches.');
    return;
  }

  p.intro(`Resolving ${file.pending.length} pending match${file.pending.length === 1 ? '' : 'es'}`);

  const remaining = [...file.pending];
  while (remaining.length) {
    const item = remaining.shift()!;
    const choice = await p.select({
      message: `[${item.kind}] ${item.source.provider}#${item.source.id} — "${item.source.title}"`,
      options: [
        ...item.candidates.map((c, i) => ({
          value: `pick:${i}`,
          label: `Pick ${c.provider}#${c.id} — "${c.title}" (score=${c.score})`,
        })),
        { value: 'reject', label: 'Reject (no match exists)' },
        { value: 'skip', label: 'Skip for now' },
        { value: 'quit', label: 'Quit' },
      ],
    });

    if (p.isCancel(choice) || choice === 'quit') break;
    if (choice === 'skip') {
      file.pending.push(item); // re-queue at end
      continue;
    }
    if (choice === 'reject') {
      file.rejected.push({
        kind: item.kind,
        provider: item.source.provider,
        id: item.source.id,
        note: 'no match',
      });
      removePending(file, item);
      continue;
    }
    if (typeof choice === 'string' && choice.startsWith('pick:')) {
      const idx = Number(choice.slice('pick:'.length));
      const cand = item.candidates[idx];
      if (!cand) continue;
      const r: ResolvedMatch = { kind: item.kind };
      r[`${item.source.provider}Id`] = numberish(item.source.id);
      r[`${cand.provider}Id`] = numberish(cand.id);
      file.resolved.push(r);
      removePending(file, item);
    }
  }

  // dedupe pending
  const seen = new Set<string>();
  file.pending = file.pending.filter((x) => {
    const k = `${x.source.provider}:${x.source.id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  writeMatchFile(file);
  p.outro('Saved match.json');
}

function removePending(file: ReturnType<typeof readMatchFile>, item: { source: { provider: string; id: string } }): void {
  file.pending = file.pending.filter(
    (x) => !(x.source.provider === item.source.provider && x.source.id === item.source.id),
  );
}

function numberish(v: string): number | string {
  const n = Number(v);
  return Number.isFinite(n) ? n : v;
}
