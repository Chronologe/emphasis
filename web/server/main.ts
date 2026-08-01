/**
 * Emphasis-Server: bedient beide Tools.
 *
 *  - /api/autogen/*  wöchentliche Generierung des Mix der Woche  (autogen.ts)
 *  - /api/shared/*   gemeinsame Playlists mit täglichem Abgleich (shared.ts)
 *
 * Lauscht nur auf 127.0.0.1; nginx reicht /api/ von außen weiter.
 * Nutzer- und Gruppendaten liegen als JSON-Dateien in DATA_DIR (0600).
 */
import { createServer } from 'node:http';

import {
  CHECK_INTERVAL_MS,
  DATA_DIR,
  MAX_USERS,
  PORT,
  freeDiskBytes,
  publicOrigin,
  sendJson,
} from './common';
import { handleAutogenRequest, runDueGenerations } from './autogen';
import { handleSharedRequest, runDueGroupSyncs } from './shared';
import { handleContactRequest } from './contact';

const server = createServer((request, response) => {
  void (async () => {
    const url = new URL(request.url ?? '/', publicOrigin(request));

    if (await handleAutogenRequest(request, response, url)) return;
    if (await handleSharedRequest(request, response, url)) return;
    if (await handleContactRequest(request, response, url)) return;

    sendJson(response, 404, { error: 'not found' });
  })().catch((error) => {
    console.error('[server] Unerwarteter Fehler:', error);
    try {
      sendJson(response, 500, { error: 'internal' });
    } catch {
      /* Antwort bereits gesendet */
    }
  });
});

/** Ein Tick prüft beide Aufgaben: Wochen-Mixe und Gruppen-Abgleich */
async function tick(): Promise<void> {
  await runDueGenerations();
  await runDueGroupSyncs();
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(
    `[server] Emphasis-Server läuft auf 127.0.0.1:${PORT} (Daten: ${DATA_DIR}, ` +
      `${(freeDiskBytes() / 1024 ** 3).toFixed(2)} GiB frei, Limit ${MAX_USERS} Nutzer)`,
  );
  void tick();
  setInterval(() => void tick(), CHECK_INTERVAL_MS);
});
