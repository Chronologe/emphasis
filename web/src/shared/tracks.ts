import { apiGet, chunk, indexIncluded, type JsonApiResource } from './tidalClient';

export type TrackInfo = {
  id: string;
  title: string;
  version?: string;
  artistIds: string[];
  artistNames: string[];
  albumId?: string;
  albumTitle?: string;
  releaseDate?: string;
  genres: string[];
  popularity?: number;
  /**
   * Tidals KI-Kennzeichnung (`Tracks_Attributes.ai`). Das Feld ist laut
   * Spezifikation optional – fehlt es, ist der Titel *nicht* als KI-Produktion
   * erkannt worden. `undefined` darf deshalb nie wie `true` behandelt werden.
   */
  ai?: boolean;
  /**
   * Dieselbe Kennzeichnung auf Album-Ebene (`Albums_Attributes.ai`). Ein als
   * KI ausgewiesenes Album macht auch seine Titel zu KI-Produktionen – das
   * Feld dient als zweite Quelle, falls die Track-Ebene sie nicht mitliefert.
   */
  albumAi?: boolean;
};

function boolOrUndefined(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

export function relationshipIds(resource: JsonApiResource, name: string): string[] {
  const relation = resource.relationships?.[name]?.data;
  if (!relation) return [];
  return (Array.isArray(relation) ? relation : [relation]).map((r) => r.id);
}

/**
 * Lädt Track-Details (Künstler, Album inkl. releaseDate, Genres) in Batches
 * über GET /tracks?filter[id]=...
 */
export async function fetchTrackDetails(
  trackIds: string[],
  onProgress?: (loaded: number, total: number) => void,
): Promise<Map<string, TrackInfo>> {
  const result = new Map<string, TrackInfo>();
  /*
   * Diagnose zur KI-Kennzeichnung: `ai` ist in Tidals Schema optional. Fehlt es
   * in der Antwort, gibt es zwei mögliche Gründe – die API liefert es gar nicht,
   * oder sie lässt `false` einfach weg. Unterscheiden lässt sich das über
   * `explicit`: ein Pflicht-Boolean. Kommt irgendwo ein `explicit: false` an,
   * überträgt die API falsche Boolesche Werte – dann bedeutet ein fehlendes
   * `ai` tatsächlich, dass es nicht ausgeliefert wird.
   */
  const seenTrackFields = new Set<string>();
  const seenAlbumFields = new Set<string>();
  let falseBooleanSeen = false;
  const uniqueIds = [...new Set(trackIds)];
  const batches = chunk(uniqueIds, 20);

  for (const [batchIndex, ids] of batches.entries()) {
    const params: Record<string, string> = {
      'filter[id]': ids.join(','),
      include: 'artists,albums,genres',
    };
    const document = await apiGet('/tracks', params);
    if (!document?.data) continue;

    const included = indexIncluded(document.included ?? []);
    const artists = included.get('artists') ?? new Map();
    const albums = included.get('albums') ?? new Map();
    const genres = included.get('genres') ?? new Map();

    const data = Array.isArray(document.data) ? document.data : [document.data];
    for (const track of data) {
      const artistIds = relationshipIds(track, 'artists');
      const albumId = relationshipIds(track, 'albums')[0];
      const album = albumId ? albums.get(albumId) : undefined;
      result.set(track.id, {
        id: track.id,
        title: String(track.attributes?.title ?? ''),
        version: track.attributes?.version ? String(track.attributes.version) : undefined,
        artistIds,
        artistNames: artistIds
          .map((id) => artists.get(id)?.attributes?.name)
          .filter(Boolean)
          .map(String),
        albumId,
        albumTitle: album?.attributes?.title ? String(album.attributes.title) : undefined,
        releaseDate: album?.attributes?.releaseDate ? String(album.attributes.releaseDate) : undefined,
        genres: relationshipIds(track, 'genres')
          .map((id) => genres.get(id)?.attributes?.genreName)
          .filter(Boolean)
          .map(String),
        popularity: typeof track.attributes?.popularity === 'number' ? track.attributes.popularity : undefined,
        ai: boolOrUndefined(track.attributes?.ai),
        albumAi: boolOrUndefined(album?.attributes?.ai),
      });

      // Diagnose (siehe reportFieldCoverage): welche Attribute kommen überhaupt an?
      Object.keys(track.attributes ?? {}).forEach((key) => seenTrackFields.add(key));
      Object.keys(album?.attributes ?? {}).forEach((key) => seenAlbumFields.add(key));
      if (track.attributes?.explicit === false) falseBooleanSeen = true;
    }
    onProgress?.(Math.min((batchIndex + 1) * 20, uniqueIds.length), uniqueIds.length);
  }

  console.info(
    `[tracks] gelieferte Track-Attribute: ${[...seenTrackFields].sort().join(', ') || '(keine)'}`,
  );
  console.info(
    `[tracks] gelieferte Album-Attribute: ${[...seenAlbumFields].sort().join(', ') || '(keine)'} ` +
      `| "explicit: false" gesehen: ${falseBooleanSeen ? 'ja' : 'nein'}`,
  );

  await fillGenresFromAlbums(result);
  return result;
}

/**
 * Tidals Genre-Daten auf Track-Ebene sind sehr lückenhaft – für Tracks ohne
 * Genres die Genres des Albums nachladen (GET /albums?filter[id]&include=genres).
 */
async function fillGenresFromAlbums(tracks: Map<string, TrackInfo>): Promise<void> {
  const albumIds = [
    ...new Set(
      [...tracks.values()]
        .filter((track) => track.genres.length === 0 && track.albumId)
        .map((track) => track.albumId as string),
    ),
  ];
  if (albumIds.length === 0) return;

  const albumGenres = new Map<string, string[]>();
  for (const ids of chunk(albumIds, 20)) {
    try {
      const document = await apiGet('/albums', {
        'filter[id]': ids.join(','),
        include: 'genres',
      });
      if (!document?.data) continue;
      const genres = indexIncluded(document.included ?? []).get('genres') ?? new Map();
      const data = Array.isArray(document.data) ? document.data : [document.data];
      for (const album of data) {
        albumGenres.set(
          album.id,
          relationshipIds(album, 'genres')
            .map((id) => genres.get(id)?.attributes?.genreName)
            .filter(Boolean)
            .map(String),
        );
      }
    } catch {
      // Album-Genres sind nur ein Fallback – Fehler nicht fatal
    }
  }

  for (const track of tracks.values()) {
    if (track.genres.length === 0 && track.albumId) {
      track.genres = albumGenres.get(track.albumId) ?? [];
    }
  }
}
