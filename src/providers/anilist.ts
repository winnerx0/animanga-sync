import type { Provider, MediaEntry, MediaKind, EntryPatch, Status } from './types.ts';
import { getToken, setToken } from '../auth/store.ts';
import { readAppConfig } from '../config.ts';
import {
  awaitLoopbackRedirect,
  openBrowser,
  parseRedirectUri,
  randomState,
} from '../auth/oauth.ts';
import { log } from '../util/log.ts';

const API_URL = 'https://graphql.anilist.co';
const AUTH_URL = 'https://anilist.co/api/v2/oauth/authorize';
const TOKEN_URL = 'https://anilist.co/api/v2/oauth/token';

function statusFromAnilist(s: string): Status {
  switch (s) {
    case 'CURRENT': return 'current';
    case 'PLANNING': return 'planning';
    case 'COMPLETED': return 'completed';
    case 'DROPPED': return 'dropped';
    case 'PAUSED': return 'paused';
    case 'REPEATING': return 'repeating';
    default: return 'planning';
  }
}

function statusToAnilist(s: Status): string {
  return s === 'current' ? 'CURRENT' : s.toUpperCase();
}

async function gql<T>(token: string, query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    throw new Error(`AniList ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) throw new Error(`AniList: ${json.errors.map((e) => e.message).join('; ')}`);
  return json.data as T;
}

const VIEWER_QUERY = `query { Viewer { id name } }`;

const LIST_QUERY = `
query ($userId: Int!, $type: MediaType!) {
  MediaListCollection(userId: $userId, type: $type) {
    lists {
      entries {
        id
        status
        progress
        score(format: POINT_10_DECIMAL)
        updatedAt
        media {
          id
          idMal
          episodes
          chapters
          title { romaji english native }
          synonyms
        }
      }
    }
  }
}`;

const SAVE_MUTATION = `
mutation ($mediaId: Int!, $status: MediaListStatus, $progress: Int, $score: Float) {
  SaveMediaListEntry(mediaId: $mediaId, status: $status, progress: $progress, score: $score) {
    id
  }
}`;

interface ViewerData { Viewer: { id: number; name: string } }
interface ListData {
  MediaListCollection: {
    lists: Array<{
      entries: Array<{
        id: number;
        status: string;
        progress: number;
        score: number;
        updatedAt: number;
        media: {
          id: number;
          idMal: number | null;
          episodes: number | null;
          chapters: number | null;
          title: { romaji: string | null; english: string | null; native: string | null };
          synonyms: string[];
        };
      }>;
    }>;
  };
}

export const anilist: Provider = {
  name: 'anilist',
  async authenticated() {
    return Boolean(getToken('anilist')?.accessToken);
  },
  async list(kind: MediaKind): Promise<MediaEntry[]> {
    const token = requireToken();
    const viewer = await gql<ViewerData>(token, VIEWER_QUERY, {});
    const data = await gql<ListData>(token, LIST_QUERY, {
      userId: viewer.Viewer.id,
      type: kind === 'anime' ? 'ANIME' : 'MANGA',
    });
    const entries: MediaEntry[] = [];
    for (const list of data.MediaListCollection.lists) {
      for (const e of list.entries) {
        entries.push({
          providerId: String(e.media.id),
          kind,
          titles: {
            romaji: e.media.title.romaji ?? undefined,
            english: e.media.title.english ?? undefined,
            native: e.media.title.native ?? undefined,
            synonyms: e.media.synonyms ?? [],
          },
          status: statusFromAnilist(e.status),
          progress: e.progress,
          totalUnits: (kind === 'anime' ? e.media.episodes : e.media.chapters) ?? undefined,
          score: e.score || undefined,
          updatedAt: e.updatedAt,
          anilistId: e.media.id,
          malId: e.media.idMal ?? undefined,
        });
      }
    }
    return entries;
  },
  async update(entry, patch: EntryPatch) {
    const token = requireToken();
    await gql(token, SAVE_MUTATION, {
      mediaId: Number(entry.providerId),
      status: patch.status ? statusToAnilist(patch.status) : undefined,
      progress: patch.progress,
      score: patch.score,
    });
  },
  async search(title, kind) {
    const token = requireToken();
    const data = await gql<{
      Page: { media: Array<{ id: number; idMal: number | null; title: ListData['MediaListCollection']['lists'][0]['entries'][0]['media']['title']; synonyms: string[]; episodes: number | null; chapters: number | null }> };
    }>(
      token,
      `query ($search: String!, $type: MediaType!) {
        Page(perPage: 5) {
          media(search: $search, type: $type) {
            id idMal episodes chapters
            title { romaji english native }
            synonyms
          }
        }
      }`,
      { search: title, type: kind === 'anime' ? 'ANIME' : 'MANGA' },
    );
    return data.Page.media.map((m) => ({
      providerId: String(m.id),
      kind,
      titles: {
        romaji: m.title.romaji ?? undefined,
        english: m.title.english ?? undefined,
        native: m.title.native ?? undefined,
        synonyms: m.synonyms ?? [],
      },
      status: 'planning' as const,
      progress: 0,
      totalUnits: (kind === 'anime' ? m.episodes : m.chapters) ?? undefined,
      updatedAt: 0,
      anilistId: m.id,
      malId: m.idMal ?? undefined,
    }));
  },
  async add({ kind, providerId, status }) {
    const token = requireToken();
    await gql(token, SAVE_MUTATION, {
      mediaId: Number(providerId),
      status: statusToAnilist(status),
    });
    void kind;
  },
};

function requireToken(): string {
  const t = getToken('anilist')?.accessToken;
  if (!t) throw new Error('Not logged in to AniList. Run `animanga-sync login anilist`.');
  return t;
}

export async function loginAnilist(): Promise<void> {
  const cfg = readAppConfig().anilist;
  if (!cfg?.clientId || !cfg.clientSecret) {
    throw new Error(
      'Missing AniList client. Set ANILIST_CLIENT_ID and ANILIST_CLIENT_SECRET (env or config.json). ' +
        `Register an app at https://anilist.co/settings/developer with redirect URL exactly: ${cfg?.redirectUri ?? 'http://127.0.0.1:5000/callback'}`,
    );
  }
  const redirectUri = cfg.redirectUri!;
  const { port, path } = parseRedirectUri(redirectUri);
  const state = randomState();
  const url = new URL(AUTH_URL);
  url.searchParams.set('client_id', cfg.clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', state);

  log.info(`Opening browser for AniList login. If it doesn't open, visit:\n  ${url.toString()}`);
  await openBrowser(url.toString());
  const { code } = await awaitLoopbackRedirect({ port, callbackPath: path, expectedState: state, timeoutMs: 5 * 60 * 1000 });

  const tokenRes = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: redirectUri,
      code,
    }),
  });
  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    throw new Error(
      `AniList token exchange failed (HTTP ${tokenRes.status}): ${body}\n` +
        `  client_id sent:    ${cfg.clientId}\n` +
        `  redirect_uri sent: ${redirectUri}\n` +
        `Verify: (1) redirect URL registered on the AniList app is BYTE-EXACTLY this string (no trailing slash, http not https), ` +
        `(2) client secret in ~/.config/animanga-sync/config.json matches the one shown on https://anilist.co/settings/developer.`,
    );
  }
  const t = (await tokenRes.json()) as { access_token: string; refresh_token?: string; expires_in?: number; token_type?: string };
  setToken('anilist', {
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiresAt: t.expires_in ? Date.now() + t.expires_in * 1000 : undefined,
    tokenType: t.token_type,
  });
  log.ok('AniList authenticated.');
}
