/**
 * Deterministisch generierte, abstrakte "Album-Cover" als SVG-Data-URIs.
 * 100 % lizenzfrei – dienen als Collage-Füllung, solange keine echten
 * Cover aus den Tidal-Favoriten geladen sind.
 */

const DARKS = ['#0e1015', '#181b23', '#1d2430', '#141926', '#0f1a1f'];
const ACCENTS = ['#33ffee', '#0dbfb0', '#0e7c8c', '#2b6f8c', '#9aa1b2', '#4ade80'];

/** kleiner deterministischer PRNG (mulberry32) */
function prng(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(random: () => number, items: T[]): T {
  return items[Math.floor(random() * items.length)];
}

function makeCover(seed: number): string {
  const random = prng(seed * 7919 + 13);
  const background = pick(random, DARKS);
  const accentA = pick(random, ACCENTS);
  const accentB = pick(random, ACCENTS);
  const shapes: string[] = [];
  const variant = Math.floor(random() * 4);

  if (variant === 0) {
    // konzentrische Ringe (Vinyl)
    const cx = 40 + random() * 40;
    const cy = 40 + random() * 40;
    for (let radius = 46; radius > 6; radius -= 8) {
      shapes.push(
        `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${radius % 16 < 8 ? accentA : accentB}" stroke-opacity="${0.12 + random() * 0.35}" stroke-width="${2 + random() * 3}"/>`,
      );
    }
  } else if (variant === 1) {
    // Equalizer-Balken
    const count = 6 + Math.floor(random() * 4);
    for (let i = 0; i < count; i++) {
      const height = 15 + random() * 70;
      shapes.push(
        `<rect x="${6 + (i * 108) / count}" y="${104 - height}" width="${70 / count}" height="${height}" rx="3" fill="${i % 2 ? accentA : accentB}" fill-opacity="${0.3 + random() * 0.5}"/>`,
      );
    }
  } else if (variant === 2) {
    // diagonale Wellen
    for (let i = 0; i < 5; i++) {
      const y = 15 + i * 22 + random() * 8;
      shapes.push(
        `<path d="M -10 ${y} Q 30 ${y - 20 - random() * 15}, 60 ${y} T 130 ${y}" fill="none" stroke="${i % 2 ? accentA : accentB}" stroke-opacity="${0.2 + random() * 0.4}" stroke-width="${1.5 + random() * 2.5}"/>`,
      );
    }
  } else {
    // schwebende Kreise
    for (let i = 0; i < 6; i++) {
      shapes.push(
        `<circle cx="${random() * 112}" cy="${random() * 112}" r="${5 + random() * 22}" fill="${i % 2 ? accentA : accentB}" fill-opacity="${0.1 + random() * 0.3}"/>`,
      );
    }
  }

  const gradientAngle = Math.floor(random() * 360);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 112 112">` +
    `<defs><linearGradient id="g" gradientTransform="rotate(${gradientAngle})">` +
    `<stop offset="0" stop-color="${background}"/>` +
    `<stop offset="1" stop-color="${pick(random, DARKS)}"/>` +
    `</linearGradient></defs>` +
    `<rect width="112" height="112" fill="url(#g)"/>` +
    shapes.join('') +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const FAKE_COVERS: string[] = Array.from({ length: 16 }, (_, index) => makeCover(index + 1));
