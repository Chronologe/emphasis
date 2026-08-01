import { IS_GERMAN } from '../shared/i18n';
import { ROUTES } from '../shared/router';

/** Sicht des Servers auf eine Gruppe (ohne Tokens/Schlüssel anderer). */
export type GroupMember = {
  userId: string;
  displayName: string;
  joinedAt: string;
  canAdd: boolean;
  canRemove: boolean;
  syncEnabled: boolean;
  isMaster: boolean;
};

export type GroupView = {
  groupId: string;
  name: string;
  isMaster: boolean;
  masterName: string;
  trackCount: number;
  lastSyncAt?: string;
  groupSyncEnabled: boolean;
  inviteEnabled: boolean;
  inviteToken?: string;
  playlistId?: string;
  me?: { canAdd: boolean; canRemove: boolean; syncEnabled: boolean };
  members: GroupMember[];
};

/** Verwaltungsschlüssel je Gruppe – wie beim Auto-Mix im Browser gespeichert */
const KEY_PREFIX = 'emp-shared-key-';

export function storeGroupKey(groupId: string, key: string): void {
  try {
    localStorage.setItem(KEY_PREFIX + groupId, key);
  } catch {
    /* Speicher gesperrt */
  }
}

export function groupKey(groupId: string): string {
  try {
    return localStorage.getItem(KEY_PREFIX + groupId) ?? '';
  } catch {
    return '';
  }
}

export function forgetGroupKey(groupId: string): void {
  try {
    localStorage.removeItem(KEY_PREFIX + groupId);
  } catch {
    /* Speicher gesperrt */
  }
}

const lang = () => (IS_GERMAN ? 'de' : 'en');

/** Startet den OAuth-Flow zum Anlegen einer Gruppe (verlässt die Seite). */
export function startCreate(options: { playlistId?: string; name?: string }): void {
  const params = new URLSearchParams({ mode: 'create', lang: lang() });
  if (options.playlistId) params.set('playlistId', options.playlistId);
  if (options.name) params.set('name', options.name);
  window.location.href = `/api/shared/start?${params.toString()}`;
}

/** Startet den OAuth-Flow zum Beitreten (verlässt die Seite). */
export function startJoin(inviteToken: string): void {
  const params = new URLSearchParams({ mode: 'join', token: inviteToken, lang: lang() });
  window.location.href = `/api/shared/start?${params.toString()}`;
}

export async function fetchGroups(userId: string): Promise<GroupView[]> {
  const response = await fetch(`/api/shared/groups/${encodeURIComponent(userId)}`);
  if (!response.ok) throw new Error(String(response.status));
  const { groups } = (await response.json()) as { groups: GroupView[] };
  return groups;
}

export async function fetchInvite(
  token: string,
): Promise<{ name: string; trackCount: number } | undefined> {
  const response = await fetch(`/api/shared/invite?token=${encodeURIComponent(token)}`);
  if (!response.ok) return undefined;
  return (await response.json()) as { name: string; trackCount: number };
}

async function post<T>(path: string, groupId: string, userId: string, extra: object = {}): Promise<T> {
  const response = await fetch(`/api/shared/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ groupId, userId, key: groupKey(groupId), ...extra }),
  });
  if (!response.ok) throw new Error(String(response.status));
  return (await response.json()) as T;
}

export const setPermissions = (
  groupId: string,
  userId: string,
  targetUserId: string,
  permissions: { canAdd?: boolean; canRemove?: boolean },
) => post<GroupView>('permissions', groupId, userId, { targetUserId, ...permissions });

export const removeMember = (groupId: string, userId: string, targetUserId: string) =>
  post<GroupView>('member/remove', groupId, userId, { targetUserId });

export const syncNow = (groupId: string, userId: string) =>
  post<{ changed: number; group: GroupView }>('sync', groupId, userId);

export const toggleSync = (groupId: string, userId: string, enabled: boolean) =>
  post<GroupView>('toggle-sync', groupId, userId, { enabled });

export const leaveGroup = (groupId: string, userId: string) =>
  post<{ left: boolean }>('leave', groupId, userId);

export const regenerateInvite = (groupId: string, userId: string) =>
  post<GroupView>('invite', groupId, userId);

export const setInviteEnabled = (groupId: string, userId: string, enabled: boolean) =>
  post<GroupView>('invite', groupId, userId, { enabled });

export function inviteLink(token: string): string {
  // Aktuelle Sprach-URL verwenden – nicht den alten Pfad, der nur noch
  // per Weiterleitung funktioniert.
  return `${window.location.origin}${ROUTES.sharedPlaylist}?join=${token}`;
}
