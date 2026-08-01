import { KNOWN_MIX_PLAYLIST_NAMES } from '../shared/i18n';
import {
  createPlaylist,
  playlistExists,
  replacePlaylistItems,
} from '../shared/playlistItems';
import { apiGetPaginated, apiPatch, indexIncluded } from '../shared/tidalClient';

import { weeklyMixDescription, type Lang } from '../shared/descriptions';

/** Codewort in der Beschreibung, an dem die eigene Mix-Playlist erkannt wird */
const MIX_CODEWORD = 'emphasis';

/**
 * Fallback laut Spezifikation: Ist keine (gültige) Playlist-ID gemerkt, wird die
 * bestehende Mix-Playlist über Name ODER Beschreibung (Codewort) wiedergefunden,
 * statt eine neue anzulegen.
 */
export async function findExistingMixPlaylist(userId: string): Promise<string | undefined> {
  try {
    const { data, included } = await apiGetPaginated(
      `/userCollections/${userId}/relationships/playlists`,
      { include: 'playlists' },
      50,
    );
    const details = indexIncluded(included).get('playlists') ?? new Map();
    for (const playlist of data) {
      const attributes = details.get(playlist.id)?.attributes as
        | { name?: string; description?: string }
        | undefined;
      if (attributes?.name && KNOWN_MIX_PLAYLIST_NAMES.includes(attributes.name.trim())) {
        return playlist.id;
      }
      if (attributes?.description?.toLowerCase().includes(MIX_CODEWORD)) return playlist.id;
    }
  } catch {
    // Fallback-Suche fehlgeschlagen → neue Playlist wird angelegt
  }
  return undefined;
}

/**
 * Gemeinsamer Kern für Browser und Auto-Generierungs-Server:
 * legt die Mix-Playlist an bzw. überschreibt die bestehende (Items ersetzen).
 * Liefert die (ggf. neue) Playlist-ID.
 */
export async function upsertMixPlaylist(
  trackIds: string[],
  name: string,
  existingPlaylistId?: string,
  userId?: string,
  lang: Lang = 'en',
): Promise<string> {
  // Beschreibung trägt den Zeitpunkt der Erstellung
  const description = weeklyMixDescription(lang);

  let playlistId = existingPlaylistId;
  if ((!playlistId || !(await playlistExists(playlistId))) && userId) {
    playlistId = await findExistingMixPlaylist(userId);
  }

  if (playlistId && (await playlistExists(playlistId))) {
    await apiPatch(`/playlists/${playlistId}`, {
      data: { id: playlistId, type: 'playlists', attributes: { name, description } },
    });
    // Der Wochen-Mix wird bewusst komplett ersetzt: er ist jede Woche neu.
    await replacePlaylistItems(playlistId, trackIds);
    return playlistId;
  }

  return createPlaylist(name, description, trackIds);
}
