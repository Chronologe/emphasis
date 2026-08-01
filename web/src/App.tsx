import { useEffect, useRef, useState } from 'react';
import { CLIENT_ID, getUserId, initAuth, takeReturnTo } from './shared/auth';
import { LANG, t } from './shared/i18n';
import { navigate, ROUTES, useRoute, type Route } from './shared/router';
import { applyPageMeta } from './shared/seoMeta';
import Layout from './shared/Layout';
import Landing from './landing/Landing';
import WeeklyMix from './your-weekly-mix/WeeklyMix';
import SharedPlaylist from './shared-playlist/SharedPlaylist';
import './shared/App.css';

/**
 * Hülle für beide Tools: erledigt Login-Initialisierung einmalig, verteilt
 * userId/Login-Zustand und wählt anhand der Route das Tool aus.
 */
export default function App() {
  const route = useRoute();
  const [ready, setReady] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [userId, setUserId] = useState('');
  const [coverUrls, setCoverUrls] = useState<string[]>([]);
  const startedRef = useRef(false);

  useEffect(() => {
    // StrictMode ruft Effekte doppelt auf; der OAuth-Code darf nur einmal eingelöst werden
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      if (!CLIENT_ID) {
        setReady(true);
        return;
      }
      try {
        const isLoggedIn = await initAuth();
        setLoggedIn(isLoggedIn);
        if (isLoggedIn) setUserId(await getUserId());

        // Nach dem Tidal-Login zum ursprünglich gewünschten Tool springen.
        // Der Login kehrt immer auf "/" zurück, also in die deutsche Fassung –
        // wollte der Nutzer in die englische, muss die Seite neu geladen
        // werden, weil die Sprache an der URL hängt.
        const target = takeReturnTo();
        if (target && target !== window.location.pathname + window.location.search) {
          const targetLang = /^\/en(\/|$)/i.test(target) ? 'en' : 'de';
          if (targetLang !== LANG) {
            window.location.replace(target);
            return;
          }
          window.history.replaceState({}, '', target);
          window.dispatchEvent(new PopStateEvent('popstate'));
        }
      } catch {
        setLoggedIn(false);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  function renderRoute(current: Route) {
    if (!ready) return <div className="progress rise"><span>{t.statusLoadingProfile}</span></div>;

    if (!CLIENT_ID) {
      return (
        <section className="card rise">
          <h2>{t.setupTitle}</h2>
          <p>
            {t.setupBefore}{' '}
            <a href="https://developer.tidal.com/dashboard" target="_blank" rel="noreferrer">
              {t.setupDashboard}
            </a>{' '}
            {t.setupRedirect} <code>{window.location.origin}/</code> {t.setupEnterId}{' '}
            <code>.env.local</code> {t.setupInto} <code>VITE_TIDAL_CLIENT_ID=…</code>{' '}
            {t.setupRestart}
          </p>
        </section>
      );
    }

    switch (current) {
      case ROUTES.weeklyMix:
        return (
          <WeeklyMix
            loggedIn={loggedIn}
            userId={userId}
            onCoverUrls={setCoverUrls}
          />
        );
      case ROUTES.sharedPlaylist:
        return <SharedPlaylist loggedIn={loggedIn} userId={userId} />;
      default:
        return <Landing loggedIn={loggedIn} />;
    }
  }

  // Titel, Description, Canonical & hreflang bei jedem Seitenwechsel nachziehen
  useEffect(() => {
    applyPageMeta(route);
  }, [route]);

  // Einladungslink kann auf "/" landen, wenn der Nutzer ihn kürzt – dann weiterleiten
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('join') && route !== ROUTES.sharedPlaylist) {
      navigate(ROUTES.sharedPlaylist, `?join=${params.get('join')}`);
    }
  }, [route]);

  return (
    <Layout coverUrls={coverUrls} loggedIn={loggedIn} route={route}>
      {renderRoute(route)}
    </Layout>
  );
}
