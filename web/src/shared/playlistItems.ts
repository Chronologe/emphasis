import { apiDelete, apiGet, apiGetPaginated, apiPatch, apiPost, chunk } from './tidalClient';

/** Von beiden Tools genutzte Playlist-Grundoperationen. */

const MAX_ITEMS = 500;
/** Tidal erlaubt maximal 20 Einträge pro Schreibvorgang */
const BATCH = 20;

export async function playlistExists(playlistId: string): Promise<boolean> {
  try {
    const document = await apiGet(`/playlists/${playlistId}`);
    return Boolean(document?.data);
  } catch {
    return false;
  }
}

export type PlaylistInfo = {
  id: string;
  name: string;
  description?: string;
  numberOfItems?: number;
  lastModifiedAt?: string;
};

export async function fetchPlaylistInfo(playlistId: string): Promise<PlaylistInfo | undefined> {
  const document = await apiGet(`/playlists/${playlistId}`);
  const data = Array.isArray(document?.data) ? document?.data[0] : document?.data;
  if (!data) return undefined;
  const attributes = (data.attributes ?? {}) as Record<string, unknown>;
  return {
    id: data.id,
    name: String(attributes.name ?? ''),
    description: attributes.description ? String(attributes.description) : undefined,
    numberOfItems:
      typeof attributes.numberOfItems === 'number' ? attributes.numberOfItems : undefined,
    lastModifiedAt: attributes.lastModifiedAt ? String(attributes.lastModifiedAt) : undefined,
  };
}

/** Track-IDs einer Playlist in ihrer Reihenfolge */
export async function fetchPlaylistTrackIds(playlistId: string): Promise<string[]> {
  const { data } = await apiGetPaginated(
    `/playlists/${playlistId}/relationships/items`,
    {},
    MAX_ITEMS,
  );
  return data.filter((item) => item.type === 'tracks').map((item) => item.id);
}

export async function addPlaylistTracks(playlistId: string, trackIds: string[]): Promise<void> {
  for (const batch of chunk(trackIds, BATCH)) {
    await apiPost(`/playlists/${playlistId}/relationships/items`, {
      data: batch.map((id) => ({ id, type: 'tracks' })),
    });
  }
}

/**
 * Ersetzt den Inhalt einer Playlist vollständig.
 * PATCH auf die Items-Relationship ist bei Tidal zum Umsortieren gedacht und
 * verlangt die itemId bestehender Einträge – daher DELETE (mit itemId aus dem
 * GET) und anschließend POST der neuen Titel.
 */
export async function replacePlaylistItems(playlistId: string, trackIds: string[]): Promise<void> {
  const { data: currentItems } = await apiGetPaginated(
    `/playlists/${playlistId}/relationships/items`,
    {},
    MAX_ITEMS,
  );
  const removable = currentItems
    .map((item) => ({
      id: item.id,
      type: item.type,
      meta: { itemId: (item.meta as { itemId?: string } | undefined)?.itemId },
    }))
    .filter((item) => Boolean(item.meta.itemId));

  for (const batch of chunk(removable, BATCH)) {
    await apiDelete(`/playlists/${playlistId}/relationships/items`, { data: batch });
  }
  await addPlaylistTracks(playlistId, trackIds);
}

/**
 * Gleicht eine Playlist auf den Zielbestand ab, OHNE die Reihenfolge der
 * bereits vorhandenen Titel anzutasten: es werden nur die überzähligen
 * Einträge entfernt und die fehlenden hinten angehängt.
 *
 * (replacePlaylistItems würde alles löschen und neu schreiben – dabei ginge
 * jede manuelle Sortierung verloren.)
 */
export async function applyPlaylistDelta(
  playlistId: string,
  targetIds: string[],
): Promise<{ added: number; removed: number }> {
  const { data: currentItems } = await apiGetPaginated(
    `/playlists/${playlistId}/relationships/items`,
    {},
    MAX_ITEMS,
  );
  const tracks = currentItems.filter((item) => item.type === 'tracks');
  const target = new Set(targetIds);
  const present = new Set(tracks.map((item) => item.id));

  const removable = tracks
    .filter((item) => !target.has(item.id))
    .map((item) => ({
      id: item.id,
      type: item.type,
      meta: { itemId: (item.meta as { itemId?: string } | undefined)?.itemId },
    }))
    .filter((item) => Boolean(item.meta.itemId));

  for (const batch of chunk(removable, BATCH)) {
    await apiDelete(`/playlists/${playlistId}/relationships/items`, { data: batch });
  }

  const missing = targetIds.filter((id) => !present.has(id));
  await addPlaylistTracks(playlistId, missing);

  return { added: missing.length, removed: removable.length };
}

/** Beschreibung aktualisieren (Name bleibt unverändert) */
export async function updatePlaylistDescription(
  playlistId: string,
  name: string,
  description: string,
): Promise<void> {
  await apiPatch(`/playlists/${playlistId}`, {
    data: { id: playlistId, type: 'playlists', attributes: { name, description } },
  });
}

export async function createPlaylist(
  name: string,
  description: string,
  trackIds: string[] = [],
): Promise<string> {
  const created = await apiPost('/playlists', {
    data: { type: 'playlists', attributes: { name, description, accessType: 'UNLISTED' } },
  });
  const playlist = Array.isArray(created?.data) ? created?.data[0] : created?.data;
  const playlistId = playlist?.id;
  if (!playlistId) throw new Error('Playlist create failed: no ID in response');
  if (trackIds.length > 0) await addPlaylistTracks(playlistId, trackIds);
  return playlistId;
}

/** Eigene Playlists des Nutzers (für Auswahllisten) */
export async function fetchOwnPlaylists(userId: string): Promise<PlaylistInfo[]> {
  const { data, included } = await apiGetPaginated(
    `/userCollections/${userId}/relationships/playlists`,
    { sort: '-playlists.lastUpdatedAt', include: 'playlists' },
    100,
  );
  const details = new Map(included.filter((r) => r.type === 'playlists').map((r) => [r.id, r]));
  return data
    .map((entry) => {
      const attributes = (details.get(entry.id)?.attributes ?? {}) as Record<string, unknown>;
      return {
        id: entry.id,
        name: String(attributes.name ?? ''),
        description: attributes.description ? String(attributes.description) : undefined,
        numberOfItems:
          typeof attributes.numberOfItems === 'number' ? attributes.numberOfItems : undefined,
        lastModifiedAt: attributes.lastModifiedAt ? String(attributes.lastModifiedAt) : undefined,
      };
    })
    .filter((playlist) => playlist.name);
}
