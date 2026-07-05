import type { Provider, MediaEntry, MediaKind, EntryPatch, Status } from './types.ts';
import { getToken, setToken } from '../auth/store.ts';
import { readAppConfig } from '../config.ts';
import {
  awaitLoopbackRedirect,
  openBrowser,
  parseRedirectUri,
  randomState,
} from '../auth/oauth.ts';
import { randomBytes } from 'node:crypto';
import { log } from '../util/log.ts';

const API_BASE = 'https://api.myanimelist.net/v2';
const AUTH_URL = 'https://myanimelist.net/v1/oauth2/authorize';
const TOKEN_URL = 'https://myanimelist.net/v1/oauth2/token';

function statusFromMal(s: string, kind: MediaKind): Status {
  if (kind === 'anime') {
    switch (s) {
      case 'watching': return 'current';
      case 'completed': return 'completed';
      case 'on_hold': return 'paused';
      case 'dropped': return 'dropped';
      case 'plan_to_watch': return 'planning';
    }
  } else {
    switch (s) {
      case 'reading': return 'current';
      case 'completed': return 'completed';
      case 'on_hold': return 'paused';
      case 'dropped': return 'dropped';
      case 'plan_to_read': return 'planning';
    }
  }
  return 'planning';
}

function statusToMal(s: Status, kind: MediaKind): string {
  if (s === 'current') return kind === 'anime' ? 'watching' : 'reading';
  if (s === 'planning') return kind === 'anime' ? 'plan_to_watch' : 'plan_to_read';
  if (s === 'paused') return 'on_hold';
  if (s === 'repeating') return kind === 'anime' ? 'watching' : 'reading';
  return s;
}

async function malFetch(path: string, init?: RequestInit & { form?: Record<string, string> }): Promise<Response> {
  const token = requireToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  };
  let body = init?.body;
  if (init?.form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(init.form).toString();
  }
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers, body });
  if (!res.ok) throw new Error(`MAL ${res.status} ${path}: ${await res.text()}`);
  return res;
}

interface MalListNode {
  node: {
    id: number;
    title: string;
    alternative_titles?: { synonyms?: string[]; en?: string; ja?: string };
    num_episodes?: number;
    num_chapters?: number;
  };
  list_status: {
    status: string;
    score: number;
    num_episodes_watched?: number;
    num_chapters_read?: number;
    updated_at: string;
  };
}

