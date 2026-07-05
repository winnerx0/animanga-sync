import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';

const xdgConfig = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config');

export const CONFIG_DIR = join(xdgConfig, 'animanga-sync');
export const TOKENS_PATH = join(CONFIG_DIR, 'tokens.json');
export const APP_CONFIG_PATH = join(CONFIG_DIR, 'config.json');

export const MATCH_FILE = join(process.cwd(), 'match.json');

export interface ProviderOAuthConfig {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
}

export interface AppConfig {
  anilist?: ProviderOAuthConfig;
  mal?: ProviderOAuthConfig;
}

export const DEFAULT_REDIRECT_PORT = 5000;
export const DEFAULT_REDIRECT_URI = `http://127.0.0.1:${DEFAULT_REDIRECT_PORT}/callback`;

export function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

export function readAppConfig(): AppConfig {
  const fileConfig: AppConfig = existsSync(APP_CONFIG_PATH)
    ? JSON.parse(readFileSync(APP_CONFIG_PATH, 'utf8'))
    : {};
  return {
    anilist: {
      clientId: fileConfig.anilist?.clientId ?? process.env.ANILIST_CLIENT_ID,
      clientSecret: fileConfig.anilist?.clientSecret ?? process.env.ANILIST_CLIENT_SECRET,
      redirectUri: fileConfig.anilist?.redirectUri ?? process.env.ANILIST_REDIRECT_URI ?? DEFAULT_REDIRECT_URI,
    },
    mal: {
      clientId: fileConfig.mal?.clientId ?? process.env.MAL_CLIENT_ID,
      clientSecret: fileConfig.mal?.clientSecret ?? process.env.MAL_CLIENT_SECRET,
      redirectUri: fileConfig.mal?.redirectUri ?? process.env.MAL_REDIRECT_URI ?? DEFAULT_REDIRECT_URI,
    },
  };
}

export function writeAppConfig(cfg: AppConfig): void {
  ensureConfigDir();
  writeFileSync(APP_CONFIG_PATH, JSON.stringify(cfg, null, 2));
  chmodSync(APP_CONFIG_PATH, 0o600);
}
