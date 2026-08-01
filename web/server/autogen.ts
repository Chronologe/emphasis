/**
 * Automatische wöchentliche Generierung des Wochen-Mixes.
 *
 * Holt per OAuth (PKCE) ein Refresh-Token für Opt-in-Nutzer und erzeugt
 * wöchentlich den Mix mit derselben Logik wie die Web-App.
 */
import { readdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { setTokenProvider } from '../src/shared/tidalClient';
import { MIX_PLAYLIST_NAME_BY_LANG } from '../src/shared/i18n';
import { PATHS, type Lang } from '../src/shared/seo';
import { buildInputSet } from '../src/your-weekly-mix/inputSet';
import { generateMix } from '../src/your-weekly-mix/generator';
import { upsertMixPlaylist } from '../src/your-weekly-mix/mixPlaylist';
import {
  DATA_DIR,
  MAX_USERS,
  OAUTH_CALLBACK_PATHS,
  createLoginStore,
  hasFreeDisk,
  isValidId,
  randomToken,
  readJsonBody,
  redirect,
  refreshAccessToken,
  sendJson,
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
  setTokenProvider(async () => accessToken);

  const inputSet = await buildInputSet(user.userId, user.playlistId, () => {});
  const result = await generateMix(inputSet, new Set(user.previousMixIds), () => {});
  if (result.tracks.length === 0) throw new Error('Keine passenden Tracks gefunden');
  if (result.warning) console.warn(`[autogen] ${user.userId}: ${result.warning}`);
  console.log(
    `[autogen] ${user.userId}: Score ${result.totalScore} (${result.distinctArtistCount} Interpreten, ` +
      `Boni: ${result.distinctBonus ? '+500' : '–'}/${result.compositionBonus ? '+100' : '–'})`,
  );

  const name = MIX_PLAYLIST_NAME_BY_LANG[user.lang] ?? MIX_PLAYLIST_NAME_BY_LANG.en;
  const trackIds = result.tracks.map((track) => track.id);
  user.playlistId = await upsertMixPlaylist(
    trackIds,
    name,
    user.playlistId,
    user.userId,
    user.lang,
  );

  user.previousMixIds = [...user.previousMixIds, ...trackIds].slice(-PREVIOUS_IDS_CAP);
  user.lastRunAt = new Date().toISOString();
  user.lastError = undefined;
  saveUser(user);
  console.log(
    `[autogen] ${user.userId}: Playlist ${user.playlistId} mit ${trackIds.length} Tracks aktualisiert`,
  );
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

// Teilt sich den Callback-Pfad mit den anderen Server-Flüssen (siehe common.ts)
const loginStore = createLoginStore<{ playlistId?: string; lang: 'de' | 'en' }>();

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
      }),
    );
    return true;
  }

  if (request.method === 'GET' && path.startsWith('/api/autogen/status/')) {
    const user = loadUser(path.split('/').pop() ?? '');
    sendJson(response, 200, { enabled: Boolean(user?.enabled), lastRunAt: user?.lastRunAt });
    return true;
  }

  if (request.method === 'POST' && path === '/api/autogen/disable') {
    const { userId, key } = await readJsonBody<{ userId?: string; key?: string }>(request);
    const user = userId ? loadUser(userId) : undefined;
    if (!user || user.mgmtKey !== key) {
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
    };
    saveUser(record);
    console.log(`[autogen] Nutzer ${userId} aktiviert (lang=${record.lang})`);
    redirect(response, `${appPath(data.lang)}?autogen=enabled&key=${record.mgmtKey}`);
  } catch (error) {
    console.error('[autogen] Callback-Fehler:', error);
    redirect(response, `${appPath()}?autogen=error`);
  }
  return true;
}
