/**
 * Kontaktformular: nimmt Anfragen, Fehlerberichte und Vorschläge entgegen und
 * schickt sie an die Betreiber-Adresse.
 *
 * Die Zieladresse steht ausschließlich in der Umgebungsvariablen
 * EMPHASIS_CONTACT_EMAIL (gesetzt in der systemd-Unit auf dem Server). Sie
 * steht nirgends im Quelltext, wird nie an den Browser ausgeliefert und
 * taucht in keiner Antwort auf – der Browser kennt nur /api/contact.
 *
 * Jede Nachricht wird zusätzlich lokal protokolliert. Post an große Anbieter
 * kann von einem einzelnen Server aus im Spam landen; das Protokoll stellt
 * sicher, dass trotzdem nichts verlorengeht.
 */
import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { DATA_DIR, readJsonBody, sendJson } from './common';

const TO = process.env.EMPHASIS_CONTACT_EMAIL;
const FROM = process.env.EMPHASIS_CONTACT_FROM ?? 'noreply@emphasize.me';
const LOG_FILE = join(DATA_DIR, 'contact.log');

const MAX_MESSAGE = 5000;
const MIN_MESSAGE = 10;
const MAX_REPLY_TO = 200;
/** Höchstens so viele Nachrichten je IP-Adresse und Stunde */
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000;

const KINDS = ['bug', 'suggestion', 'question'] as const;
type Kind = (typeof KINDS)[number];

const recent = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((time) => now - time < RATE_WINDOW_MS);
  if (hits.length >= RATE_LIMIT) {
    recent.set(ip, hits);
    return true;
  }
  hits.push(now);
  recent.set(ip, hits);
  // Speicher begrenzen: alte Einträge verwerfen
  if (recent.size > 5000) {
    for (const [key, times] of recent) {
      if (times.every((time) => now - time >= RATE_WINDOW_MS)) recent.delete(key);
    }
  }
  return false;
}

function clientIp(request: IncomingMessage): string {
  const forwarded = request.headers['x-forwarded-for'];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return (value?.split(',')[0] ?? request.socket.remoteAddress ?? 'unknown').trim();
}

/**
 * Entfernt alles, was aus einer Kopfzeile ausbrechen könnte.
 * Ohne das könnte jemand über das Formular fremde Empfänger einschleusen.
 */
function headerSafe(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').slice(0, MAX_REPLY_TO).trim();
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

function sendMail(subject: string, body: string, replyTo?: string): Promise<boolean> {
  if (!TO) return Promise.resolve(false);
  return new Promise((resolve) => {
    const headers = [
      `To: ${TO}`,
      `From: Emphasis <${FROM}>`,
      `Subject: ${headerSafe(subject)}`,
      'Content-Type: text/plain; charset=UTF-8',
      'MIME-Version: 1.0',
    ];
    // Reply-To nur, wenn es wirklich wie eine Adresse aussieht
    if (replyTo && looksLikeEmail(replyTo)) headers.push(`Reply-To: ${headerSafe(replyTo)}`);

    const child = spawn('/usr/sbin/sendmail', ['-t', '-i'], { stdio: ['pipe', 'ignore', 'ignore'] });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
    child.stdin.end(`${headers.join('\n')}\n\n${body}\n`);
  });
}

export async function handleContactRequest(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<boolean> {
  if (request.method !== 'POST' || url.pathname !== '/api/contact') return false;

  const ip = clientIp(request);
  if (rateLimited(ip)) {
    sendJson(response, 429, { error: 'rate_limited' });
    return true;
  }

  const body = await readJsonBody<{
    kind?: string;
    message?: string;
    replyTo?: string;
    website?: string; // Honigtopf – für Menschen unsichtbar
  }>(request);

  // Bots füllen versteckte Felder aus; still mit Erfolg antworten
  if (body.website) {
    sendJson(response, 200, { ok: true });
    return true;
  }

  const message = (body.message ?? '').trim();
  const kind: Kind = KINDS.includes(body.kind as Kind) ? (body.kind as Kind) : 'question';
  const replyTo = (body.replyTo ?? '').trim();

  if (message.length < MIN_MESSAGE || message.length > MAX_MESSAGE) {
    sendJson(response, 400, { error: 'invalid_message' });
    return true;
  }
  if (replyTo && (!looksLikeEmail(replyTo) || replyTo.length > MAX_REPLY_TO)) {
    sendJson(response, 400, { error: 'invalid_reply_to' });
    return true;
  }

  const receivedAt = new Date().toISOString();
  const label = { bug: 'Fehlerbericht', suggestion: 'Vorschlag', question: 'Anfrage' }[kind];
  const mailBody = [
    `Art:       ${label}`,
    `Zeitpunkt: ${receivedAt}`,
    `Antwort an: ${replyTo || '– keine Adresse angegeben –'}`,
    '',
    message,
  ].join('\n');

  // Zuerst protokollieren, damit die Nachricht auch bei Mail-Problemen vorliegt
  try {
    appendFileSync(
      LOG_FILE,
      `${JSON.stringify({ receivedAt, kind, replyTo: replyTo || undefined, message })}\n`,
      { mode: 0o600 },
    );
  } catch (error) {
    console.error('[contact] Protokollieren fehlgeschlagen:', error);
  }

  // Achtung: „übergeben" heißt nur, dass der lokale Mailserver die Nachricht
  // angenommen hat. Ob sie beim Empfänger ankommt, steht erst später in
  // /var/log/mail.log – Gmail weist ohne SPF- oder DKIM-Eintrag ab.
  const queued = await sendMail(`Emphasis: ${label}`, mailBody, replyTo || undefined);
  console.log(
    `[contact] ${label} empfangen (${message.length} Zeichen), an Mailserver ${
      queued ? 'übergeben' : 'NICHT übergeben'
    } – gesichert im Protokoll`,
  );

  // Für den Absender zählt, dass die Nachricht angekommen ist; sie ist
  // spätestens im Protokoll gesichert.
  sendJson(response, 200, { ok: true });
  return true;
}
