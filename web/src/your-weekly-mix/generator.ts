import { t } from '../shared/i18n';
import type { InputSet } from './inputSet';
import {
  duplicateKey,
  isExcludedContent,
  playlistBonuses,
  songScore,
  trackClassifiers,
  PLAYLIST_TARGET_SIZE,
  type ScoreContext,
  type SongScoreBreakdown,
} from './scoring';
import { apiGetPaginated, indexIncluded } from '../shared/tidalClient';
import { fetchTrackDetails, type TrackInfo } from '../shared/tracks';

export type ScoredTrack = TrackInfo & {
  score: number;
  breakdown: SongScoreBreakdown;
  isHeardArtist: boolean;
  isNewArtist: boolean;
};

export type MixResult = {
  tracks: ScoredTrack[];
  totalScore: number;
  distinctBonus: boolean;
  compositionBonus: boolean;
  distinctArtistCount: number;
  warning?: string;
};

const MAX_HEARD_ARTISTS = 25;
const MAX_NEW_ARTISTS = 30;
const SIMILAR_ARTIST_SOURCES = 15;
const ARTIST_TRACKS_TO_FETCH = 60;
const TOP_TRACKS_PER_ARTIST = 20;
const MAX_SWAP_PASSES = 25;

/**
 * "Meistgehörte" Songs eines Interpreten: Tidal bietet keine Top-Liste,
 * daher alle (bis zu 60) Tracks laden und nach popularity sortieren.
 * Liefert Kandidaten-IDs und den Rang je Track (für die Top-10/20-Punkte).
 */
async function fetchArtistTopTracks(
  artistId: string,
): Promise<{ candidateIds: string[]; ranks: Map<string, number> }> {
  const ranks = new Map<string, number>();
  const candidateIds: string[] = [];
  try {
    const { data, included } = await apiGetPaginated(
      `/artists/${artistId}/relationships/tracks`,
      { collapseBy: 'FINGERPRINT', include: 'tracks' },
      ARTIST_TRACKS_TO_FETCH,
    );
    const trackDetails = indexIncluded(included).get('tracks') ?? new Map();
    const withPopularity = data
      .filter((item) => item.type === 'tracks')
      .map((item) => ({
        id: item.id,
        popularity: Number(trackDetails.get(item.id)?.attributes?.popularity ?? 0),
      }))
      .sort((a, b) => b.popularity - a.popularity);
    withPopularity.forEach((entry, index) => {
      ranks.set(entry.id, index + 1);
      if (index < TOP_TRACKS_PER_ARTIST) candidateIds.push(entry.id);
    });
  } catch {
    // Interpret nicht ladbar → überspringen
  }
  return { candidateIds, ranks };
}

async function fetchSimilarArtistIds(artistId: string): Promise<string[]> {
  try {
    const { data } = await apiGetPaginated(
      `/artists/${artistId}/relationships/similarArtists`,
      {},
      10,
    );
    return data.filter((item) => item.type === 'artists').map((item) => item.id);
  } catch {
    return [];
  }
}

async function fetchSimilarTrackIds(trackId: string): Promise<string[]> {
  try {
    const { data } = await apiGetPaginated(`/tracks/${trackId}/relationships/similarTracks`, {}, 20);
    return data.filter((item) => item.type === 'tracks').map((item) => item.id);
  } catch {
    return [];
  }
}

/** Gesamtscore einer Auswahl: Σ Song-Scores + Playlist-Boni */
function evaluateSelection(selection: ScoredTrack[], context: ScoreContext): number {
  const scoreSum = selection.reduce((sum, track) => sum + track.score, 0);
  return scoreSum + playlistBonuses(selection, context).total;
}

/** Harte Regel: kein Interpret darf mehr als zweimal im Mix auftauchen */
const MAX_TRACKS_PER_ARTIST = 2;

function violatesArtistCap(tracks: ScoredTrack[]): boolean {
  const counts = new Map<string, number>();
  for (const track of tracks) {
    for (const artistId of track.artistIds) {
      const next = (counts.get(artistId) ?? 0) + 1;
      if (next > MAX_TRACKS_PER_ARTIST) return true;
      counts.set(artistId, next);
    }
  }
  return false;
}

/** Greedy-Auswahl nach Score; Duplikate vermeiden, max. 2 Songs pro Interpret */
function greedyTop(candidates: ScoredTrack[], size: number, filter?: (t: ScoredTrack) => boolean): ScoredTrack[] {
  const selected: ScoredTrack[] = [];
  const seen = new Set<string>();
  const artistCounts = new Map<string, number>();
  for (const track of candidates) {
    if (selected.length >= size) break;
    if (filter && !filter(track)) continue;
    const key = duplicateKey(track);
    if (seen.has(key)) continue;
    if (track.artistIds.some((id) => (artistCounts.get(id) ?? 0) >= MAX_TRACKS_PER_ARTIST)) continue;
    selected.push(track);
    seen.add(key);
    track.artistIds.forEach((id) => artistCounts.set(id, (artistCounts.get(id) ?? 0) + 1));
  }
  return selected;
}

