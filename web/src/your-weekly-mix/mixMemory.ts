/**
 * Wo das "Gedächtnis" des Wochen-Mixes liegt: Playlist-ID und die Titel
 * früherer Mixe (harte Ausschlussliste).
 *
 * Zwei Betriebsarten:
 *  - **ohne Automatik**: alles im localStorage, der Server weiß nichts vom Nutzer
 *  - **mit Automatik**: der Server führt den Zustand, der Browser schreibt dort
 *    hinein. Sonst hätten beide getrennte Ausschlusslisten und würden einander
 *    Titel wiederholen – und ein manuell erzeugter Mix wäre dem Server unbekannt.
 */
import { getAccessToken } from '../shared/auth';
import {
  AUTOGEN_KEY_STORAGE,
  getMixState,
  getPreviousMixIds,
  rememberMixIdsLocally,
  saveMixState,
} from './playlist';

export type MixMemory = {
  /** true = der Server führt den Zustand (Automatik aktiv und erreichbar) */
  onServer: boolean;
  playlistId?: string;
  previousMixIds: Set<string>;
};

function mgmtKey(): string {
  try {
    return localStorage.getItem(AUTOGEN_KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

function localMemory(): MixMemory {
  return { onServer: false, playlistId: getMixState().playlistId, previousMixIds: getPreviousMixIds() };
}

/**
 * Aufruf an die eigene API. Das Tidal-Token geht mit, damit der Server die
 * Identität auch dann prüfen kann, wenn dieser Browser keinen Verwaltungs-Key
 * hat (anderes Gerät, geleerter Speicher).
 */
export async function post<T>(path: string, body: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    headers.Authorization = `Bearer ${await getAccessToken()}`;
  } catch {
    // Nicht angemeldet – dann muss der Verwaltungs-Key im Body reichen
  }
  const response = await fetch(path, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(String(response.status));
  return (await response.json()) as T;
}

/**
 * Lädt den Zustand aus der maßgeblichen Quelle. Ist die Automatik aktiv, aber
 * der Server nicht erreichbar, wird auf den lokalen Stand zurückgefallen: ein
 * veralteter Ausschluss ist besser als ein unbenutzbares Werkzeug.
 */
export async function loadMixMemory(userId: string, autogenEnabled: boolean): Promise<MixMemory> {
  // Kein Verwaltungs-Key nötig: das mitgesendete Tidal-Token weist die Identität nach
  const key = mgmtKey();
  if (!autogenEnabled) return localMemory();

  try {
    const state = await post<{ playlistId?: string; previousMixIds?: string[] }>(
      '/api/autogen/state',
      { userId, key },
    );
    const previousMixIds = new Set(state.previousMixIds ?? []);

    /*
     * Einmalige Übernahme: Wer vor dem Aktivieren manuell generiert hat, hat
     * seine Historie nur lokal. Ohne diesen Schritt bekäme er die alten Titel
     * erneut vorgeschlagen.
     */
    const local = getPreviousMixIds();
    const missing = [...local].filter((id) => !previousMixIds.has(id));
    if (missing.length > 0) {
      try {
        const merged = await post<{ previousMixIds?: string[] }>('/api/autogen/record', {
          userId,
          key,
          trackIds: missing,
          countAsRun: false,
        });
        console.info(`[mix] ${missing.length} lokal gemerkte Titel auf den Server übernommen`);
        return {
          onServer: true,
          playlistId: state.playlistId,
          previousMixIds: new Set(merged.previousMixIds ?? [...previousMixIds, ...missing]),
        };
      } catch {
        // Übernahme fehlgeschlagen – beide Listen für diesen Lauf vereinen
        missing.forEach((id) => previousMixIds.add(id));
      }
    }

    return { onServer: true, playlistId: state.playlistId, previousMixIds };
  } catch (error) {
    console.warn('[mix] Serverzustand nicht lesbar, weiche auf den lokalen aus:', error);
    return localMemory();
  }
}

/**
 * Ergebnis eines manuellen Laufs festhalten – dort, wo der Zustand geführt wird.
 * Wirft, wenn der Server zuständig ist und die Übernahme scheitert: stillschweigend
 * lokal zu schreiben würde zwei auseinanderlaufende Stände erzeugen.
 */
export async function rememberMix(
  memory: MixMemory,
  userId: string,
  trackIds: string[],
  playlistId: string,
): Promise<MixMemory> {
  if (!memory.onServer) {
    rememberMixIdsLocally(trackIds);
    saveMixState({ playlistId, lastSavedAt: new Date().toISOString() });
    return { ...memory, playlistId, previousMixIds: getPreviousMixIds() };
  }

  const result = await post<{ previousMixIds?: string[] }>('/api/autogen/record', {
    userId,
    key: mgmtKey(),
    trackIds,
    playlistId,
    countAsRun: true,
  });
  return {
    onServer: true,
    playlistId,
    previousMixIds: new Set(result.previousMixIds ?? [...memory.previousMixIds, ...trackIds]),
  };
}
