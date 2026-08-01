import { KNOWN_MIX_PLAYLIST_NAMES, t } from '../shared/i18n';
import { apiGetPaginated, indexIncluded, type JsonApiResource } from '../shared/tidalClient';
import { fetchTrackDetails, type TrackInfo } from '../shared/tracks';

/**
 * Eingangsdatensatz laut Spezifikation: die letzten 50 in Playlists
 * gespeicherten ODER favorisierten Songs (ohne die automatisch generierte
 * Mix-Playlist), plus Kontextmengen für das Punktesystem.
 */
export type InputSet = {
  /** Die letzten 50 einzigartigen Songs (neueste zuerst), mit Details */
  recentTracks: TrackInfo[];
  /** Alle Track-IDs aus sämtlichen Nutzer-Playlists (+50-Regel) */
  allPlaylistTrackIds: Set<string>;
  /** Artist-IDs aus Playlists + Favoriten (+30-Regel) */
  heardArtistIds: Set<string>;
  /** Genres der 50 Eingangs-Songs (+5-Regel) */
  userGenres: Set<string>;
  /** Unter "Songs" favorisierte Track-IDs – tauchen NIE im Mix auf */
  favoriteTrackIds: Set<string>;
  /**
   * Titel, die aktuell in der Mix-Playlist stehen (= letzter Mix). Werden
   * ausgeschlossen, damit der letzte Mix sich nicht wiederholt – unabhängig
   * davon, ob er im Browser oder vom Server erzeugt wurde (die beiden
   * previousMixIds-Historien sind getrennt).
   */
  mixPlaylistTrackIds: Set<string>;
  playlistCount: number;
  favoriteCount: number;
};

const INPUT_TRACK_COUNT = 50;
const MAX_PLAYLISTS = 50;
const MAX_ITEMS_PER_PLAYLIST = 300;
const MAX_FAVORITES = 1000;
/** So viele der jüngsten Tracks werden für die Interpreten-Menge detailliert geladen */
const HEARD_ARTIST_SAMPLE = 300;
/** Codewort zur Erkennung der eigenen Mix-Playlist (laut Spezifikation) */
const MIX_CODEWORD = 'emphasis';

type DatedTrackId = { id: string; addedAt: number };

function addedAtOf(item: JsonApiResource, fallbackOrder: number): number {
  const raw = (item.meta as { addedAt?: string } | undefined)?.addedAt;
  const parsed = raw ? new Date(raw).getTime() : NaN;
  // Fallback: Reihenfolge der (bereits nach addedAt sortierten) API-Antwort erhalten
  return Number.isNaN(parsed) ? -fallbackOrder : parsed;
}

/** Ist dies die automatisch generierte Mix-Playlist? (ID, Name oder Codewort in Beschreibung) */
function isMixPlaylist(
  playlistId: string,
  details: JsonApiResource | undefined,
  mixPlaylistId?: string,
): boolean {
  if (mixPlaylistId && playlistId === mixPlaylistId) return true;
  const name = details?.attributes?.name;
  if (typeof name === 'string' && KNOWN_MIX_PLAYLIST_NAMES.includes(name.trim())) return true;
  const description = details?.attributes?.description;
  return typeof description === 'string' && description.toLowerCase().includes(MIX_CODEWORD);
}

export async function buildInputSet(
  userId: string,
  mixPlaylistId: string | undefined,
  onStatus: (message: string) => void,
): Promise<InputSet> {
  onStatus(t.statusPlaylists);
  const { data: playlists, included } = await apiGetPaginated(
    `/userCollections/${userId}/relationships/playlists`,
    { sort: '-playlists.lastUpdatedAt', include: 'playlists' },
    MAX_PLAYLISTS,
  );
  const playlistDetails = indexIncluded(included).get('playlists') ?? new Map();

  const ownPlaylists = playlists.filter(
    (playlist) => !isMixPlaylist(playlist.id, playlistDetails.get(playlist.id), mixPlaylistId),
  );

  // Aktuellen Inhalt der Mix-Playlist erfassen (= letzter Mix), um ihn
  // auszuschließen – quellenunabhängig, egal ob Browser oder Server ihn erzeugt hat.
  const mixPlaylistEntry = playlists.find((playlist) =>
    isMixPlaylist(playlist.id, playlistDetails.get(playlist.id), mixPlaylistId),
  );
  const mixPlaylistTrackIds = new Set<string>();
  if (mixPlaylistEntry) {
    try {
      const { data } = await apiGetPaginated(
        `/playlists/${mixPlaylistEntry.id}/relationships/items`,
        {},
        MAX_ITEMS_PER_PLAYLIST,
      );
      for (const item of data) if (item.type === 'tracks') mixPlaylistTrackIds.add(item.id);
    } catch {
      // Mix-Playlist nicht lesbar → dann greift nur die previousMixIds-Historie
    }
  }

  // Playlist-Items einsammeln (mit addedAt aus dem Relationship-Meta)
  const allPlaylistTrackIds = new Set<string>();
  const dated: DatedTrackId[] = [];
  let order = 0;
  for (const playlist of ownPlaylists) {
    try {
      const { data } = await apiGetPaginated(
        `/playlists/${playlist.id}/relationships/items`,
        { sort: '-addedAt' },
        MAX_ITEMS_PER_PLAYLIST,
      );
      for (const item of data) {
        if (item.type !== 'tracks') continue;
        allPlaylistTrackIds.add(item.id);
        dated.push({ id: item.id, addedAt: addedAtOf(item, order++) });
      }
    } catch {
      // einzelne Playlist nicht ladbar → ignorieren
    }
  }

  onStatus(t.statusFavorites);
  const { data: favorites } = await apiGetPaginated(
    `/userCollections/${userId}/relationships/tracks`,
    { sort: '-tracks.addedAt' },
    MAX_FAVORITES,
  );
  for (const item of favorites) {
    dated.push({ id: item.id, addedAt: addedAtOf(item, order++) });
  }

  if (dated.length === 0) throw new Error(t.errorNoFavorites);

  // pro Track die jüngste Speicherung zählen, dann absteigend sortieren
  const newestPerTrack = new Map<string, number>();
  for (const { id, addedAt } of dated) {
    newestPerTrack.set(id, Math.max(newestPerTrack.get(id) ?? -Infinity, addedAt));
  }
  const orderedIds = [...newestPerTrack.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);

  const recentIds = orderedIds.slice(0, INPUT_TRACK_COUNT);

  onStatus(t.statusGenres);
  // Details für Eingangs-Songs + Stichprobe für die Interpreten-Menge
  const sampleIds = orderedIds.slice(0, HEARD_ARTIST_SAMPLE);
  const details = await fetchTrackDetails(sampleIds, (loaded, total) =>
    onStatus(t.statusCandidates(loaded, total)),
  );

  const recentTracks = recentIds
    .map((id) => details.get(id))
    .filter((track): track is TrackInfo => Boolean(track));

  const heardArtistIds = new Set<string>();
  for (const track of details.values()) {
    for (const artistId of track.artistIds) heardArtistIds.add(artistId);
  }

  const userGenres = new Set<string>();
  for (const track of recentTracks) {
    for (const genre of track.genres) userGenres.add(genre);
  }

  return {
    recentTracks,
    allPlaylistTrackIds,
    heardArtistIds,
    userGenres,
    favoriteTrackIds: new Set(favorites.map((item) => item.id)),
    mixPlaylistTrackIds,
    playlistCount: ownPlaylists.length,
    favoriteCount: favorites.length,
  };
}
