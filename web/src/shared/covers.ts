import { apiGet, chunk, indexIncluded } from './tidalClient';
import { relationshipIds, type TrackInfo } from './tracks';

const MAX_COVERS = 40;
const TARGET_WIDTH = 320;

type ArtworkFile = { href?: string; meta?: { width?: number; height?: number } };

/**
 * Lädt Cover-URLs der Alben der übergebenen Tracks für die Hintergrund-Collage.
 * Fehler sind unkritisch – dann bleibt es bei den generierten Fake-Covern.
 */
export async function fetchCoverUrls(tracks: TrackInfo[]): Promise<string[]> {
  const albumIds = [
    ...new Set(tracks.map((track) => track.albumId).filter((id): id is string => Boolean(id))),
  ].slice(0, MAX_COVERS);

  const urls: string[] = [];
  try {
    for (const ids of chunk(albumIds, 20)) {
      const document = await apiGet('/albums', {
        'filter[id]': ids.join(','),
        include: 'coverArt',
      });
      if (!document?.data) continue;
      const artworks = indexIncluded(document.included ?? []).get('artworks') ?? new Map();
      const albums = Array.isArray(document.data) ? document.data : [document.data];
      for (const album of albums) {
        const artworkId = relationshipIds(album, 'coverArt')[0];
        const files = (artworks.get(artworkId)?.attributes?.files ?? []) as ArtworkFile[];
        // kleinste Datei, die noch >= Zielbreite ist (sonst die größte vorhandene)
        const sorted = files
          .filter((file) => file.href)
          .sort((a, b) => (a.meta?.width ?? 0) - (b.meta?.width ?? 0));
        const best = sorted.find((file) => (file.meta?.width ?? 0) >= TARGET_WIDTH) ?? sorted.at(-1);
        if (best?.href) urls.push(best.href);
      }
    }
  } catch (error) {
    console.warn('Cover für Collage konnten nicht geladen werden:', error);
  }
  return [...new Set(urls)];
}
