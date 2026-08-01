import { useState } from 'react';
import { Check, Copy, Link2, Link2Off, RotateCcw } from 'lucide-react';
import { t } from '../shared/i18n';
import { inviteLink, regenerateInvite, setInviteEnabled, type GroupView } from './api';

/** Einladungslink: kopieren, neu erzeugen, deaktivieren (nur für den Master). */
export default function InviteCard({
  group,
  userId,
  onUpdate,
}: {
  group: GroupView;
  userId: string;
  onUpdate: (group: GroupView) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const link = group.inviteToken ? inviteLink(group.inviteToken) : '';

  async function change(action: () => Promise<GroupView>) {
    setBusy(true);
    try {
      onUpdate(await action());
    } catch {
      /* Fehleranzeige übernimmt die Elternkomponente */
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* Clipboard gesperrt – der Link steht sichtbar im Feld */
    }
  }

  return (
    <section className="card rise">
      <h2>{t.sharedInviteTitle}</h2>

      {group.inviteEnabled ? (
        <>
          <input className="field mono" type="text" readOnly value={link} onFocus={(e) => e.target.select()} />
          <div className="row gap wrap">
            <button className="primary with-icon" onClick={() => void copy()} disabled={busy}>
              {copied ? (
                <Check size={16} strokeWidth={2.5} aria-hidden />
              ) : (
                <Copy size={16} strokeWidth={2} aria-hidden />
              )}
              {copied ? t.sharedInviteCopied : t.sharedInviteCopy}
            </button>
            <button
              className="ghost with-icon"
              disabled={busy}
              onClick={() => void change(() => regenerateInvite(group.groupId, userId))}
            >
              <RotateCcw size={16} strokeWidth={2} aria-hidden />
              {t.sharedInviteRegenerate}
            </button>
            <button
              className="ghost with-icon"
              disabled={busy}
              onClick={() => void change(() => setInviteEnabled(group.groupId, userId, false))}
            >
              <Link2Off size={16} strokeWidth={2} aria-hidden />
              {t.sharedInviteDisable}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="muted">{t.sharedInviteDisabled}</p>
          <button
            className="primary with-icon"
            disabled={busy}
            onClick={() => void change(() => setInviteEnabled(group.groupId, userId, true))}
          >
            <Link2 size={16} strokeWidth={2} aria-hidden />
            {t.sharedInviteEnable}
          </button>
        </>
      )}
    </section>
  );
}
