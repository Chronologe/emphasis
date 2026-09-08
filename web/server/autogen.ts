/**
 * Automatische wöchentliche Generierung des Wochen-Mixes.
 *
 * Holt per OAuth (PKCE) ein Refresh-Token für Opt-in-Nutzer und erzeugt
 * wöchentlich den Mix mit derselben Logik wie die Web-App.
 */
import { readdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { MIX_PLAYLIST_NAME_BY_LANG } from '../src/shared/i18n';
import { PATHS, type Lang } from '../src/shared/seo';
import { buildInputSet } from '../src/your-weekly-mix/inputSet';
import { generateMix } from '../src/your-weekly-mix/generator';
import { upsertMixPlaylist } from '../src/your-weekly-mix/mixPlaylist';
import {
  DATA_DIR,
  MAX_USERS,
  OAUTH_CALLBACK_PATHS,
  bearerToken,
  createLoginStore,
  hasFreeDisk,
  isValidId,
  randomToken,
  readJsonBody,
  redirect,
  refreshAccessToken,
  sendJson,
  tidalUserIdOfToken,
  withToken,
} from './common';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const PREVIOUS_IDS_CAP = 2000;
/** Zielseite nach dem Login – in der Sprache, aus der der Nutzer kam */
const appPath = (lang: Lang = 'de') => PATHS[lang].weeklyMix;

type UserRecord = {
  userId: string;
  enabled: boolean;
  refreshToken: string;
  lang: 'de' | 'en';
  mgmtKey: string;
  playlistId?: string;
  previousMixIds: string[];
  lastRunAt?: string;
  lastError?: string;
  /**
   * Vom Nutzer gesetzt: KI-gekennzeichnete Titel zulassen. Fehlt das Feld
   * (Datensätze aus der Zeit davor), gilt der sichere Standard `false`.
   */
  includeAiTracks?: boolean;
};

function userFile(userId: string): string {
  if (!isValidId(userId)) throw new Error('Ungültige User-ID');
  return join(DATA_DIR, `${userId}.json`);
}

function loadUser(userId: string): UserRecord | undefined {
  try {
    return JSON.parse(readFileSync(userFile(userId), 'utf8')) as UserRecord;
  } catch {
    return undefined;
  }
}

function saveUser(record: UserRecord): void {
  writeFileSync(userFile(record.userId), JSON.stringify(record, null, 2), { mode: 0o600 });
}

/** Nur Dateien direkt im Datenverzeichnis – Gruppen liegen im Unterordner shared/ */
function listUsers(): UserRecord[] {
  return readdirSync(DATA_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => JSON.parse(readFileSync(join(DATA_DIR, entry.name), 'utf8')) as UserRecord)
    .filter((record) => record.userId);
}

// ---------- Generierung ----------

let generationRunning = false;

async function runGenerationForUser(user: UserRecord): Promise<void> {
  console.log(`[autogen] Generiere Mix für Nutzer ${user.userId} …`);
  const { accessToken, refreshToken } = await refreshAccessToken(user.refreshToken);
  if (refreshToken) user.refreshToken = refreshToken;
  // Ein Lauf dauert Minuten – das Token muss an ihm hängen, nicht am Modul.
  await withToken(accessToken, () => generateFor(user));
}

async function generateFor(user: UserRecord): Promise<void> {
  const inputSet = await buildInputSet(user.playlistId, () => {});
  const result = await generateMix(inputSet, new Set(user.previousMixIds), () => {}, {
    includeAiTracks: user.includeAiTracks ?? false,
  });
  if (result.tracks.length === 0) throw new Error('Keine passenden Tracks gefunden');
  if (result.warning) console.warn(`[autogen] ${user.userId}: ${result.warning}`);
  console.log(
    `[autogen] ${user.userId}: Score ${result.totalScore} (${result.distinctArtistCount} Interpreten, ` +
      `Boni: ${result.distinctBonus ? '+500' : '–'}/${result.compositionBonus ? '+100' : '–'})`,
  );

  const name = MIX_PLAYLIST_NAME_BY_LANG[user.lang] ?? MIX_PLAYLIST_NAME_BY_LANG.en;
  const trackIds = result.tracks.map((track) => track.id);
  user.playlistId = await upsertMixPlaylist(trackIds, name, user.playlistId, user.lang);

  user.previousMixIds = [...user.previousMixIds, ...trackIds].slice(-PREVIOUS_IDS_CAP);
  user.lastRunAt = new Date().toISOString();
  user.lastError = undefined;
  saveUser(user);
  console.log(
    `[autogen] ${user.userId}: Playlist ${user.playlistId} mit ${trackIds.length} Tracks aktualisiert`,
  );
}

/**
 * Zeitpunkt des nächsten planmäßigen Laufs – oder `undefined`, wenn er bereits
 * fällig ist (noch nie gelaufen oder Woche überschritten). Dieselbe Bedingung
 * wie in `runDueGenerations`, damit Anzeige und Planung nicht auseinanderlaufen.
 */
function scheduledNextRun(user: UserRecord): string | undefined {
  if (!user.lastRunAt) return undefined;
  const next = new Date(user.lastRunAt).getTime() + WEEK_MS;
  return next <= Date.now() ? undefined : new Date(next).toISOString();
}

export async function runDueGenerations(): Promise<void> {
  if (generationRunning) return;
  generationRunning = true;
  try {
    for (const user of listUsers()) {
      if (!user.enabled) continue;
      const due = !user.lastRunAt || Date.now() - new Date(user.lastRunAt).getTime() >= WEEK_MS;
      if (!due) continue;
      try {
        await runGenerationForUser(user);
      } catch (error) {
        user.lastError = error instanceof Error ? error.message : String(error);
        saveUser(user);
        console.error(`[autogen] Fehler bei Nutzer ${user.userId}:`, error);
      }
    }
  } finally {
    generationRunning = false;
  }
}

// ---------- HTTP ----------

/**
 * Abgewiesenen Verwaltungszugriff protokollieren. Häufigste Ursache ist ein
 * fehlender Verwaltungs-Key im Browser (anderes Gerät, geleerter Speicher) –
 * ohne diese Zeile ist das von außen nicht von einem Angriff zu unterscheiden.
 */
function denied(path: string, userId?: string): void {
  console.warn(`[autogen] Abgewiesen: ${path} für ${userId ?? '(ohne ID)'} – weder Key noch Token gültig`);
}

/**
 * Zugriff auf den eigenen Datensatz. Zwei gleichwertige Nachweise:
 *
 *  1. der Verwaltungs-Key – liegt nur in dem Browser, in dem aktiviert wurde
 *  2. das Tidal-Access-Token des angemeldeten Nutzers – funktioniert überall
 *
 * Der zweite Weg ist der Grund für diese Funktion: ohne ihn konnte, wer den
 * Key verloren hatte, seine Automatik weder umstellen noch abschalten – und
 * der Browser bekam den servergeführten Mix-Zustand nicht zu sehen, wodurch
 * manuelle Läufe Titel wiederholten, die der Server längst vergeben hatte.
 */
async function authorizedUser(
  request: IncomingMessage,
  userId: string | undefined,
  key: string | undefined,
): Promise<UserRecord | undefined> {
  if (!userId) return undefined;
  const user = loadUser(userId);
  if (!user) return undefined;
  if (key && user.mgmtKey === key) return user;

  const token = bearerToken(request);
  if (!token) return undefined;
  const tokenUserId = await tidalUserIdOfToken(token);
  return tokenUserId === userId ? user : undefined;
}

// Teilt sich den Callback-Pfad mit den anderen Server-Flüssen (siehe common.ts)
const loginStore = createLoginStore<{
  playlistId?: string;
  lang: 'de' | 'en';
  includeAiTracks: boolean;
}>();

export async function handleAutogenRequest(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<boolean> {
  const path = url.pathname;
  const state = url.searchParams.get('state') ?? '';

  // Gemeinsamer Callback: nur übernehmen, wenn der state zu diesem Fluss gehört
  if (request.method === 'GET' && OAUTH_CALLBACK_PATHS.includes(path)) {
    if (!loginStore.has(state)) return false;
    return handleCallback(request, response, url, state);
  }

  if (!path.startsWith('/api/autogen/')) return false;

  if (request.method === 'GET' && path === '/api/autogen/start') {
    redirect(
      response,
      loginStore.begin(request, {
        playlistId: url.searchParams.get('playlistId') || undefined,
        lang: url.searchParams.get('lang') === 'de' ? 'de' : 'en',
        // alles außer einer ausdrücklichen 1 heißt: keine KI-Titel
        includeAiTracks: url.searchParams.get('ai') === '1',
      }),
    );
    return true;
  }

  if (request.method === 'GET' && path.startsWith('/api/autogen/status/')) {
    const user = loadUser(path.split('/').pop() ?? '');
    sendJson(response, 200, {
      enabled: Boolean(user?.enabled),
      lastRunAt: user?.lastRunAt,
      includeAiTracks: Boolean(user?.includeAiTracks),
      // Fehlt das Feld, ist der Lauf bereits fällig und kommt beim nächsten Tick
      nextRunAt: user?.enabled ? scheduledNextRun(user) : undefined,
    });
    return true;
  }

  /*
   * Mix-Gedächtnis lesen. Sobald die Automatik läuft, arbeitet auch der
   * manuelle Lauf im Browser gegen diesen Zustand statt gegen localStorage –
   * sonst hätten Browser und Server getrennte Ausschlusslisten und würden
   * einander Titel wiederholen.
   *
   * Bewusst POST mit Verwaltungs-Key: previousMixIds sind Nutzerdaten und
   * gehören nicht hinter einen ungeschützten GET (der Status-Endpunkt liefert
   * nur unkritische Eckdaten).
   */
  if (request.method === 'POST' && path === '/api/autogen/state') {
    const { userId, key } = await readJsonBody<{ userId?: string; key?: string }>(request);
    const user = await authorizedUser(request, userId, key);
    if (!user) {
      denied(path, userId);
      sendJson(response, 403, { error: 'forbidden' });
      return true;
    }
    sendJson(response, 200, {
      playlistId: user.playlistId,
      previousMixIds: user.previousMixIds,
    });
    return true;
  }

  // Ergebnis eines manuellen Laufs im Browser übernehmen
  if (request.method === 'POST' && path === '/api/autogen/record') {
    const { userId, key, trackIds, playlistId, countAsRun } = await readJsonBody<{
      userId?: string;
      key?: string;
      trackIds?: unknown;
      playlistId?: string;
      countAsRun?: boolean;
    }>(request);
    const user = await authorizedUser(request, userId, key);
    if (!user) {
      denied(path, userId);
      sendJson(response, 403, { error: 'forbidden' });
      return true;
    }
    const ids = Array.isArray(trackIds)
      ? trackIds.filter((id): id is string => typeof id === 'string' && isValidId(id))
      : [];
    user.previousMixIds = [...new Set([...user.previousMixIds, ...ids])].slice(-PREVIOUS_IDS_CAP);
    if (typeof playlistId === 'string' && playlistId) user.playlistId = playlistId;
    /*
     * Ein manueller Lauf zählt als der Lauf dieser Woche. Ohne das würde der
     * Scheduler eine fällige Generierung Stunden später darüberschreiben und
     * die eben erzeugte Playlist wäre weg.
     */
    if (countAsRun === true) user.lastRunAt = new Date().toISOString();
    saveUser(user);
    console.log(
      `[autogen] Nutzer ${userId}: ${ids.length} Titel übernommen ` +
        `(${user.previousMixIds.length} gemerkt${countAsRun === true ? ', zählt als Wochenlauf' : ''})`,
    );
    sendJson(response, 200, { previousMixIds: user.previousMixIds, nextRunAt: scheduledNextRun(user) });
    return true;
  }

  // Einstellung nachträglich ändern, ohne den OAuth-Fluss zu wiederholen
  if (request.method === 'POST' && path === '/api/autogen/settings') {
    const { userId, key, includeAiTracks } = await readJsonBody<{
      userId?: string;
      key?: string;
      includeAiTracks?: boolean;
    }>(request);
    const user = await authorizedUser(request, userId, key);
    if (!user) {
      denied(path, userId);
      sendJson(response, 403, { error: 'forbidden' });
      return true;
    }
    user.includeAiTracks = includeAiTracks === true;
    saveUser(user);
    console.log(`[autogen] Nutzer ${userId}: KI-Titel ${user.includeAiTracks ? 'erlaubt' : 'gesperrt'}`);
    sendJson(response, 200, { includeAiTracks: user.includeAiTracks });
    return true;
  }

  if (request.method === 'POST' && path === '/api/autogen/disable') {
    const { userId, key } = await readJsonBody<{ userId?: string; key?: string }>(request);
    const user = await authorizedUser(request, userId, key);
    if (!user) {
      denied(path, userId);
      sendJson(response, 403, { error: 'forbidden' });
      return true;
    }
    // Datenschutz: beim Deaktivieren werden ALLE Serverdaten des Nutzers gelöscht
    unlinkSync(userFile(user.userId));
    console.log(`[autogen] Nutzer ${userId} deaktiviert, Daten gelöscht`);
    sendJson(response, 200, { enabled: false });
    return true;
  }

  return false;
}

/** Rückkehr vom Tidal-Login (Pfad wird mit anderen Flüssen geteilt) */
async function handleCallback(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  state: string,
): Promise<boolean> {
  const code = url.searchParams.get('code');
  if (!code) {
    redirect(response, `${appPath()}?autogen=error`);
    return true;
  }
  try {
    const { userId, refreshToken, data } = await loginStore.finish(request, state, code);
    const existing = loadUser(userId);
    // Neue Nutzer nur, solange genug Speicher frei ist und das Limit nicht erreicht ist
    if (!existing) {
      const active = listUsers().filter((user) => user.enabled).length;
      if (!hasFreeDisk('autogen') || active >= MAX_USERS) {
        console.warn(`[autogen] Aktivierung abgelehnt (Kapazität): ${userId}`);
        redirect(response, `${appPath(data.lang)}?autogen=full`);
        return true;
      }
    }
    const record: UserRecord = {
      userId,
      enabled: true,
      refreshToken,
      lang: data.lang,
      mgmtKey: existing?.mgmtKey ?? randomToken(24),
      playlistId: data.playlistId || existing?.playlistId,
      previousMixIds: existing?.previousMixIds ?? [],
      lastRunAt: existing?.lastRunAt,
      includeAiTracks: data.includeAiTracks,
    };
    saveUser(record);
    console.log(
      `[autogen] Nutzer ${userId} aktiviert (lang=${record.lang}, ` +
        `KI-Titel ${record.includeAiTracks ? 'erlaubt' : 'gesperrt'})`,
    );
    redirect(response, `${appPath(data.lang)}?autogen=enabled&key=${record.mgmtKey}`);
  } catch (error) {
    console.error('[autogen] Callback-Fehler:', error);
    redirect(response, `${appPath()}?autogen=error`);
  }
  return true;
}
