import type { TrackInfo } from '../shared/tracks';

/**
 * Punktesystem laut Spezifikation "Score basierte Playlist Generierung".
 */

export type ScoreContext = {
  /** Alle Track-IDs aus sämtlichen Nutzer-Playlists (+50-Regel) */
  allPlaylistTrackIds: Set<string>;
  /** Artist-IDs, die bereits in Playlists/Favoriten vorkommen (+30-Regel, ID-Vergleich!) */
  heardArtistIds: Set<string>;
  /** Von Tidal als "ähnlich" eingestufte, noch nicht gehörte Interpreten ("neue Interpreten") */
  newArtistIds: Set<string>;
  /** Genres, die der Nutzer hört (+5-Regel) */
  userGenres: Set<string>;
  /** artistId → trackId → Rang (1-basiert) in den popularity-sortierten Songs des Interpreten */
  artistTopRank: Map<string, Map<string, number>>;
};

export type SongScoreBreakdown = {
  notInPlaylist: number;
  heardArtist: number;
  recency: number;
  topRank: number;
  genre: number;
  total: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const TARGET_SIZE = 20;
export const PLAYLIST_TARGET_SIZE = TARGET_SIZE;

/**
 * Hörbuch/Hörspiel/Podcast-Ausschluss: Keyword-Prüfung (de/en) auf Titel + Album.
 * Nummerierte Muster (Kapitel 12, Part 3 …) nur mit Zahl, um False Positives
 * bei normalen Songtiteln zu vermeiden.
 */
const EXCLUDED_CONTENT_PATTERNS: RegExp[] = [
  /\bhörbuch\b/i,
  /\bhörspiel\b/i,
  /\bhoerbuch\b/i,
  /\bhoerspiel\b/i,
  /\bpodcast\b/i,
  /\baudiobook\b/i,
  /\baudio ?drama\b/i,
  /\baudio ?play\b/i,
  /\blesung\b/i,
  /\bungekürzt\b/i,
  /\bgekürzt\b/i,
  /\bunabridged\b/i,
  /\babridged\b/i,
  /\bkapitel\s*\d+/i,
  /\bchapter\s*\d+/i,
  /\bfolge\s*\d+/i,
  /\bepisode\s*\d+/i,
  /\bteil\s*\d+\b/i,
  /\bpart\s*\d+\b/i,
  /\btrack\s*\d+\s*(von|of)\s*\d+/i,
];

export function isExcludedContent(track: TrackInfo): boolean {
  const haystack = `${track.title} ${track.version ?? ''} ${track.albumTitle ?? ''}`;
  return EXCLUDED_CONTENT_PATTERNS.some((pattern) => pattern.test(haystack));
}

/** Titel+Künstler normalisiert, um Remaster/andere Versionen als Duplikat zu erkennen */
export function duplicateKey(track: TrackInfo): string {
  const title = track.title
    .toLowerCase()
    .replace(/\s*[([].*?[)\]]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return `${title}::${(track.artistNames[0] ?? '').toLowerCase()}`;
}

function isHeardArtistTrack(track: TrackInfo, context: ScoreContext): boolean {
  return track.artistIds.some((id) => context.heardArtistIds.has(id));
}

function isNewArtistTrack(track: TrackInfo, context: ScoreContext): boolean {
  return !isHeardArtistTrack(track, context) && track.artistIds.some((id) => context.newArtistIds.has(id));
}

function topRankOf(track: TrackInfo, context: ScoreContext): number | undefined {
  for (const artistId of track.artistIds) {
    const rank = context.artistTopRank.get(artistId)?.get(track.id);
    if (rank !== undefined) return rank;
  }
  return undefined;
}

export function songScore(track: TrackInfo, context: ScoreContext): SongScoreBreakdown {
  const notInPlaylist = context.allPlaylistTrackIds.has(track.id) ? 0 : 50;
  const heardArtist = isHeardArtistTrack(track, context) ? 30 : 0;

  let recency = 0;
  if (track.releaseDate) {
    const ageDays = (Date.now() - new Date(track.releaseDate).getTime()) / DAY_MS;
    if (!Number.isNaN(ageDays) && ageDays >= 0) {
      if (ageDays <= 92) recency = 15;
      else if (ageDays <= 183) recency = 10;
    }
  }

  let topRank = 0;
  const rank = topRankOf(track, context);
  if (rank !== undefined) {
    if (rank <= 10) topRank = 15;
    else if (rank <= 20) topRank = 10;
  }

  const genre = track.genres.some((g) => context.userGenres.has(g)) ? 5 : 0;

  return {
    notInPlaylist,
    heardArtist,
    recency,
    topRank,
    genre,
    total: notInPlaylist + heardArtist + recency + topRank + genre,
  };
}

export type PlaylistBonuses = {
  /** +500 wenn ≥10 unterschiedliche Interpreten */
  distinctBonus: number;
  /** +100 wenn genau 15 gehörte + 5 neue Interpreten */
  compositionBonus: number;
  distinctArtistCount: number;
  heardTrackCount: number;
  newTrackCount: number;
  total: number;
};

export function playlistBonuses(tracks: TrackInfo[], context: ScoreContext): PlaylistBonuses {
  const distinctArtists = new Set(tracks.map((track) => track.artistIds[0] ?? track.artistNames[0] ?? track.id));
  const heardTrackCount = tracks.filter((track) => isHeardArtistTrack(track, context)).length;
  const newTrackCount = tracks.filter((track) => isNewArtistTrack(track, context)).length;

  const distinctBonus = distinctArtists.size >= 10 ? 500 : 0;
  const compositionBonus =
    tracks.length === TARGET_SIZE && heardTrackCount === 15 && newTrackCount === 5 ? 100 : 0;

  return {
    distinctBonus,
    compositionBonus,
    distinctArtistCount: distinctArtists.size,
    heardTrackCount,
    newTrackCount,
    total: distinctBonus + compositionBonus,
  };
}

export const trackClassifiers = { isHeardArtistTrack, isNewArtistTrack };
