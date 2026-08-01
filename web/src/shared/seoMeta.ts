/**
 * Hält Titel, Description, Canonical, hreflang und die schema.org-Daten aktuell.
 *
 * Beim ersten Aufruf steht all das schon im vorgerenderten HTML (siehe
 * scripts/prerender.ts) – diese Funktion sorgt dafür, dass es nach einem
 * Seitenwechsel ohne Neuladen weiterhin stimmt.
 */
import { LANG } from './i18n';
import {
  LANGS,
  SEO,
  SITE_URL,
  canonicalUrl,
  pageOfPath,
  structuredData,
  type Route,
} from './seo';

function meta(attribute: 'name' | 'property', key: string, content: string): void {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.append(element);
  }
  element.content = content;
}

function link(rel: string, href: string, hreflang?: string): void {
  const selector = hreflang ? `link[rel="${rel}"][hreflang="${hreflang}"]` : `link[rel="${rel}"]`;
  let element = document.head.querySelector<HTMLLinkElement>(selector);
  if (!element) {
    element = document.createElement('link');
    element.rel = rel;
    if (hreflang) element.hreflang = hreflang;
    document.head.append(element);
  }
  element.href = href;
}

export function applyPageMeta(route: Route): void {
  const page = pageOfPath(route) ?? 'landing';
  const seo = SEO[LANG][page];
  const url = canonicalUrl(LANG, page);

  document.title = seo.title;
  document.documentElement.lang = LANG;

  meta('name', 'description', seo.description);
  meta('property', 'og:type', 'website');
  meta('property', 'og:site_name', 'Emphasis');
  meta('property', 'og:locale', LANG === 'de' ? 'de_DE' : 'en_US');
  meta('property', 'og:title', seo.title);
  meta('property', 'og:description', seo.description);
  meta('property', 'og:url', url);
  meta('property', 'og:image', `${SITE_URL}/brand/og-image.png`);
  meta('name', 'twitter:card', 'summary_large_image');

  link('canonical', url);
  for (const lang of LANGS) link('alternate', canonicalUrl(lang, page), lang);
  link('alternate', canonicalUrl('de', page), 'x-default');

  let script = document.head.querySelector<HTMLScriptElement>('script#structured-data');
  if (!script) {
    script = document.createElement('script');
    script.id = 'structured-data';
    script.type = 'application/ld+json';
    document.head.append(script);
  }
  script.textContent = JSON.stringify(structuredData(LANG, page));
}