export const mal: Provider = {
  name: 'mal',
  async authenticated() {
    return Boolean(getToken('mal')?.accessToken);
  },
  async list(kind: MediaKind): Promise<MediaEntry[]> {
    const path = kind === 'anime' ? '/users/@me/animelist' : '/users/@me/mangalist';
    const fields = [
      'list_status{status,score,num_episodes_watched,num_chapters_read,updated_at}',
      'alternative_titles',
      kind === 'anime' ? 'num_episodes' : 'num_chapters',
    ].join(',');
    const out: MediaEntry[] = [];
    let url = `${path}?fields=${encodeURIComponent(fields)}&limit=1000&nsfw=true`;
    while (url) {
      const res = await malFetch(url.startsWith('/') ? url : url.replace(API_BASE, ''));
      const json = (await res.json()) as { data: MalListNode[]; paging?: { next?: string } };
      for (const item of json.data) {
        const ls = item.list_status;
        const updatedAt = Math.floor(new Date(ls.updated_at).getTime() / 1000);
        out.push({
          providerId: String(item.node.id),
          kind,
          titles: {
            romaji: item.node.title,
            english: item.node.alternative_titles?.en || undefined,
            native: item.node.alternative_titles?.ja || undefined,
            synonyms: item.node.alternative_titles?.synonyms ?? [],
          },
          status: statusFromMal(ls.status, kind),
          progress: kind === 'anime' ? ls.num_episodes_watched ?? 0 : ls.num_chapters_read ?? 0,
          totalUnits: (kind === 'anime' ? item.node.num_episodes : item.node.num_chapters) || undefined,
          score: ls.score || undefined,
          updatedAt,
          malId: item.node.id,
        });
      }
      url = json.paging?.next ?? '';
    }
    return out;
  },
  async update(entry, patch: EntryPatch) {
    const path = entry.kind === 'anime'
      ? `/anime/${entry.providerId}/my_list_status`
      : `/manga/${entry.providerId}/my_list_status`;
    const form: Record<string, string> = {};
    if (patch.status) form.status = statusToMal(patch.status, entry.kind);
    if (patch.progress !== undefined) {
      form[entry.kind === 'anime' ? 'num_watched_episodes' : 'num_chapters_read'] = String(patch.progress);
    }
    if (patch.score !== undefined) form.score = String(Math.round(patch.score));
    await malFetch(path, { method: 'PATCH', form });
  },
  async search(title, kind) {
    const path = kind === 'anime' ? '/anime' : '/manga';
    const res = await malFetch(
      `${path}?q=${encodeURIComponent(title)}&limit=5&fields=alternative_titles,${kind === 'anime' ? 'num_episodes' : 'num_chapters'}`,
    );
    const json = (await res.json()) as { data: Array<{ node: MalListNode['node'] }> };
    return json.data.map((d) => ({
      providerId: String(d.node.id),
      kind,
      titles: {
        romaji: d.node.title,
        english: d.node.alternative_titles?.en || undefined,
        native: d.node.alternative_titles?.ja || undefined,
        synonyms: d.node.alternative_titles?.synonyms ?? [],
      },
      status: 'planning' as const,
      progress: 0,
      totalUnits: (kind === 'anime' ? d.node.num_episodes : d.node.num_chapters) || undefined,
      updatedAt: 0,
      malId: d.node.id,
    }));
  },
  async add({ kind, providerId, status }) {
    const path = kind === 'anime'
      ? `/anime/${providerId}/my_list_status`
      : `/manga/${providerId}/my_list_status`;
    await malFetch(path, { method: 'PATCH', form: { status: statusToMal(status, kind) } });
  },
};

function requireToken(): string {
  const t = getToken('mal')?.accessToken;
  if (!t) throw new Error('Not logged in to MAL. Run `animanga-sync login mal`.');
  return t;
}

function malCodeChallenge(): { verifier: string; challenge: string } {
  const verifier = randomBytes(64).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    .slice(0, 128);
  return { verifier, challenge: verifier };
}

export async function loginMal(): Promise<void> {
  const cfg = readAppConfig().mal;
  if (!cfg?.clientId) {
    throw new Error(
      'Missing MAL client. Set MAL_CLIENT_ID (env or config.json). ' +
        `Register an app at https://myanimelist.net/apidev with redirect URL exactly: ${cfg?.redirectUri ?? 'http://127.0.0.1:5000/callback'}`,
    );
  }
  const redirectUri = cfg.redirectUri!;
  const { port, path } = parseRedirectUri(redirectUri);
  const state = randomState();
  const { verifier, challenge } = malCodeChallenge();

  const url = new URL(AUTH_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', cfg.clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'plain');

  log.info(`Opening browser for MAL login. If it doesn't open, visit:\n  ${url.toString()}`);
  await openBrowser(url.toString());
  const { code } = await awaitLoopbackRedirect({ port, callbackPath: path, expectedState: state, timeoutMs: 5 * 60 * 1000 });

  const form: Record<string, string> = {
    client_id: cfg.clientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  };
  if (cfg.clientSecret) form.client_secret = cfg.clientSecret;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(form).toString(),
  });
  if (!res.ok) throw new Error(`MAL token exchange failed: ${await res.text()}`);
  const t = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number; token_type?: string };
  setToken('mal', {
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiresAt: t.expires_in ? Date.now() + t.expires_in * 1000 : undefined,
    tokenType: t.token_type,
  });
  log.ok('MAL authenticated.');
}
