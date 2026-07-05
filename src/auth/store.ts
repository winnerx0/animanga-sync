import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { TOKENS_PATH, ensureConfigDir } from '../config.ts';
import type { ProviderName } from '../providers/types.ts';

export interface ProviderTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenType?: string;
}

export type TokenStore = Partial<Record<ProviderName, ProviderTokens>>;

export function readTokens(): TokenStore {
  if (!existsSync(TOKENS_PATH)) return {};
  try {
    return JSON.parse(readFileSync(TOKENS_PATH, 'utf8'));
  } catch {
    return {};
  }
}

export function writeTokens(store: TokenStore): void {
  ensureConfigDir();
  writeFileSync(TOKENS_PATH, JSON.stringify(store, null, 2));
  chmodSync(TOKENS_PATH, 0o600);
}

export function getToken(provider: ProviderName): ProviderTokens | undefined {
  return readTokens()[provider];
}

export function setToken(provider: ProviderName, tokens: ProviderTokens): void {
  const store = readTokens();
  store[provider] = tokens;
  writeTokens(store);
}

export function clearToken(provider: ProviderName): void {
  const store = readTokens();
  delete store[provider];
  writeTokens(store);
}