/**
 * Tauscht Songs überrepräsentierter Interpreten gegen beste Kandidaten
 * anderer Interpreten, bis mindestens `target` unterschiedliche erreicht sind.
 */
function raiseDistinctArtists(
  selection: ScoredTrack[],
  candidates: ScoredTrack[],
  target: number,
): ScoredTrack[] {
  const result = [...selection];
  const primary = (track: ScoredTrack) => track.artistIds[0] ?? track.artistNames[0] ?? track.id;

  for (let guard = 0; guard < PLAYLIST_TARGET_SIZE; guard++) {
    const counts = new Map<string, number>();
    result.forEach((track) => counts.set(primary(track), (counts.get(primary(track)) ?? 0) + 1));
    if (counts.size >= target) break;

    // schwächsten Song eines mehrfach vertretenen Interpreten finden
    const removable = [...result]
      .filter((track) => (counts.get(primary(track)) ?? 0) > 1)
      .sort((a, b) => a.score - b.score)[0];
    if (!removable) break;

    const usedArtists = new Set(result.map(primary));
    const usedKeys = new Set(result.map(duplicateKey));
    const removableIndex = result.indexOf(removable);
    const replacement = candidates.find((track) => {
      if (usedArtists.has(primary(track)) || usedKeys.has(duplicateKey(track))) return false;
      const trial = [...result];
      trial[removableIndex] = track;
      return !violatesArtistCap(trial);
    });
    if (!replacement) break;

    result.splice(removableIndex, 1, replacement);
  }
  return result;
}

/** Paarweise Tausch-Verbesserung (Hill Climbing) inkl. Bonus-Neuberechnung */
function swapLocalSearch(
  selection: ScoredTrack[],
  candidates: ScoredTrack[],
  context: ScoreContext,
): ScoredTrack[] {
  let best = [...selection];
  let bestScore = evaluateSelection(best, context);

  for (let pass = 0; pass < MAX_SWAP_PASSES; pass++) {
    let improved = false;
    const selectedIds = new Set(best.map((track) => track.id));
    for (const candidate of candidates) {
      if (selectedIds.has(candidate.id)) continue;
      for (let i = 0; i < best.length; i++) {
        const trial = [...best];
        trial[i] = candidate;
        // Duplikate und Interpreten-Limit (max. 2) innerhalb der Auswahl wahren
        if (new Set(trial.map(duplicateKey)).size < trial.length) continue;
        if (violatesArtistCap(trial)) continue;
        const trialScore = evaluateSelection(trial, context);
        if (trialScore > bestScore) {
          best = trial;
          bestScore = trialScore;
          improved = true;
          break;
        }
      }
      if (improved) break;
    }
    if (!improved) break;
  }
  return best;
}

