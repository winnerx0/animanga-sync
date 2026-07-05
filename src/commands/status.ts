import { listProviders } from '../providers/registry.ts';
import { getToken } from '../auth/store.ts';
import { readMatchFile } from '../sync/match.ts';
import { log } from '../util/log.ts';

export async function statusCommand(): Promise<void> {
  for (const name of listProviders()) {
    const t = getToken(name);
    if (t?.accessToken) log.ok(`${name}: authenticated`);
    else log.warn(`${name}: not logged in`);
  }
  const m = readMatchFile();
  log.info(`match.json — pending=${m.pending.length} resolved=${m.resolved.length} rejected=${m.rejected.length}`);
}
