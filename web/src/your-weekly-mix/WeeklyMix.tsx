import { useEffect, useRef, useState } from 'react';
import { login } from '../shared/auth';
import { buildInputSet, type InputSet } from './inputSet';
import { generateMix, type MixResult } from './generator';
import { getMixState, getPreviousMixIds, saveMixAsPlaylist, type CoverStatus } from './playlist';
import { fetchCoverUrls } from '../shared/covers';
import { formatDate, IS_GERMAN, t } from '../shared/i18n';
import { ROUTES } from '../shared/router';
import SeoContent from '../shared/SeoContent';

const COVER_STATUS_TEXT: Record<CoverStatus, string> = {
  set: t.coverSet,
  'no-file': t.coverNoFile,
  'not-allowed': t.coverNotAllowed,
  failed: t.coverFailed,
};

type Phase = 'profile' | 'generating' | 'mixReady' | 'saved';

type AutogenState = { enabled: boolean; lastRunAt?: string } | 'unavailable' | null;

const AUTOGEN_KEY_STORAGE = 'twm-autogen-key';

export default function WeeklyMix({
  loggedIn,
  userId,
  onCoverUrls,
}: {
  loggedIn: boolean;
  userId: string;
  onCoverUrls: (urls: string[]) => void;
}) {
  const [phase, setPhase] = useState<Phase>('profile');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [inputSet, setInputSet] = useState<InputSet | null>(null);
  const [mixResult, setMixResult] = useState<MixResult | null>(null);
  const [savedPlaylist, setSavedPlaylist] = useState<{
    playlistId: string;
    name: string;
    coverStatus: CoverStatus;
  } | null>(null);
  const [autogen, setAutogen] = useState<AutogenState>(null);
  const [notice, setNotice] = useState('');

  const startedRef = useRef(false);

  useEffect(() => {
    // StrictMode ruft Effekte doppelt auf – Profil nur einmal laden
    if (!loggedIn || !userId || startedRef.current) return;
    startedRef.current = true;
    (async () => {
      try {
        // Rückkehr vom Autogen-OAuth-Flow: Verwaltungs-Key sichern, URL säubern
        const params = new URLSearchParams(window.location.search);
        if (params.get('autogen') === 'enabled') {
          if (params.get('key')) localStorage.setItem(AUTOGEN_KEY_STORAGE, params.get('key')!);
          setNotice(t.autogenJustEnabled);
          window.history.replaceState({}, '', window.location.pathname);
        } else if (params.get('autogen') === 'error') {
          setError(t.autogenError);
          window.history.replaceState({}, '', window.location.pathname);
        } else if (params.get('autogen') === 'full') {
          setWarning(t.autogenFull);
          window.history.replaceState({}, '', window.location.pathname);
        }
        void fetchAutogenStatus(userId);

        setStatus(t.statusLoadingProfile);
        const loadedInputSet = await buildInputSet(userId, getMixState().playlistId, setStatus);
        setInputSet(loadedInputSet);
        setStatus('');
        // Collage nicht blockierend mit echten Covern anreichern
        void fetchCoverUrls(loadedInputSet.recentTracks).then(onCoverUrls);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setStatus('');
      }
    })();
  }, [loggedIn, userId, onCoverUrls]);

  async function fetchAutogenStatus(id: string) {
    try {
      const response = await fetch(`/api/autogen/status/${id}`);
      if (!response.ok) throw new Error(String(response.status));
      setAutogen((await response.json()) as { enabled: boolean; lastRunAt?: string });
    } catch {
      // Backend nicht erreichbar (z.B. lokale Entwicklung ohne Server) → Karte ausblenden
      setAutogen('unavailable');
    }
  }

  function handleAutogenEnable() {
    const playlistId = getMixState().playlistId ?? '';
    window.location.href = `/api/autogen/start?playlistId=${encodeURIComponent(playlistId)}&lang=${IS_GERMAN ? 'de' : 'en'}`;
  }

  async function handleAutogenDisable() {
    try {
      const response = await fetch('/api/autogen/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, key: localStorage.getItem(AUTOGEN_KEY_STORAGE) ?? '' }),
      });
      if (!response.ok) throw new Error(String(response.status));
      localStorage.removeItem(AUTOGEN_KEY_STORAGE);
      setAutogen({ enabled: false });
      setNotice(t.autogenDisabled);
    } catch {
      setError(t.autogenError);
    }
  }

  async function handleGenerate() {
    if (!inputSet) return;
    setError('');
    setWarning('');
    setSavedPlaylist(null);
    setPhase('generating');
    try {
      const result = await generateMix(inputSet, getPreviousMixIds(), setStatus);
      setMixResult(result);
      if (result.warning) setWarning(result.warning);
      setPhase('mixReady');
      setStatus('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('profile');
      setStatus('');
    }
  }

  async function handleSave() {
    if (!mixResult || mixResult.tracks.length === 0) return;
    setError('');
    setStatus(t.statusSaving);
    try {
      const result = await saveMixAsPlaylist(
        mixResult.tracks.map((track) => track.id),
        userId,
      );
      setSavedPlaylist(result);
      setPhase('saved');
      setStatus('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('');
    }
  }

  return (
    <>
      <section className="hero rise">
        <h1>
          {t.heroTitlePrefix} <span className="accent">{t.heroTitleAccent}</span>
          {t.heroTitleSuffix}
        </h1>
        <p className="subtitle">{t.heroSubtitle}</p>
      </section>

      {error && <div className="banner error rise">{error}</div>}
      {warning && <div className="banner warning rise">{warning}</div>}
      {notice && <div className="banner notice rise">{notice}</div>}

      {!loggedIn && (
        <section className="card center rise">
          <p>{t.connectPrompt}</p>
          <button className="primary" onClick={() => void login(ROUTES.weeklyMix)}>
            {t.loginButton}
          </button>
        </section>
      )}

      {loggedIn && (
        <>
            {inputSet && (
              <section className="card rise">
                <h2>{t.profileTitle}</h2>
                <p className="muted">
                  {t.inputSummary(
                    inputSet.recentTracks.length,
                    inputSet.heardArtistIds.size,
                    inputSet.playlistCount,
                    inputSet.favoriteCount,
                  )}
                </p>
                <div className="chips">
                  {[...inputSet.userGenres].slice(0, 10).map((genre, index) => (
                    <span className="chip pop" style={{ animationDelay: `${index * 70}ms` }} key={genre}>
                      {genre}
                    </span>
                  ))}
                  {inputSet.userGenres.size === 0 && <span className="muted">{t.noGenres}</span>}
                </div>
                {phase === 'profile' && !status && (
                  <button className="primary glow" onClick={() => void handleGenerate()}>
                    {t.generateButton}
                  </button>
                )}
              </section>
            )}

            {inputSet && autogen !== 'unavailable' && autogen !== null && (
              <section className="card rise">
                <h2>{t.autogenTitle}</h2>
                {autogen.enabled ? (
                  <>
                    <p className="success">{t.autogenActive}</p>
                    {autogen.lastRunAt && (
                      <p className="muted">{t.autogenLastRun(formatDate(new Date(autogen.lastRunAt)))}</p>
                    )}
                    <button className="ghost" onClick={() => void handleAutogenDisable()}>
                      {t.autogenDisable}
                    </button>
                  </>
                ) : (
                  <>
                    <p className="muted">{t.autogenIntro}</p>
                    <button className="primary" onClick={handleAutogenEnable}>
                      {t.autogenEnable}
                    </button>
                  </>
                )}
              </section>
            )}

            {status && (
              <div className="progress rise">
                <img
                  className="loader"
                  src="/brand/emphasis-logomark-animated.svg"
                  alt=""
                  aria-hidden
                />
                <span>{status}</span>
              </div>
            )}

            {(phase === 'mixReady' || phase === 'saved') && mixResult && (
              <section className="card rise">
                <div className="row space-between wrap">
                  <h2>{t.mixTitle(mixResult.tracks.length)}</h2>
                  {phase === 'mixReady' && (
                    <div className="row gap">
                      <button className="ghost" onClick={() => void handleGenerate()}>
                        {t.regenerateButton}
                      </button>
                      <button
                        className="primary glow"
                        onClick={() => void handleSave()}
                        disabled={mixResult.tracks.length === 0}
                      >
                        {t.saveButton}
                      </button>
                    </div>
                  )}
                </div>
                <p className="muted">
                  {t.scoreResult(mixResult.totalScore, mixResult.distinctArtistCount)}
                </p>
                <div className="chips">
                  {mixResult.distinctBonus && <span className="chip">{t.bonusDistinct}</span>}
                  {mixResult.compositionBonus && <span className="chip">{t.bonusComposition}</span>}
                </div>
                {phase === 'saved' && savedPlaylist && (
                  <>
                    <p className="success">
                      {t.savedAs(savedPlaylist.name)}{' '}
                      <a
                        href={`https://listen.tidal.com/playlist/${savedPlaylist.playlistId}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t.openInTidal}
                      </a>
                    </p>
                    <p className={savedPlaylist.coverStatus === 'set' ? 'success' : 'muted'}>
                      {COVER_STATUS_TEXT[savedPlaylist.coverStatus]}
                    </p>
                  </>
                )}
                <ol className="tracklist">
                  {mixResult.tracks.map((track, index) => (
                    <li className="pop" style={{ animationDelay: `${index * 40}ms` }} key={track.id}>
                      <a
                        href={`https://listen.tidal.com/track/${track.id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <span className="track-title">
                          {track.title}
                          {track.version ? ` (${track.version})` : ''}
                        </span>
                        <span className="track-artist">{track.artistNames.join(', ')}</span>
                      </a>
                      <span className="track-meta">
                        <span className="tag">{track.score} P</span>
                        {track.isHeardArtist && <span className="tag">{t.familiarTag}</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            )}
        </>
      )}

      {/* Erklärtext nur für Ausgeloggte: wer schon drin ist, will das Werkzeug,
          nicht die Erklärung – Suchmaschinen sind immer ausgeloggt */}
      {!loggedIn && <SeoContent page="weeklyMix" />}
    </>
  );
}
