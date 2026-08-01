import { useEffect, useState } from 'react';
import { LANG } from './i18n';
import {
  LANGS,
  LEGACY_PATHS,
  PAGE_KEYS,
  PATHS,
  normalizePath,
  pageOfPath,
  type Lang,
  type PageKey,
  type Route,
} from './seo';

/**
 * Minimaler Router: die App hat drei Seiten in zwei Sprachen, dafür braucht es
 * keine Bibliothek. Jede Sprache hat eigene URLs (Deutsch in der Wurzel,
 * Englisch unter /en/), weil Suchmaschinen sonst nur eine Fassung indexieren.
 * nginx muss für alle Pfade index.html ausliefern (try_files).
 */
export const ROUTES = PATHS[LANG];

export type { Lang, PageKey, Route };

function normalize(pathname: string): Route {
  const path = normalizePath(pathname);
  for (const lang of LANGS) {
    for (const key of PAGE_KEYS) {
      if (normalizePath(PATHS[lang][key]) === path) return PATHS[lang][key];
    }
  }
  const legacy = LEGACY_PATHS[path];
  return legacy ? ROUTES[legacy] : ROUTES.landing;
}

export function currentRoute(): Route {
  return normalize(window.location.pathname);
}

/** Dieselbe Seite in der anderen Sprache – für Umschalter und hreflang. */
export function routeInLanguage(route: Route, lang: Lang): Route {
  return PATHS[lang][pageOfPath(route) ?? 'landing'];
}

/**
 * Prüft, ob die aufgerufene URL noch aus der Ein-Sprach-Fassung stammt, und
 * gibt das Ziel für eine Weiterleitung zurück (Query-Teil bleibt erhalten,
 * damit Einladungslinks `?join=…` weiter funktionieren).
 */
export function legacyRedirect(): string | undefined {
  const page = LEGACY_PATHS[normalizePath(window.location.pathname)];
  return page ? ROUTES[page] + window.location.search : undefined;
}

/** Navigiert ohne Neuladen; behält Query-Parameter nur, wenn ausdrücklich übergeben */
export function navigate(route: Route, search = ''): void {
  window.history.pushState({}, '', route + search);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(currentRoute);
  useEffect(() => {
    const onChange = () => setRoute(currentRoute());
    window.addEventListener('popstate', onChange);
    return () => window.removeEventListener('popstate', onChange);
  }, []);
  return route;
}
