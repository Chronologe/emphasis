/**
 * Gemeinsame Playlists: Gruppen, Einladungen, Rechte und täglicher Abgleich.
 *
 * Jedes Mitglied hält eine eigene Playlist-Kopie im eigenen Tidal-Konto. Der
 * Abgleich führt die erlaubten Änderungen aller Mitglieder zusammen
 * (kollaborativ) und schreibt das Ergebnis in alle Kopien zurück.
 *
 * Der Ersteller ist „Master": er verwaltet Mitglieder, Rechte, Einladungslink
 * und kann den Abgleich manuell auslösen.
 */
import { readdirSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { setTokenProvider } from '../src/shared/tidalClient';
import {
  applyPlaylistDelta,
  createPlaylist,
  fetchPlaylistInfo,
  fetchPlaylistTrackIds,
  playlistExists,
  updatePlaylistDescription,
} from '../src/shared/playlistItems';
import { sharedPlaylistDescription, type Lang } from '../src/shared/descriptions';
import { PATHS } from '../src/shared/seo';
import {
  DATA_DIR,
  OAUTH_CALLBACK_PATHS,
  createLoginStore,
  hasFreeDisk,
  isValidId,
  publicOrigin,
  randomToken,
  readJsonBody,
  redirect,
  refreshAccessToken,
  sendJson,
} from './common';

const GROUPS_DIR = join(DATA_DIR, 'shared');
const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MAX_MEMBERS = Number(process.env.EMPHASIS_MAX_MEMBERS ?? 50);

mkdirSync(GROUPS_DIR, { recursive: true, mode: 0o700 });

export type Member = {
  userId: string;
  displayName: string;
  joinedAt: string;
  playlistId: string;
  refreshToken: string;
  mgmtKey: string;
  canAdd: boolean;
  canRemove: boolean;
  /** Eigener Schalter: pausiert den Abgleich nur für diese Person */
  syncEnabled: boolean;
  /** Stand der eigenen Kopie beim letzten Abgleich (für die Änderungserkennung) */
  lastSnapshot: string[];
  lastError?: string;
};

export type Group = {
  groupId: string;
  name: string;
  /** Sprache des Erstellers – bestimmt den Zeitstempel-Text in der Beschreibung */
  lang: Lang;
  masterUserId: string;
  inviteToken: string;
  inviteEnabled: boolean;
  /** Gruppenweiter Schalter des Masters */
  syncEnabled: boolean;
  createdAt: string;
  lastSyncAt?: string;
  /** Letzter gemeinsamer Stand (Reihenfolge maßgeblich) */
  state: string[];
  members: Member[];
};

// ---------- Speicher ----------

function groupFile(groupId: string): string {
  if (!isValidId(groupId)) throw new Error('Ungültige Gruppen-ID');
  return join(GROUPS_DIR, `${groupId}.json`);
}

function saveGroup(group: Group): void {
  writeFileSync(groupFile(group.groupId), JSON.stringify(group, null, 2), { mode: 0o600 });
}

function loadGroup(groupId: string): Group | undefined {
  try {
    return JSON.parse(readFileSync(groupFile(groupId), 'utf8')) as Group;
  } catch {
    return undefined;
  }
}

function listGroups(): Group[] {
  try {
    return readdirSync(GROUPS_DIR)
      .filter((file) => file.endsWith('.json'))
      .map((file) => JSON.parse(readFileSync(join(GROUPS_DIR, file), 'utf8')) as Group);
  } catch {
    return [];
  }
}

function findGroupByInvite(token: string): Group | undefined {
  return listGroups().find((group) => group.inviteEnabled && group.inviteToken === token);
}

function memberOf(group: Group, userId: string): Member | undefined {
  return group.members.find((member) => member.userId === userId);
}

/** Prüft den Verwaltungsschlüssel; optional muss es der Master sein */
function authorize(
  group: Group | undefined,
  userId: string,
  key: string,
  requireMaster = false,
): Member | undefined {
  if (!group) return undefined;
  const member = memberOf(group, userId);
  if (!member || member.mgmtKey !== key) return undefined;
  if (requireMaster && group.masterUserId !== userId) return undefined;
  return member;
}

/** Sicht für den Browser – ohne Tokens und Schlüssel anderer Mitglieder */
function publicView(group: Group, userId: string) {
  const me = memberOf(group, userId);
  return {
    groupId: group.groupId,
    name: group.name,
    isMaster: group.masterUserId === userId,
    masterName: memberOf(group, group.masterUserId)?.displayName ?? '—',
    trackCount: group.state.length,
    lastSyncAt: group.lastSyncAt,
    groupSyncEnabled: group.syncEnabled,
    inviteEnabled: group.inviteEnabled,
    inviteToken: group.masterUserId === userId ? group.inviteToken : undefined,
    playlistId: me?.playlistId,
    me: me
      ? { canAdd: me.canAdd, canRemove: me.canRemove, syncEnabled: me.syncEnabled }
      : undefined,
    members: group.members.map((member) => ({
      userId: member.userId,
      displayName: member.displayName,
      joinedAt: member.joinedAt,
      canAdd: member.canAdd,
      canRemove: member.canRemove,
      syncEnabled: member.syncEnabled,
      isMaster: member.userId === group.masterUserId,
    })),
  };
}

// ---------- Tidal-Zugriff im Namen eines Mitglieds ----------

async function withMemberToken<T>(member: Member, action: () => Promise<T>): Promise<T> {
  const { accessToken, refreshToken } = await refreshAccessToken(member.refreshToken);
  if (refreshToken) member.refreshToken = refreshToken;
  setTokenProvider(async () => accessToken);
  return action();
}

// ---------- Abgleich ----------

/**
 * Führt die Änderungen aller Mitglieder zusammen und schreibt das Ergebnis
 * in alle Kopien. Liefert die Anzahl der Änderungen am gemeinsamen Stand.
 */
export async function syncGroup(group: Group): Promise<number> {
  const base = group.state;
  const adds: string[] = [];
  const removes = new Set<string>();
  const active = group.members.filter((member) => member.syncEnabled && member.refreshToken);

  // 1. Änderungen einsammeln
  const currentByMember = new Map<string, string[]>();
  for (const member of active) {
    try {
      const current = await withMemberToken(member, () => fetchPlaylistTrackIds(member.playlistId));
      currentByMember.set(member.userId, current);

      const snapshot = new Set(member.lastSnapshot);
      const currentSet = new Set(current);
      if (member.canAdd) {
        for (const id of current) if (!snapshot.has(id) && !adds.includes(id)) adds.push(id);
      }
      if (member.canRemove) {
        for (const id of member.lastSnapshot) if (!currentSet.has(id)) removes.add(id);
      }
      member.lastError = undefined;
    } catch (error) {
      member.lastError = error instanceof Error ? error.message : String(error);
      console.error(`[shared] ${group.groupId}: Lesen für ${member.userId} fehlgeschlagen:`, error);
    }
  }

  // 2. Neuen gemeinsamen Stand bilden: Reihenfolge der Basis bleibt, Neues hinten
  const newState = [...base.filter((id) => !removes.has(id)), ...adds.filter((id) => !removes.has(id))];
  const deduped = [...new Set(newState)];

  const changed =
    deduped.length !== base.length || deduped.some((id, index) => id !== base[index]);

  // 3. Alle Kopien angleichen – nur Fehlendes anhängen, Überzähliges entfernen.
  //    Die vorhandene Reihenfolge jedes Mitglieds bleibt dabei unangetastet.
  const syncedAt = new Date();
  const description = sharedPlaylistDescription(group.lang ?? 'en', syncedAt);

  for (const member of active) {
    const current = currentByMember.get(member.userId);
    if (!current) continue; // Lesen fehlgeschlagen → diesmal nicht schreiben
    const targetSet = new Set(deduped);
    const alreadyCorrect =
      current.length === deduped.length && current.every((id) => targetSet.has(id));
    try {
      if (!alreadyCorrect) {
        await withMemberToken(member, () => applyPlaylistDelta(member.playlistId, deduped));
      }
      await withMemberToken(member, () =>
        updatePlaylistDescription(member.playlistId, group.name, description),
      );
      member.lastSnapshot = deduped;
    } catch (error) {
      member.lastError = error instanceof Error ? error.message : String(error);
      console.error(
        `[shared] ${group.groupId}: Schreiben für ${member.userId} fehlgeschlagen:`,
        error,
      );
    }
  }

  group.state = deduped;
  group.lastSyncAt = syncedAt.toISOString();
  saveGroup(group);
  console.log(
    `[shared] ${group.groupId} („${group.name}"): abgeglichen – ${deduped.length} Titel, ` +
      `+${adds.length}/−${removes.size}, ${active.length} aktive Mitglieder`,
  );
  return adds.length + removes.size;
}

let syncRunning = false;

/** Vom Scheduler aufgerufen: gleicht alle fälligen Gruppen ab (täglich). */
export async function runDueGroupSyncs(): Promise<void> {
  if (syncRunning) return;
  syncRunning = true;
  try {
    for (const group of listGroups()) {
      if (!group.syncEnabled) continue;
      const due =
        !group.lastSyncAt || Date.now() - new Date(group.lastSyncAt).getTime() >= SYNC_INTERVAL_MS;
      if (!due) continue;
      try {
        await syncGroup(group);
      } catch (error) {
        console.error(`[shared] Abgleich der Gruppe ${group.groupId} fehlgeschlagen:`, error);
      }
    }
  } finally {
    syncRunning = false;
  }
}

// ---------- OAuth-Flüsse ----------

type LoginData =
  | { mode: 'create'; playlistId?: string; newName?: string; lang: 'de' | 'en' }
  | { mode: 'join'; inviteToken: string; lang: 'de' | 'en' };

// Nutzt denselben Callback-Pfad wie die Auto-Generierung (siehe common.ts),
// damit bei Tidal keine weitere Redirect-URI registriert werden muss.
const loginStore = createLoginStore<LoginData>();

async function fetchDisplayName(userId: string): Promise<string> {
  // users/{id} liefert je nach Konto keinen Namen – dann Kurzform der ID zeigen
  try {
    const { apiGet } = await import('../src/shared/tidalClient');
    const document = await apiGet(`/users/${userId}`);
    const data = Array.isArray(document?.data) ? document?.data[0] : document?.data;
    const attributes = (data?.attributes ?? {}) as Record<string, unknown>;
    const name = attributes.username ?? attributes.firstName ?? attributes.handle;
    if (name) return String(name);
  } catch {
    /* Name ist optional */
  }
  return `Nutzer ${userId.slice(-4)}`;
}

async function handleCreate(
  userId: string,
  refreshToken: string,
  data: Extract<LoginData, { mode: 'create' }>,
): Promise<Group> {
  const { accessToken } = await refreshAccessToken(refreshToken);
  setTokenProvider(async () => accessToken);

  let playlistId = data.playlistId;
  let trackIds: string[] = [];
  let name = data.newName?.trim() || 'Shared Playlist';

  if (playlistId && (await playlistExists(playlistId))) {
    const info = await fetchPlaylistInfo(playlistId);
    name = info?.name || name;
    trackIds = await fetchPlaylistTrackIds(playlistId);
  } else {
    playlistId = await createPlaylist(name, sharedPlaylistDescription(data.lang));
  }

  const displayName = await fetchDisplayName(userId);
  const group: Group = {
    groupId: randomToken(12),
    name,
    lang: data.lang,
    masterUserId: userId,
    inviteToken: randomToken(18),
    inviteEnabled: true,
    syncEnabled: true,
    createdAt: new Date().toISOString(),
    state: trackIds,
    members: [
      {
        userId,
        displayName,
        joinedAt: new Date().toISOString(),
        playlistId,
        refreshToken,
        mgmtKey: randomToken(24),
        canAdd: true,
        canRemove: true,
        syncEnabled: true,
        lastSnapshot: trackIds,
      },
    ],
  };
  saveGroup(group);
  console.log(`[shared] Gruppe ${group.groupId} („${name}") von ${userId} angelegt`);
  return group;
}

async function handleJoin(
  userId: string,
  refreshToken: string,
  data: Extract<LoginData, { mode: 'join' }>,
): Promise<Group> {
  const group = findGroupByInvite(data.inviteToken);
  if (!group) throw new Error('Einladung ungültig');
  if (group.members.length >= MAX_MEMBERS) throw new Error('Gruppe ist voll');

  const { accessToken } = await refreshAccessToken(refreshToken);
  setTokenProvider(async () => accessToken);

  const existing = memberOf(group, userId);
  if (existing) {
    // Erneuter Beitritt: Token auffrischen, Rechte behalten
    existing.refreshToken = refreshToken;
    existing.syncEnabled = true;
    saveGroup(group);
    return group;
  }

  const playlistId = await createPlaylist(
    group.name,
    sharedPlaylistDescription(group.lang ?? data.lang, new Date()),
    group.state,
  );
  group.members.push({
    userId,
    displayName: await fetchDisplayName(userId),
    joinedAt: new Date().toISOString(),
    playlistId,
    refreshToken,
    mgmtKey: randomToken(24),
    canAdd: true,
    canRemove: true,
    syncEnabled: true,
    lastSnapshot: group.state,
  });
  saveGroup(group);
  console.log(`[shared] ${userId} ist Gruppe ${group.groupId} beigetreten`);
  return group;
}

// ---------- HTTP ----------

/** Liefert true, wenn die Anfrage von diesem Modul behandelt wurde. */
export async function handleSharedRequest(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<boolean> {
  const path = url.pathname;
  const APP_PATH = PATHS.de.sharedPlaylist;

  // Gemeinsamer Callback: nur übernehmen, wenn der state zu diesem Fluss gehört
  if (request.method === 'GET' && OAUTH_CALLBACK_PATHS.includes(path)) {
    const state = url.searchParams.get('state') ?? '';
    if (!loginStore.has(state)) return false;
    return handleSharedCallback(request, response, url, state, APP_PATH);
  }

  if (!path.startsWith('/api/shared/')) return false;

  // --- OAuth starten ---
  if (request.method === 'GET' && path === '/api/shared/start') {
    const lang = url.searchParams.get('lang') === 'de' ? 'de' : 'en';

    if (url.searchParams.get('mode') === 'join') {
      const inviteToken = url.searchParams.get('token') ?? '';
      if (!findGroupByInvite(inviteToken)) {
        redirect(response, `${APP_PATH}?shared=invalid`);
      } else {
        redirect(response, loginStore.begin(request, { mode: 'join', inviteToken, lang }));
      }
      return true;
    }

    if (!hasFreeDisk('shared')) {
      redirect(response, `${APP_PATH}?shared=full`);
      return true;
    }
    redirect(
      response,
      loginStore.begin(request, {
        mode: 'create',
        playlistId: url.searchParams.get('playlistId') || undefined,
        newName: url.searchParams.get('name') || undefined,
        lang,
      }),
    );
    return true;
  }

  // --- Gruppen des Nutzers ---
  if (request.method === 'GET' && path.startsWith('/api/shared/groups/')) {
    const userId = path.split('/').pop() ?? '';
    sendJson(response, 200, {
      groups: listGroups()
        .filter((group) => memberOf(group, userId))
        .map((group) => publicView(group, userId)),
    });
    return true;
  }

  // --- Einladung prüfen (vor dem Login, für die Beitritts-Karte) ---
  if (request.method === 'GET' && path === '/api/shared/invite') {
    const group = findGroupByInvite(url.searchParams.get('token') ?? '');
    sendJson(
      response,
      group ? 200 : 404,
      group ? { name: group.name, trackCount: group.state.length } : { error: 'invalid' },
    );
    return true;
  }

  if (request.method !== 'POST') return false;

  const body = await readJsonBody<{
    groupId?: string;
    userId?: string;
    key?: string;
    targetUserId?: string;
    canAdd?: boolean;
    canRemove?: boolean;
    enabled?: boolean;
  }>(request);
  const group = body.groupId ? loadGroup(body.groupId) : undefined;
  const userId = body.userId ?? '';
  const key = body.key ?? '';
  const forbidden = () => {
    sendJson(response, 403, { error: 'forbidden' });
    return true;
  };

  // --- Rechte je Mitglied (nur Master) ---
  if (path === '/api/shared/permissions') {
    if (!group || !authorize(group, userId, key, true)) return forbidden();
    const targetMember = memberOf(group, body.targetUserId ?? '');
    if (!targetMember || targetMember.userId === group.masterUserId) {
      sendJson(response, 400, { error: 'invalid member' });
      return true;
    }
    if (typeof body.canAdd === 'boolean') targetMember.canAdd = body.canAdd;
    if (typeof body.canRemove === 'boolean') targetMember.canRemove = body.canRemove;
    saveGroup(group);
    sendJson(response, 200, publicView(group, userId));
    return true;
  }

  // --- Mitglied entfernen (nur Master) ---
  if (path === '/api/shared/member/remove') {
    if (!group || !authorize(group, userId, key, true)) return forbidden();
    const targetId = body.targetUserId ?? '';
    if (targetId === group.masterUserId) {
      sendJson(response, 400, { error: 'cannot remove master' });
      return true;
    }
    group.members = group.members.filter((member) => member.userId !== targetId);
    saveGroup(group);
    console.log(`[shared] ${targetId} aus Gruppe ${group.groupId} entfernt`);
    sendJson(response, 200, publicView(group, userId));
    return true;
  }

  // --- Manueller Abgleich (nur Master) ---
  if (path === '/api/shared/sync') {
    if (!group || !authorize(group, userId, key, true)) return forbidden();
    try {
      const changed = await syncGroup(group);
      sendJson(response, 200, { changed, group: publicView(group, userId) });
    } catch (error) {
      console.error('[shared] Manueller Abgleich fehlgeschlagen:', error);
      sendJson(response, 500, { error: 'sync failed' });
    }
    return true;
  }

  // --- Abgleich pausieren/fortsetzen (Master: Gruppe, Mitglied: nur selbst) ---
  if (path === '/api/shared/toggle-sync') {
    if (!group) return forbidden();
    const member = authorize(group, userId, key);
    if (!member) return forbidden();
    member.syncEnabled = Boolean(body.enabled);
    if (group.masterUserId === userId) group.syncEnabled = member.syncEnabled;
    saveGroup(group);
    sendJson(response, 200, publicView(group, userId));
    return true;
  }

  // --- Verlassen (Master löst die Gruppe auf) ---
  if (path === '/api/shared/leave') {
    if (!group) return forbidden();
    if (!authorize(group, userId, key)) return forbidden();
    if (group.masterUserId === userId) {
      unlinkSync(groupFile(group.groupId));
      console.log(`[shared] Gruppe ${group.groupId} vom Master aufgelöst, Daten gelöscht`);
    } else {
      group.members = group.members.filter((entry) => entry.userId !== userId);
      saveGroup(group);
      console.log(`[shared] ${userId} hat Gruppe ${group.groupId} verlassen`);
    }
    sendJson(response, 200, { left: true });
    return true;
  }

  // --- Einladungslink neu erzeugen / (de)aktivieren (nur Master) ---
  if (path === '/api/shared/invite') {
    if (!group || !authorize(group, userId, key, true)) return forbidden();
    if (typeof body.enabled === 'boolean') group.inviteEnabled = body.enabled;
    else group.inviteToken = randomToken(18);
    saveGroup(group);
    sendJson(response, 200, publicView(group, userId));
    return true;
  }

  return false;
}

/** Rückkehr vom Tidal-Login: Gruppe anlegen oder beitreten */
async function handleSharedCallback(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  state: string,
  appPath: string,
): Promise<boolean> {
  const code = url.searchParams.get('code');
  if (!code) {
    redirect(response, `${appPath}?shared=error`);
    return true;
  }
  try {
    const { userId, refreshToken, data } = await loginStore.finish(request, state, code);
    const group =
      data.mode === 'create'
        ? await handleCreate(userId, refreshToken, data)
        : await handleJoin(userId, refreshToken, data);
    const member = memberOf(group, userId);
    const flag = data.mode === 'create' ? 'created' : 'joined';
    // In der Sprache zurückkehren, aus der der Nutzer gekommen ist
    redirect(
      response,
      `${PATHS[data.lang].sharedPlaylist}?shared=${flag}&group=${group.groupId}` +
        `&key=${member?.mgmtKey ?? ''}`,
    );
  } catch (error) {
    console.error('[shared] Callback-Fehler:', error);
    redirect(response, `${appPath}?shared=error`);
  }
  return true;
}
