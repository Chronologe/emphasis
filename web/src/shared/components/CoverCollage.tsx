import { useMemo } from 'react';
import { FAKE_COVERS } from './fakeCovers';

const ROWS = 4;
const TILES_PER_ROW = 12;

/**
 * Animierte Hintergrund-Collage: Reihen quadratischer Cover, schräg rotiert,
 * die endlos in wechselnder Richtung durch den Viewport sliden.
 * Rein dekorativ (aria-hidden, pointer-events: none).
 */
export default function CoverCollage({ coverUrls }: { coverUrls: string[] }) {
  const rows = useMemo(() => {
    // echte Cover (sobald geladen) mit Fake-Covern mischen, deterministisch verteilt
    const pool = [...coverUrls, ...FAKE_COVERS];
    return Array.from({ length: ROWS }, (_, rowIndex) =>
      Array.from(
        { length: TILES_PER_ROW },
        (_, tileIndex) => pool[(rowIndex * TILES_PER_ROW + tileIndex * 7) % pool.length],
      ),
    );
  }, [coverUrls]);

  return (
    <div className="collage" aria-hidden="true">
      <div className="collage-inner">
        {rows.map((tiles, rowIndex) => (
          <div className={`collage-row ${rowIndex % 2 ? 'reverse' : ''}`} key={rowIndex}>
            {/* Inhalt doppelt für nahtlosen Endlos-Loop (Animation: -50 %) */}
            {[0, 1].map((copy) => (
              <div className="collage-track" key={copy}>
                {tiles.map((url, tileIndex) => (
                  <img
                    className="collage-tile"
                    src={url}
                    alt=""
                    loading="lazy"
                    draggable={false}
                    key={tileIndex}
                  />
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="collage-overlay" />
    </div>
  );
}
