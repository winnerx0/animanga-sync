import { getLoginHandler } from '../providers/registry.ts';
import { log } from '../util/log.ts';

export async function loginCommand(provider: string): Promise<void> {
  const handler = getLoginHandler(provider);
  try {
    await handler();
  } catch (e) {
    log.err((e as Error).message);
    process.exitCode = 1;
  }
}
