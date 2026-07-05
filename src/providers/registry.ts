import type { Provider, ProviderName } from './types.ts';
import { anilist, loginAnilist } from './anilist.ts';
import { mal, loginMal } from './mal.ts';

const providers = new Map<ProviderName, Provider>();
const loginHandlers = new Map<ProviderName, () => Promise<void>>();

function register(p: Provider, login: () => Promise<void>): void {
  providers.set(p.name, p);
  loginHandlers.set(p.name, login);
}

register(anilist, loginAnilist);
register(mal, loginMal);

export function getProvider(name: ProviderName): Provider {
  const p = providers.get(name);
  if (!p) throw new Error(`Unknown provider: ${name}. Known: ${[...providers.keys()].join(', ')}`);
  return p;
}

export function getLoginHandler(name: ProviderName): () => Promise<void> {
  const h = loginHandlers.get(name);
  if (!h) throw new Error(`No login handler for provider: ${name}`);
  return h;
}

export function listProviders(): ProviderName[] {
  return [...providers.keys()];
}
