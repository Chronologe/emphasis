/**
 * Erzeugt nach dem Vite-Build für jede Seite und Sprache eine eigene
 * index.html mit fertigem <head> und lesbarem Inhalt – plus sitemap.xml.
 *
 * Warum überhaupt: Die App ist eine SPA. Ohne diesen Schritt liefert der
 * Server ein leeres Grundgerüst aus (~6 Wörter); Titel, Beschreibung und Text
 * entstehen erst, nachdem JavaScript gelaufen ist. Google rendert zwar
 * JavaScript, aber verzögert und mit Budget – andere Bots (Bing, Social-Media-
 * Vorschauen, KI-Crawler) meist gar nicht. Hier wird deshalb alles, was für
 * die Bewertung zählt, direkt ins HTML geschrieben.
 *
 * Der Inhalt in #root ist bewusst statisch: React ersetzt ihn beim Start
 * vollständig (createRoot leert den Container). Besucher sehen also die App,
 * Crawler ohne JavaScript den Text.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LANGS,
  PAGE_KEYS,
  PATHS,
  SEO,
  SITE_URL,
  canonicalUrl,
  structuredData,
  type Lang,
  type PageKey,
} from '../src/shared/seo';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const template = readFileSync(join(dist, 'index.html'), 'utf8');

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Verhindert, dass ein </script> im Text das JSON-LD-Element vorzeitig beendet */
function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function headFor(lang: Lang, page: PageKey): string {
  const seo = SEO[lang][page];
  const url = canonicalUrl(lang, page);

  const alternates = LANGS.map(
    (other) =>
      `<link rel="alternate" hreflang="${other}" href="${canonicalUrl(other, page)}">`,
  ).join('\n    ');

  return [
    `<title>${escapeHtml(seo.title)}</title>`,
    `<meta name="description" content="${escapeHtml(seo.description)}">`,
    `<link rel="canonical" href="${url}">`,
    alternates,
    `<link rel="alternate" hreflang="x-default" href="${canonicalUrl('de', page)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="Emphasis">`,
    `<meta property="og:locale" content="${lang === 'de' ? 'de_DE' : 'en_US'}">`,
    `<meta property="og:title" content="${escapeHtml(seo.title)}">`,
    `<meta property="og:description" content="${escapeHtml(seo.description)}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${SITE_URL}/brand/og-image.png">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large">`,
    `<script id="structured-data" type="application/ld+json">${safeJson(
      structuredData(lang, page),
    )}</script>`,
  ].join('\n    ');
}

/** Statischer Textkörper: dieselben Inhalte, die React später anzeigt. */
function bodyFor(lang: Lang, page: PageKey): string {
  const seo = SEO[lang][page];
  const faqHeading = lang === 'de' ? 'Häufige Fragen' : 'Frequently asked questions';

  const nav = PAGE_KEYS.filter((key) => key !== page)
    .map((key) => `<li><a href="${PATHS[lang][key]}">${escapeHtml(SEO[lang][key].title)}</a></li>`)
    .join('');

  const sections = seo.sections
    .map(
      (section) =>
        `<section><h2>${escapeHtml(section.heading)}</h2>${section.body
          .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
          .join('')}</section>`,
    )
    .join('');

  const faq = seo.faq
    .map(
      (item) =>
        `<div><h3>${escapeHtml(item.question)}</h3><p>${escapeHtml(item.answer)}</p></div>`,
    )
    .join('');

  return [
    `<h1>${escapeHtml(seo.title.split(' – ')[0])}</h1>`,
    `<p>${escapeHtml(seo.description)}</p>`,
    sections,
    `<section><h2>${faqHeading}</h2>${faq}</section>`,
    `<nav><ul>${nav}</ul></nav>`,
  ].join('\n      ');
}

function pageHtml(lang: Lang, page: PageKey): string {
  return template
    .replace('<html lang="de">', `<html lang="${lang}">`)
    .replace(
      /<title>.*?<\/title>/,
      headFor(lang, page),
    )
    .replace(
      '<div id="root"></div>',
      `<div id="root">\n      ${bodyFor(lang, page)}\n    </div>`,
    );
}

function outputPath(route: string): string {
  // "/" -> index.html, "/mix-der-woche" -> mix-der-woche/index.html
  const clean = route.replace(/^\/+|\/+$/g, '');
  return clean ? join(dist, clean, 'index.html') : join(dist, 'index.html');
}

const written: string[] = [];
for (const lang of LANGS) {
  for (const page of PAGE_KEYS) {
    const file = outputPath(PATHS[lang][page]);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, pageHtml(lang, page));
    written.push(file.replace(dist, 'dist'));
  }
}

// sitemap.xml aus denselben Daten – kann so nicht veralten
const urls = LANGS.flatMap((lang) =>
  PAGE_KEYS.map((page) => {
    const alternates = LANGS.map(
      (other) =>
        `    <xhtml:link rel="alternate" hreflang="${other}" href="${canonicalUrl(other, page)}"/>`,
    ).join('\n');
    return [
      '  <url>',
      `    <loc>${canonicalUrl(lang, page)}</loc>`,
      alternates,
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${canonicalUrl('de', page)}"/>`,
      `    <changefreq>weekly</changefreq>`,
      `    <priority>${page === 'landing' ? '1.0' : '0.8'}</priority>`,
      '  </url>',
    ].join('\n');
  }),
).join('\n');

writeFileSync(
  join(dist, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`,
);

console.log(`[prerender] ${written.length} Seiten + sitemap.xml erzeugt:`);
for (const file of written) console.log(`  ${file}`);
