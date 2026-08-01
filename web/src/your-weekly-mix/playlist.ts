import SparkMD5 from 'spark-md5';
import { IS_GERMAN, t } from '../shared/i18n';
import { upsertMixPlaylist } from './mixPlaylist';
import { apiPatch, apiPost } from '../shared/tidalClient';

const PREVIOUS_MIXES_STORAGE_KEY = 'twm-previous-mix-track-ids';
const MIX_STATE_STORAGE_KEY = 'twm-mix-state';
export const PLAYLIST_NAME = t.playlistName;

export type MixState = {
  playlistId?: string;
  lastSavedAt?: string;
};

export type CoverStatus = 'set' | 'no-file' | 'not-allowed' | 'failed';

/** Track-IDs aller früher generierten Mixe (harte Ausschluss-Liste) */
export function getPreviousMixIds(): Set<string> {
  try {
    const raw = localStorage.getItem(PREVIOUS_MIXES_STORAGE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function rememberMixIds(trackIds: string[]): void {
  const all = getPreviousMixIds();
  trackIds.forEach((id) => all.add(id));
  localStorage.setItem(PREVIOUS_MIXES_STORAGE_KEY, JSON.stringify([...all]));
}

export function getMixState(): MixState {
  try {
    return JSON.parse(localStorage.getItem(MIX_STATE_STORAGE_KEY) ?? '{}') as MixState;
  } catch {
    return {};
  }
}

function saveMixState(state: MixState): void {
  localStorage.setItem(MIX_STATE_STORAGE_KEY, JSON.stringify(state));
}

/**
 * Cover-Upload: POST /artworks (MD5 + Größe) → Datei zum uploadLink hochladen →
 * Artwork der Playlist zuweisen. Achtung: Tidal erlaubt das Anlegen von Artworks
 * laut Spec nur internen Apps (Scope w_usr) – daher mit sauberem Fallback.
 */
async function trySetCoverArt(playlistId: string): Promise<CoverStatus> {
  let blob: Blob | undefined;
  for (const file of ['/cover.png', '/cover.jpg']) {
    const response = await fetch(file);
    const type = response.headers.get('Content-Type') ?? '';
    if (response.ok && type.startsWith('image/')) {
      blob = await response.blob();
      break;
    }
  }
  if (!blob) return 'no-file';

  try {
    const buffer = await blob.arrayBuffer();
    const md5Hash = btoa(SparkMD5.ArrayBuffer.hash(buffer, true));

    const created = await apiPost('/artworks', {
      data: {
        type: 'artworks',
        attributes: {
          mediaType: 'IMAGE',
          sourceFile: { md5Hash, size: blob.size },
        },
      },
    });
    const artwork = Array.isArray(created?.data) ? created?.data[0] : created?.data;
    const sourceFile = (artwork?.attributes as
      | { sourceFile?: { uploadLink?: { href?: string; meta?: { headers?: Record<string, string> } } } }
      | undefined)?.sourceFile;
    const uploadHref = sourceFile?.uploadLink?.href;
    if (!artwork?.id || !uploadHref) return 'failed';

    const upload = await fetch(uploadHref, {
      method: 'PUT',
      headers: {
        'Content-Type': blob.type || 'image/png',
        ...(sourceFile?.uploadLink?.meta?.headers ?? {}),
      },
      body: blob,
    });
    if (!upload.ok) return 'failed';

    // Artwork-Verarbeitung braucht ggf. einen Moment → Zuweisung mit Retry
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const result = await apiPatch(`/playlists/${playlistId}/relationships/coverArt`, {
          data: [{ id: artwork.id, type: 'artworks' }],
        });
        if (result === null) throw new Error('Artwork noch nicht verfügbar (404)');
        return 'set';
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 2500));
      }
    }
    return 'failed';
  } catch (error) {
    console.warn('Cover-Upload fehlgeschlagen:', error);
    const message = error instanceof Error ? error.message : '';
    return message.includes(' 403') || message.includes(' 401') ? 'not-allowed' : 'failed';
  }
}

export async function saveMixAsPlaylist(
  trackIds: string[],
  userId: string,
): Promise<{ playlistId: string; name: string; coverStatus: CoverStatus }> {
  let playlistId: string;
  try {
    playlistId = await upsertMixPlaylist(
      trackIds,
      PLAYLIST_NAME,
      getMixState().playlistId,
      userId,
      IS_GERMAN ? 'de' : 'en',
    );
  } catch (error) {
    throw error instanceof Error && error.message.startsWith('Playlist create failed')
      ? new Error(t.errorPlaylistCreate)
      : error;
  }

  const coverStatus = await trySetCoverArt(playlistId);

  rememberMixIds(trackIds);
  saveMixState({ playlistId, lastSavedAt: new Date().toISOString() });
  return { playlistId, name: PLAYLIST_NAME, coverStatus };
}