export async function generateMix(
  input: InputSet,
  previousMixIds: Set<string>,
  onStatus: (message: string) => void,
): Promise<MixResult> {
  // 1. Gehörte Interpreten aus den 50 Eingangs-Songs (Reihenfolge = Aktualität)
  const heardArtistIds: string[] = [];
  for (const track of input.recentTracks) {
    for (const artistId of track.artistIds) {
      if (!heardArtistIds.includes(artistId)) heardArtistIds.push(artistId);
      if (heardArtistIds.length >= MAX_HEARD_ARTISTS) break;
    }
    if (heardArtistIds.length >= MAX_HEARD_ARTISTS) break;
  }

  // 2. Ähnliche ("neue") Interpreten laut Tidal
  onStatus(t.statusSimilarArtists);
  const newArtistIds: string[] = [];
  for (const artistId of heardArtistIds.slice(0, SIMILAR_ARTIST_SOURCES)) {
    for (const similarId of await fetchSimilarArtistIds(artistId)) {
      if (input.heardArtistIds.has(similarId)) continue;
      if (!newArtistIds.includes(similarId)) newArtistIds.push(similarId);
    }
    if (newArtistIds.length >= MAX_NEW_ARTISTS) break;
  }

  // 3. Top-Songs aller Interpreten (popularity-Rang)
  const artistTopRank = new Map<string, Map<string, number>>();
  const candidateIds = new Set<string>();
  const allArtists = [...heardArtistIds, ...newArtistIds.slice(0, MAX_NEW_ARTISTS)];
  for (const [index, artistId] of allArtists.entries()) {
    onStatus(t.statusArtistTop(index + 1, allArtists.length));
    const { candidateIds: ids, ranks } = await fetchArtistTopTracks(artistId);
    artistTopRank.set(artistId, ranks);
    ids.forEach((id) => candidateIds.add(id));
  }

  // 4. Ähnliche Songs zu den Eingangs-Songs
  for (const [index, track] of input.recentTracks.entries()) {
    onStatus(t.statusSimilarTracks(index + 1, input.recentTracks.length));
    (await fetchSimilarTrackIds(track.id)).forEach((id) => candidateIds.add(id));
  }

  // 5. Harte Ausschlüsse – der Nutzer soll ausschließlich Songs bekommen,
  //    die er noch nicht kennt:
  //    - bereits favorisiert
  //    - bereits in einer seiner Playlists
  //    - aktuell in der Mix-Playlist (= letzter Mix, quellenunabhängig)
  //    - in einem früher gespeicherten Mix (localStorage-/Server-Historie)
  const excludedIds = new Set<string>([
    ...previousMixIds,
    ...input.favoriteTrackIds,
    ...input.allPlaylistTrackIds,
    ...input.mixPlaylistTrackIds,
  ]);
  const filteredIds = [...candidateIds].filter((id) => !excludedIds.has(id));
  onStatus(t.statusCandidateCount(filteredIds.length));
  const details = await fetchTrackDetails(filteredIds, (loaded, total) =>
    onStatus(t.statusCandidates(loaded, total)),
  );

  const context: ScoreContext = {
    allPlaylistTrackIds: input.allPlaylistTrackIds,
    heardArtistIds: input.heardArtistIds,
    newArtistIds: new Set(newArtistIds),
    userGenres: input.userGenres,
    artistTopRank,
  };

  onStatus(t.statusScoring);
  const candidates: ScoredTrack[] = [];
  for (const track of details.values()) {
    if (isExcludedContent(track)) continue;
    const breakdown = songScore(track, context);
    candidates.push({
      ...track,
      score: breakdown.total,
      breakdown,
      isHeardArtist: trackClassifiers.isHeardArtistTrack(track, context),
      isNewArtist: trackClassifiers.isNewArtistTrack(track, context),
    });
  }
  candidates.sort((a, b) => b.score - a.score);

  // 6. Regime-Enumeration
  const regimeA = greedyTop(candidates, PLAYLIST_TARGET_SIZE);
  const regimeB = raiseDistinctArtists(regimeA, candidates, 10);
  const heard15 = greedyTop(candidates, 15, (track) => track.isHeardArtist);
  const new5 = greedyTop(
    candidates.filter((track) => !heard15.some((sel) => duplicateKey(sel) === duplicateKey(track))),
    5,
    (track) => track.isNewArtist,
  );
  const combined15plus5 = [...heard15, ...new5];
  const regimeC =
    heard15.length === 15 && new5.length === 5 && !violatesArtistCap(combined15plus5)
      ? raiseDistinctArtists(combined15plus5, candidates, 10)
      : [];

  let best: ScoredTrack[] = regimeA;
  for (const regime of [regimeB, regimeC]) {
    if (regime.length === PLAYLIST_TARGET_SIZE || regime.length > best.length) {
      if (
        regime.length > best.length ||
        evaluateSelection(regime, context) > evaluateSelection(best, context)
      ) {
        best = regime;
      }
    }
  }

  // 7. Lokale Tausch-Suche zur weiteren Score-Verbesserung
  best = swapLocalSearch(best, candidates, context);

  const bonuses = playlistBonuses(best, context);
  const totalScore = best.reduce((sum, track) => sum + track.score, 0) + bonuses.total;

  console.info(
    `[score] ${best.length} Tracks, Gesamtscore ${totalScore} ` +
      `(Songs ${totalScore - bonuses.total}, Boni ${bonuses.total}; ` +
      `${bonuses.distinctArtistCount} Interpreten, ${bonuses.heardTrackCount} gehört / ${bonuses.newTrackCount} neu)`,
  );
  best.forEach((track) =>
    console.info(
      `[score]   ${track.score} | ${track.title} – ${track.artistNames.join(', ')} |`,
      track.breakdown,
    ),
  );

  return {
    tracks: best,
    totalScore,
    distinctBonus: bonuses.distinctBonus > 0,
    compositionBonus: bonuses.compositionBonus > 0,
    distinctArtistCount: bonuses.distinctArtistCount,
    warning:
      best.length < PLAYLIST_TARGET_SIZE
        ? t.warningFewTracks(best.length, PLAYLIST_TARGET_SIZE)
        : undefined,
  };
}
