import { apiGetPaginated } from './tidalClient';

/**
 * Die Sammlung des Nutzers („Meine Sammlung") – favorisierte Titel und
 * abonnierte Playlists.
 *
 * Anfang September 2026 hat Tidal die Ressource `userCollections` ersatzlos
 * abgeschaltet (404). An ihre Stelle sind getrennte Ressourcen getreten, die
 * ihren Inhalt einheitlich über die Beziehung `items` ausliefern. Zwei
 * Änderungen fallen dabei auf:
 *
 *  - Die Ressourcen-ID ist jetzt eine Base62-Kennung, nicht mehr die
 *    numerische User-ID („Invalid resource ID: Must be a Base62-encoded user
 *    ID"). Einen Weg, sie aus der numerischen ID abzuleiten, gibt es nicht –
 *    wohl aber `me`, das immer zu dem Token passt, mit dem gerade gearbeitet
 *    wird. Deshalb braucht hier keine Funktion mehr eine User-ID.
 *  - Die Beziehung heißt `items` statt `tracks`/`playlists`; entsprechend
 *    lautet auch der Sortierschlüssel `-addedAt` statt `-tracks.addedAt`.
 *
 * Beide Endpunkte liegen bewusst an einer Stelle: Tidal hat sie schon einmal
 * unangekündigt verschoben, und dann soll genau eine Datei zu ändern sein.
 */
const FAVORITE_TRACKS = '/userCollectionTracks/me/relationships/items';
const COLLECTION_PLAYLISTS = '/userCollectionPlaylists/me/relationships/items';

/**
 * Favorisierte Titel, neueste zuerst. Die Einträge tragen die Track-ID und
 * `meta.addedAt`; Details müssen separat geladen werden.
 */
export function fetchFavoriteTrackItems(maxItems: number) {
  return apiGetPaginated(FAVORITE_TRACKS, { sort: '-addedAt' }, maxItems, { requireFound: true });
}

/**
 * Playlists der Sammlung. `include=items` liefert die vollständigen
 * Playlist-Ressourcen (Typ `playlists`) im `included`-Block mit.
 */
export function fetchCollectionPlaylists(maxItems: number) {
  return apiGetPaginated(
    COLLECTION_PLAYLISTS,
    { sort: '-addedAt', include: 'items' },
    maxItems,
    { requireFound: true },
  );
}
