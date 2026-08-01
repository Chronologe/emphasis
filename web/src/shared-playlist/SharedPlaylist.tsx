import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ExternalLink,
  ListPlus,
  LogOut,
  Pause,
  Play,
  Plus,
  RefreshCw,
  UserPlus,
} from 'lucide-react';
import { login } from '../shared/auth';
import { formatDate, t } from '../shared/i18n';
import { fetchOwnPlaylists, type PlaylistInfo } from '../shared/playlistItems';
import { ROUTES } from '../shared/router';
import SeoContent from '../shared/SeoContent';
import Select from '../shared/components/Select';
import {
  fetchGroups,
  fetchInvite,
  forgetGroupKey,
  leaveGroup,
  startCreate,
  startJoin,
  storeGroupKey,
  syncNow,
  toggleSync,
  type GroupView,
} from './api';
import MemberList from './MemberList';
import InviteCard from './InviteCard';

/** Nur eigene Playlists anbieten, nicht die automatisch erzeugten */
function isOfferable(playlist: PlaylistInfo): boolean {
  const description = (playlist.description ?? '').toLowerCase();
  return !description.includes('emphasis');
}

export default function SharedPlaylist({
  loggedIn,
  userId,
}: {
  loggedIn: boolean;
  userId: string;
}) {
  const [groups, setGroups] = useState<GroupView[] | null>(null);
  const [playlists, setPlaylists] = useState<PlaylistInfo[]>([]);
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [selectedPlaylist, setSelectedPlaylist] = useState('');
  const [newName, setNewName] = useState('');
  const [invite, setInvite] = useState<{ token: string; name: string } | null>(null);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [unavailable, setUnavailable] = useState(false);
  const startedRef = useRef(false);

  const joinToken = new URLSearchParams(window.location.search).get('join');

  const reload = useCallback(async () => {
    try {
      setGroups(await fetchGroups(userId));
    } catch {
      setUnavailable(true);
    }
  }, [userId]);

  // Rückkehr vom OAuth-Flow auswerten
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const state = params.get('shared');
    if (!state) return;
    const groupId = params.get('group');
    const key = params.get('key');
    if ((state === 'created' || state === 'joined') && groupId && key) {
      storeGroupKey(groupId, key);
      setNotice(state === 'joined' ? t.sharedJoinedNotice : '');
    } else if (state === 'invalid') {
      setError(t.sharedJoinInvalid);
    } else if (state === 'full') {
      setError(t.sharedUnavailable);
    } else if (state === 'error') {
      setError(t.sharedError);
    }
    window.history.replaceState({}, '', window.location.pathname);
  }, []);

  // Gruppen und eigene Playlists laden
  useEffect(() => {
    if (!loggedIn || !userId || startedRef.current) return;
    startedRef.current = true;
    void reload();
    void fetchOwnPlaylists(userId)
      .then((list) => setPlaylists(list.filter(isOfferable)))
      .catch(() => setPlaylists([]));
  }, [loggedIn, userId, reload]);

  // Einladungslink: Name der Gruppe für die Beitritts-Karte holen
  useEffect(() => {
    if (!joinToken) return;
    void fetchInvite(joinToken).then((info) => {
      if (info) setInvite({ token: joinToken, name: info.name });
      else setError(t.sharedJoinInvalid);
    });
  }, [joinToken]);

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError('');
    setNotice('');
    try {
      await action();
    } catch {
      setError(t.sharedError);
    } finally {
      setBusy('');
    }
  }

  const group = groups?.[0];
  const alreadyMember = Boolean(invite && groups?.some((entry) => entry.name === invite.name));

  return (
    <>
      <section className="hero rise">
        <h1>
          {t.sharedHeroPrefix} <span className="accent">{t.sharedHeroAccent}</span>
          {t.sharedHeroSuffix}
        </h1>
        <p className="subtitle">{t.sharedHeroSubtitle}</p>
      </section>

      {error && <div className="banner error rise">{error}</div>}
      {notice && <div className="banner notice rise">{notice}</div>}
      {unavailable && <div className="banner warning rise">{t.sharedUnavailable}</div>}

      {!loggedIn && (
        <section className="card center rise">
          <p>{t.sharedConnectPrompt}</p>
          <button
            className="primary"
            onClick={() =>
              void login(ROUTES.sharedPlaylist + (joinToken ? `?join=${joinToken}` : ''))
            }
          >
            {t.loginButton}
          </button>
        </section>
      )}

      {/* Beitritt über Einladungslink */}
      {loggedIn && invite && !alreadyMember && (
        <section className="card rise">
          <h2>{t.sharedJoinTitle}</h2>
          <p className="muted">{t.sharedJoinIntro(invite.name)}</p>
          <button className="primary glow with-icon" onClick={() => startJoin(invite.token)}>
            <UserPlus size={17} strokeWidth={2} aria-hidden />
            {t.sharedJoinButton}
          </button>
        </section>
      )}

      {busy && (
        <div className="progress rise">
          <img className="loader" src="/brand/emphasis-logomark-animated.svg" alt="" aria-hidden />
          <span>{busy}</span>
        </div>
      )}

      {/* Bestehende Gruppe */}
      {loggedIn && group && (
        <>
          <section className="card rise">
            <div className="row space-between wrap">
              <h2>{group.name}</h2>
              <span className="tag">{group.isMaster ? t.sharedRoleMaster : t.sharedRoleMember}</span>
            </div>
            <p className="muted">
              {t.sharedTrackCount(group.trackCount)}
              {!group.isMaster && ` · ${t.sharedMasterLabel(group.masterName)}`}
            </p>
            <p className="muted">
              {group.lastSyncAt
                ? t.sharedLastSync(formatDate(new Date(group.lastSyncAt)))
                : t.sharedNeverSynced}
              {group.groupSyncEnabled && group.me?.syncEnabled && ` · ${t.sharedNextSync}`}
            </p>

            {group.me && (
              <p className="muted">
                {t.sharedYourRights}{' '}
                {group.me.canAdd && group.me.canRemove
                  ? t.sharedRightsBoth
                  : group.me.canAdd
                    ? t.sharedRightsAddOnly
                    : group.me.canRemove
                      ? t.sharedRightsRemoveOnly
                      : t.sharedRightsNone}
              </p>
            )}

            {!group.groupSyncEnabled && group.isMaster === false && (
              <p className="banner warning">{t.sharedSyncPausedGroup}</p>
            )}
            {group.me && !group.me.syncEnabled && (
              <p className="banner warning">{t.sharedSyncPaused}</p>
            )}

            <div className="row gap wrap">
              {group.playlistId && (
                <a
                  className="ghost button-like with-icon"
                  href={`https://listen.tidal.com/playlist/${group.playlistId}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink size={16} strokeWidth={2} aria-hidden />
                  {t.sharedOpenInTidal}
                </a>
              )}
              {group.isMaster && (
                <button
                  className="primary glow with-icon"
                  disabled={Boolean(busy)}
                  onClick={() =>
                    void run(t.sharedSyncing, async () => {
                      const { changed, group: updated } = await syncNow(group.groupId, userId);
                      setGroups([updated, ...(groups ?? []).slice(1)]);
                      setNotice(t.sharedSyncDone(changed));
                    })
                  }
                >
                  <RefreshCw size={16} strokeWidth={2.25} aria-hidden />
                  {t.sharedSyncNow}
                </button>
              )}
              <button
                className="ghost with-icon"
                disabled={Boolean(busy)}
                onClick={() =>
                  void run('', async () => {
                    const updated = await toggleSync(
                      group.groupId,
                      userId,
                      !(group.me?.syncEnabled ?? true),
                    );
                    setGroups([updated, ...(groups ?? []).slice(1)]);
                  })
                }
              >
                {group.me?.syncEnabled ? (
                  <Pause size={16} strokeWidth={2} aria-hidden />
                ) : (
                  <Play size={16} strokeWidth={2} aria-hidden />
                )}
                {group.me?.syncEnabled ? t.sharedSyncPause : t.sharedSyncResume}
              </button>
              <button
                className="ghost with-icon"
                disabled={Boolean(busy)}
                onClick={() => {
                  const message = group.isMaster ? t.sharedDissolveConfirm : t.sharedLeaveConfirm;
                  if (!window.confirm(message)) return;
                  void run('', async () => {
                    await leaveGroup(group.groupId, userId);
                    forgetGroupKey(group.groupId);
                    setGroups((groups ?? []).slice(1));
                    setNotice(t.sharedLeftNotice);
                  });
                }}
              >
                <LogOut size={16} strokeWidth={2} aria-hidden />
                {group.isMaster ? t.sharedDissolve : t.sharedLeave}
              </button>
            </div>
          </section>

          {group.isMaster && (
            <InviteCard group={group} userId={userId} onUpdate={(g) => setGroups([g, ...(groups ?? []).slice(1)])} />
          )}

          <MemberList
            group={group}
            userId={userId}
            onUpdate={(g) => setGroups([g, ...(groups ?? []).slice(1)])}
          />
        </>
      )}

      {/* Neue Gruppe anlegen */}
      {loggedIn && groups && !group && !invite && (
        <section className="card rise">
          <h2>{t.sharedCreateTitle}</h2>
          <p className="muted">{t.sharedCreateIntro}</p>

          <div className="row gap wrap mode-switch">
            <button
              className={`with-icon ${mode === 'existing' ? 'primary' : 'ghost'}`}
              onClick={() => setMode('existing')}
            >
              <ListPlus size={16} strokeWidth={2} aria-hidden />
              {t.sharedUseExisting}
            </button>
            <button
              className={`with-icon ${mode === 'new' ? 'primary' : 'ghost'}`}
              onClick={() => setMode('new')}
            >
              <Plus size={16} strokeWidth={2.25} aria-hidden />
              {t.sharedCreateNew}
            </button>
          </div>

          {mode === 'existing' ? (
            playlists.length > 0 ? (
              <Select
                value={selectedPlaylist}
                onChange={setSelectedPlaylist}
                placeholder={t.sharedSelectPlaceholder}
                options={playlists.map((playlist) => ({
                  value: playlist.id,
                  label: playlist.name,
                  hint: playlist.numberOfItems ? t.sharedTrackShort(playlist.numberOfItems) : undefined,
                }))}
              />
            ) : (
              <p className="muted">{t.sharedNoPlaylists}</p>
            )
          ) : (
            <input
              className="field"
              type="text"
              placeholder={t.sharedNewNamePlaceholder}
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
            />
          )}

          <button
            className="primary glow"
            disabled={mode === 'existing' ? !selectedPlaylist : newName.trim().length === 0}
            onClick={() =>
              mode === 'existing'
                ? startCreate({ playlistId: selectedPlaylist })
                : startCreate({ name: newName.trim() })
            }
          >
            {t.sharedCreateButton}
          </button>
        </section>
      )}

      {!loggedIn && <SeoContent page="sharedPlaylist" />}
    </>
  );
}
