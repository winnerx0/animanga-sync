# animanga-sync

CLI for syncing your anime & manga lists across **AniList** and **MAL**, written in TypeScript on Bun.
The architecture is provider-pluggable so additional manga sites, movies, or TV trackers can be added later.

## How sync decides which side wins

For each entry pair (matched by cross-ref id, then by fuzzy title):

1. Highest `progress` (episodes / chapters) wins.
2. Tie? Highest status rank wins. `completed > current = repeating > paused > dropped > planning`.
3. Still tied? Most recent `updatedAt` wins.

The lagging side is patched with `{ status, progress, score }` from the winner.
Title pairs that are ambiguous (similarity below 0.92, or multiple close candidates) are written to `match.json` for later interactive triage.

## Setup

```bash
bun install
```

Register OAuth apps and set credentials (env or `~/.config/animanga-sync/config.json`):

Both providers require an **exact match** between the redirect URL registered on the OAuth app and the one the CLI sends. Default is `http://127.0.0.1:5000/callback` — register that exact string, or override with `ANILIST_REDIRECT_URI` / `MAL_REDIRECT_URI` (or `redirectUri` in `config.json`).

- **AniList** → https://anilist.co/settings/developer
  - Redirect URL: `http://127.0.0.1:5000/callback`
  - env: `ANILIST_CLIENT_ID`, `ANILIST_CLIENT_SECRET`, optional `ANILIST_REDIRECT_URI`
- **MAL** → https://myanimelist.net/apidev
  - App type: *Other*. Redirect URL: `http://127.0.0.1:5000/callback`
  - env: `MAL_CLIENT_ID` (and `MAL_CLIENT_SECRET` if your app type issues one), optional `MAL_REDIRECT_URI`

If port `5000` is already in use, register a different `http://127.0.0.1:<port>/callback` on the OAuth app and set the matching `*_REDIRECT_URI` env var.

Example `~/.config/animanga-sync/config.json`:

```json
{
  "anilist": { "clientId": "…", "clientSecret": "…", "redirectUri": "http://127.0.0.1:5000/callback" },
  "mal":     { "clientId": "…", "redirectUri": "http://127.0.0.1:5000/callback" }
}
```

## Commands

```bash
animanga-sync login anilist
animanga-sync login mal
animanga-sync status

# Show what would change without writing
animanga-sync sync --dry-run

# Sync only manga
animanga-sync sync --kind manga

# Triage pending matches
animanga-sync resolve

# Bulk-add from a wordlist (one title per line)
animanga-sync import titles.txt --kind anime --target anilist,mal --status planning
```

## match.json

```jsonc
{
  "pending":   [ /* unresolved title matches */ ],
  "resolved":  [ { "kind": "anime", "anilistId": 1, "malId": 100 } ],
  "rejected":  [ { "provider": "anilist", "id": "1", "note": "no MAL equivalent" } ],
  "unmatched": [ { "kind": "anime", "provider": "mal", "id": "456", "title": "...", "status": "current", "progress": 3 } ]
}
```

`resolved` entries act as manual overrides on subsequent runs. `rejected` entries are skipped. `unmatched` lists entries that exist on one side with no counterpart on the other — replaced on every run for the kinds you synced.

## Tests

```bash
bun test
```

## Adding a provider

1. Implement the `Provider` interface from `src/providers/types.ts`.
2. Register it in `src/providers/registry.ts`.
3. Pass `--provider-a` / `--provider-b` to `sync` to use it.

## Build a single binary

```bash
bun build --compile --outfile animanga-sync src/index.ts
```
