import {
  credentialsProvider,
  finalizeLogin,
  init,
  initializeLogin,
  logout as sdkLogout,
} from '@tidal-music/auth';
import { t } from './i18n';
import { setTokenProvider } from './tidalClient';

export const CLIENT_ID = import.meta.env.VITE_TIDAL_CLIENT_ID as string | undefined;

const SCOPES = [
  'user.read',
  'collection.read',
  'recommendations.read',
  'playlists.read',
  'playlists.write',
];

/**
 * Tidal verlangt exakt registrierte Redirect-URIs, daher kehrt der Login immer
 * auf "/" zurück. Welches Tool der Nutzer eigentlich wollte, merken wir uns
 * vorher lokal und springen nach dem Login dorthin – so braucht kein
 * zusätzlicher Eintrag im Tidal-Dashboard angelegt zu werden.
 */
const REDIRECT_URI = `${window.location.origin}/`;
const RETURN_TO_KEY = 'emp-return-to';

function rememberReturnTo(path?: string): void {
  try {
    localStorage.setItem(RETURN_TO_KEY, path ?? window.location.pathname + window.location.search);
  } catch {
    /* Speicher gesperrt – dann landet man auf der Startseite */
  }
}

/** Liest das gemerkte Ziel und löscht es (einmalige Verwendung). */
export function takeReturnTo(): string | undefined {
  try {
    const value = localStorage.getItem(RETURN_TO_KEY);
    if (value) localStorage.removeItem(RETURN_TO_KEY);
    return value ?? undefined;
  } catch {
    return undefined;
  }
}

let initPromise: Promise<boolean> | undefined;

/**
 * Initialisiert das Auth-SDK und schließt – falls wir gerade vom
 * Tidal-Login zurückkommen (?code=... in der URL) – den Login ab.
 * Gibt zurück, ob der Nutzer eingeloggt ist.
 * Memoized: Reacts StrictMode ruft Effekte doppelt auf, der OAuth-Code
 * darf aber nur einmal eingelöst werden.
 */
export function initAuth(): Promise<boolean> {
  initPromise ??= doInitAuth();
  return initPromise;
}

async function doInitAuth(): Promise<boolean> {
  if (!CLIENT_ID) return false;

  await init({
    clientId: CLIENT_ID,
    credentialsStorageKey: 'tidal-weekly-mix',
    scopes: SCOPES,
  });

  const params = new URLSearchParams(window.location.search);
  if (params.has('code')) {
    await finalizeLogin(window.location.search);
    window.history.replaceState({}, '', REDIRECT_URI);
  }

  const credentials = await credentialsProvider.getCredentials();
  return Boolean(credentials.token && credentials.userId);
}

/** Startet den Login; `returnTo` bestimmt, wo der Nutzer danach landet. */
export async function login(returnTo?: string): Promise<void> {
  rememberReturnTo(returnTo);
  const url = await initializeLogin({ redirectUri: REDIRECT_URI });
  window.location.href = url;
}

export function logout(): void {
  sdkLogout();
  window.location.reload();
}

export async function getAccessToken(): Promise<string> {
  const credentials = await credentialsProvider.getCredentials();
  if (!credentials.token) throw new Error(t.errorNotLoggedIn);
  return credentials.token;
}

export async function getUserId(): Promise<string> {
  const credentials = await credentialsProvider.getCredentials();
  if (!credentials.userId) throw new Error(t.errorNotLoggedIn);
  return credentials.userId;
}

// Browser-Token-Quelle für den gemeinsamen API-Client registrieren
setTokenProvider(getAccessToken);
