import { useState } from 'react';
import { Crown, PauseCircle, UserMinus } from 'lucide-react';
import { formatDate, t } from '../shared/i18n';
import { removeMember, setPermissions, type GroupView } from './api';

/**
 * Mitgliederliste. Der Master sieht je Person Schalter für „darf hinzufügen"
 * und „darf löschen" sowie einen Entfernen-Knopf; Mitglieder sehen die Liste
 * nur lesend.
 */
export default function MemberList({
  group,
  userId,
  onUpdate,
}: {
  group: GroupView;
  userId: string;
  onUpdate: (group: GroupView) => void;
}) {
  const [busyUser, setBusyUser] = useState('');

  async function change(targetUserId: string, action: () => Promise<GroupView>) {
    setBusyUser(targetUserId);
    try {
      onUpdate(await action());
    } catch {
      /* Fehler wird in der Elternkomponente sichtbar, wenn neu geladen wird */
    } finally {
      setBusyUser('');
    }
  }

  return (
    <section className="card rise">
      <h2>{t.sharedMembersTitle(group.members.length)}</h2>
      <ul className="member-list">
        {group.members.map((member) => {
          const isSelf = member.userId === userId;
          const editable = group.isMaster && !member.isMaster;
          return (
            <li key={member.userId} className={busyUser === member.userId ? 'busy' : undefined}>
              <div className="member-main">
                <span className="member-name">
                  {member.displayName}
                  {isSelf && <span className="tag">{t.sharedMemberYou}</span>}
                  {member.isMaster && (
                    <span className="tag accent-tag with-icon">
                      <Crown size={12} strokeWidth={2.25} aria-hidden />
                      master
                    </span>
                  )}
                </span>
                <span className="member-meta with-icon">
                  {t.sharedMemberSince(formatDate(new Date(member.joinedAt)))}
                  {!member.syncEnabled && <PauseCircle size={13} strokeWidth={2} aria-hidden />}
                </span>
              </div>

              <div className="member-perms">
                <label className={editable ? '' : 'disabled'}>
                  <input
                    type="checkbox"
                    checked={member.canAdd}
                    disabled={!editable || busyUser === member.userId}
                    onChange={(event) =>
                      void change(member.userId, () =>
                        setPermissions(group.groupId, userId, member.userId, {
                          canAdd: event.target.checked,
                        }),
                      )
                    }
                  />
                  {t.sharedPermAdd}
                </label>
                <label className={editable ? '' : 'disabled'}>
                  <input
                    type="checkbox"
                    checked={member.canRemove}
                    disabled={!editable || busyUser === member.userId}
                    onChange={(event) =>
                      void change(member.userId, () =>
                        setPermissions(group.groupId, userId, member.userId, {
                          canRemove: event.target.checked,
                        }),
                      )
                    }
                  />
                  {t.sharedPermRemove}
                </label>
                {editable && (
                  <button
                    className="ghost small with-icon"
                    disabled={busyUser === member.userId}
                    onClick={() => {
                      if (!window.confirm(t.sharedMemberRemoveConfirm(member.displayName))) return;
                      void change(member.userId, () =>
                        removeMember(group.groupId, userId, member.userId),
                      );
                    }}
                  >
                    <UserMinus size={14} strokeWidth={2} aria-hidden />
                    {t.sharedMemberRemove}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
