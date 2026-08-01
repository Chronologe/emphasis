/**
 * Schalter für die anonyme Reichweitenmessung.
 *
 * Die Messung selbst steckt in einem Skript, das der Webserver einfügt und das
 * bewusst nicht im Repo liegt (siehe Datenschutz-Abschnitt der README). Diese
 * Datei kennt daher nur die Schnittstelle: den localStorage-Schlüssel und –
 * falls das Skript geladen ist – dessen `window.empAnalytics`. Ohne Skript
 * (Entwicklung, Werbeblocker) bleibt der Schalter trotzdem bedienbar und die
 * Entscheidung erhalten.
 */

const OPTOUT_KEY = 'emp-analytics-optout';

type Bridge = {
  optedOut(): boolean;
  browserSaysNo(): boolean;
  setOptOut(value: boolean): void;
};

function bridge(): Bridge | undefined {
  return (globalThis as { empAnalytics?: Bridge }).empAnalytics;
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Do-Not-Track und Global Privacy Control gelten auch ohne eigene Entscheidung. */
export function browserSaysNo(): boolean {
  const api = bridge();
  if (api) return api.browserSaysNo();
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return nav.doNotTrack === '1' || nav.globalPrivacyControl === true;
}

/** Effektiver Zustand: eigene Entscheidung oder Browsersignal. */
export function analyticsOptedOut(): boolean {
  const api = bridge();
  if (api) return api.optedOut();
  return read(OPTOUT_KEY) === '1' || browserSaysNo();
}

export function setAnalyticsOptOut(value: boolean): void {
  const api = bridge();
  if (api) {
    api.setOptOut(value);
    return;
  }
  try {
    localStorage.setItem(OPTOUT_KEY, value ? '1' : '0');
  } catch {
    /* Speicher gesperrt – dann gilt der Standard */
  }
}
