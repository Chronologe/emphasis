/**
 * Gemeinsame Bausteine der Server-Module: OAuth (PKCE), HTTP-Helfer,
 * Datenverzeichnis und Kapazitätsprüfung.
 */
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statfsSync } from 'node:fs';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

export const PORT = Number(process.env.PORT ?? 8787);
export const DATA_DIR = process.env.EMPHASIS_DATA_DIR ?? '/opt/emphasis/data';
const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN;

export const SCOPES =
  'user.read collection.read recommendations.read playlists.read playlists.write';
const AUTH_URL = 'https://login.tidal.com/authorize';
const TOKEN_URL = 'https://auth.tidal.com/v1/oauth2/token';

export const MAX_USERS = Number(process.env.EMPHASIS_MAX_USERS ?? 1000);
export const MIN_FREE_DISK_BYTES = Number(process.env.EMPHASIS_MIN_FREE_DISK_BYTES ?? 1024 ** 3);
export const CHECK_INTERVAL_MS = 60 * 60 * 1000;

/** Client-ID aus Umgebung oder .env.local der App lesen */
function readClientId(): string {
  if (process.env.VITE_TIDAL_CLIENT_ID) return process.env.VITE_TIDAL_CLIENT_ID;
  const envFile = join(import.meta.dirname, '..', '.env.local');
  if (existsSync(envFile)) {
    const match = readFileSync(envFile, 'utf8').match(/^VITE_TIDAL_CLIENT_ID=(.+)$/m);
    if (match) return match[1].trim();
  }
  throw new Error('VITE_TIDAL_CLIENT_ID fehlt (Umgebung oder ../.env.local)');
}

export const CLIENT_ID = readClientId();

mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });

// ---------- HTTP-Helfer ----------

export function base64url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomToken(bytes = 24): string {
  return base64url(randomBytes(bytes));
}

export function publicOrigin(request: IncomingMessage): string {
  return PUBLIC_ORIGIN ?? `https://${request.headers.host}`;
}

export function redirect(response: ServerResponse, location: string): void {
  response.writeHead(302, { Location: location });
  response.end();
}

export function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

export async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  let body = '';
  for await (const chunk of request) body += chunk;
  return (body ? JSON.parse(body) : {}) as T;
}

// ---------- OAuth ----------

export async function exchangeToken(
  params: Record<string, string>,
): Promise<Record<string, unknown>> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  if (!response.ok) {
    throw new Error(`Token-Endpoint ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  return (await response.json()) as Record<string, unknown>;
}

/** Access-Token aus einem Refresh-Token holen; liefert ggf. ein erneuertes Refresh-Token */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken?: string }> {
  const response = await exchangeToken({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: CLIENT_ID,
  });
  return {
    accessToken: String(response.access_token),
    refreshToken: response.refresh_token ? String(response.refresh_token) : undefined,
  };
}

/**
 * Rückkehradresse aller Server-OAuth-Flüsse.
 *
 * Tidal verlangt exakt registrierte Redirect-URIs. Damit für neue Werkzeuge
 * nie wieder ein Eintrag im Dashboard nötig ist, teilen sich ALLE Server-Flüsse
 * (Auto-Generierung, gemeinsame Playlist, …) diesen einen Pfad; welcher Fluss
 * gemeint ist, steckt im state-Parameter. Voreinstellung ist der historisch
 * bereits registrierte Pfad; per EMPHASIS_OAUTH_CALLBACK umstellbar, wenn ein
 * neutralerer Pfad registriert wurde.
 */
export const OAUTH_CALLBACK_PATH =
  process.env.EMPHASIS_OAUTH_CALLBACK ?? '/api/autogen/callback';

/** Alle Pfade, unter denen der Callback entgegengenommen wird */
export const OAUTH_CALLBACK_PATHS = [...new Set([OAUTH_CALLBACK_PATH, '/api/oauth/callback'])];

export type PendingLogin<T> = { verifier: string; createdAt: number; data: T };

/**
 * Verwaltet laufende PKCE-Logins eines Moduls: erzeugt die Authorize-URL und
 * räumt nie abgeschlossene Vorgänge nach 15 Minuten auf.
 */
export function createLoginStore<T>(callbackPath: string = OAUTH_CALLBACK_PATH) {
  const pending = new Map<string, PendingLogin<T>>();

  return {
    /** Gehört dieser state zu diesem Fluss? (mehrere Flüsse teilen den Callback) */
    has(state: string): boolean {
      return pending.has(state);
    },

    /** Legt einen Vorgang an und liefert die URL, auf die weitergeleitet wird */
    begin(request: IncomingMessage, data: T): string {
      const state = randomToken(24);
      const verifier = randomToken(48);
      const challenge = base64url(createHash('sha256').update(verifier).digest());
      pending.set(state, { verifier, createdAt: Date.now(), data });
      for (const [key, value] of pending) {
        if (Date.now() - value.createdAt > 15 * 60 * 1000) pending.delete(key);
      }
      const authorize = new URL(AUTH_URL);
      authorize.searchParams.set('response_type', 'code');
      authorize.searchParams.set('client_id', CLIENT_ID);
      authorize.searchParams.set('redirect_uri', `${publicOrigin(request)}${callbackPath}`);
      authorize.searchParams.set('scope', SCOPES);
      authorize.searchParams.set('state', state);
      authorize.searchParams.set('code_challenge', challenge);
      authorize.searchParams.set('code_challenge_method', 'S256');
      return authorize.toString();
    },

    /** Löst den Code ein; liefert Nutzer-ID, Refresh-Token und die gemerkten Daten */
    async finish(
      request: IncomingMessage,
      state: string,
      code: string,
    ): Promise<{ userId: string; refreshToken: string; data: T }> {
      const entry = pending.get(state);
      pending.delete(state);
      if (!entry) throw new Error('Unbekannter oder abgelaufener Login-Vorgang');

      const token = await exchangeToken({
        grant_type: 'authorization_code',
        code,
        client_id: CLIENT_ID,
        redirect_uri: `${publicOrigin(request)}${callbackPath}`,
        code_verifier: entry.verifier,
      });
      const userId = String(token.user_id ?? '');
      const refreshToken = String(token.refresh_token ?? '');
      if (!userId || !refreshToken) {
        throw new Error('user_id/refresh_token fehlen in der Token-Antwort');
      }
      return { userId, refreshToken, data: entry.data };
    },
  };
}

// ---------- Kapazität ----------

export function freeDiskBytes(): number {
  const stats = statfsSync(DATA_DIR);
  return stats.bavail * stats.bsize;
}

export function hasFreeDisk(context: string): boolean {
  const free = freeDiskBytes();
  if (free < MIN_FREE_DISK_BYTES) {
    console.warn(`[${context}] Abgelehnt: nur ${(free / 1024 ** 3).toFixed(2)} GiB frei`);
    return false;
  }
  return true;
}

export function isValidId(value: string): boolean {
  return /^[\w-]+$/.test(value);
}
