export type MediaKind = 'anime' | 'manga';

export type Status =
  | 'planning'
  | 'current'
  | 'completed'
  | 'paused'
  | 'dropped'
  | 'repeating';

export interface MediaTitles {
  romaji?: string;
  english?: string;
  native?: string;
  synonyms: string[];
}

export interface MediaEntry {
  providerId: string;
  kind: MediaKind;
  titles: MediaTitles;
  status: Status;
  progress: number;
  totalUnits?: number;
  score?: number;
  updatedAt: number;
  malId?: number;
  anilistId?: number;
}

export type EntryPatch = Partial<Pick<MediaEntry, 'status' | 'progress' | 'score'>>;

export type ProviderName = 'anilist' | 'mal' | (string & {});

export interface Provider {
  readonly name: ProviderName;
  authenticated(): Promise<boolean>;
  list(kind: MediaKind): Promise<MediaEntry[]>;
  update(entry: MediaEntry, patch: EntryPatch): Promise<void>;
  search(title: string, kind: MediaKind): Promise<MediaEntry[]>;
  add?(entry: { kind: MediaKind; providerId: string; status: Status }): Promise<void>;
}
