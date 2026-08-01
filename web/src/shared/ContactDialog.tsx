import { useEffect, useRef, useState } from 'react';
import { Bug, Lightbulb, MessageCircleQuestion, Send, X } from 'lucide-react';
import { t } from './i18n';

type Kind = 'bug' | 'suggestion' | 'question';
type State = 'form' | 'sending' | 'sent' | 'error';

/**
 * Kontaktformular als Dialog.
 *
 * Die Nachricht geht an /api/contact – die Zieladresse kennt nur der Server.
 * Deshalb steht hier bewusst kein mailto:-Link: der würde die private
 * Adresse an jeden Besucher und jeden Crawler ausliefern.
 */
export default function ContactDialog({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = useState<Kind>('question');
  const [message, setMessage] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [website, setWebsite] = useState(''); // Honigtopf gegen Bots
  const [state, setState] = useState<State>('form');
  const dialogRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const kinds: { value: Kind; label: string; Icon: typeof Bug }[] = [
    { value: 'question', label: t.contactKindQuestion, Icon: MessageCircleQuestion },
    { value: 'bug', label: t.contactKindBug, Icon: Bug },
    { value: 'suggestion', label: t.contactKindSuggestion, Icon: Lightbulb },
  ];

  const tooShort = message.trim().length < 10;

  async function submit() {
    if (tooShort) return;
    setState('sending');
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, message: message.trim(), replyTo: replyTo.trim(), website }),
      });
      setState(response.ok ? 'sent' : 'error');
    } catch {
      setState('error');
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (!dialogRef.current?.contains(event.target as Node)) onClose();
      }}
    >
      <div
        className="card modal rise"
        role="dialog"
        aria-modal="true"
        aria-label={t.contactTitle}
        ref={dialogRef}
      >
        <div className="row space-between">
          <h2>{t.contactTitle}</h2>
          <button className="ghost small icon-only" onClick={onClose} aria-label={t.contactClose}>
            <X size={16} strokeWidth={2} aria-hidden />
          </button>
        </div>

        {state === 'sent' ? (
          <>
            <p className="success">{t.contactSent}</p>
            <button className="primary" onClick={onClose}>
              {t.contactClose}
            </button>
          </>
        ) : (
          <>
            <p className="muted">{t.contactIntro}</p>

            <div className="row gap wrap mode-switch">
              {kinds.map((option) => (
                <button
                  key={option.value}
                  className={`with-icon ${kind === option.value ? 'primary' : 'ghost'}`}
                  onClick={() => setKind(option.value)}
                >
                  <option.Icon size={16} strokeWidth={2} aria-hidden />
                  {option.label}
                </button>
              ))}
            </div>

            <textarea
              className="field"
              ref={textareaRef}
              rows={6}
              maxLength={5000}
              placeholder={t.contactMessagePlaceholder}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />

            <input
              className="field"
              type="email"
              maxLength={200}
              placeholder={t.contactReplyPlaceholder}
              value={replyTo}
              onChange={(event) => setReplyTo(event.target.value)}
            />

            {/* Für Menschen unsichtbar – füllt ein Bot das Feld, wird verworfen */}
            <input
              className="honeypot"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
            />

            {state === 'error' && <p className="banner error">{t.contactError}</p>}

            <div className="row gap wrap">
              <button
                className="primary glow with-icon"
                disabled={tooShort || state === 'sending'}
                onClick={() => void submit()}
              >
                <Send size={16} strokeWidth={2} aria-hidden />
                {state === 'sending' ? t.contactSending : t.contactSend}
              </button>
            </div>
            <p className="muted contact-note">{t.contactPrivacyNote}</p>
          </>
        )}
      </div>
    </div>
  );
}
