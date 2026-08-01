import { useState, type ReactNode } from 'react';
import { LayoutGrid, LogOut, MessageSquarePlus } from 'lucide-react';
import { logout } from './auth';
import ContactDialog from './ContactDialog';
import GithubIcon from './GithubIcon';
import { browserLanguage, LANG, rememberLanguage, storedLanguage, t } from './i18n';
import { navigate, ROUTES, routeInLanguage, type Route } from './router';
import { REPO_URL } from './seo';
import CoverCollage from './components/CoverCollage';
import LanguageSwitch from './LanguageSwitch';

/**
 * Gemeinsamer Rahmen beider Tools: Hintergrund-Collage, Kopfleiste mit Logo
 * (führt zur Startseite) und Fußzeile mit Marken-Hinweis und Datenschutz.
 */
export default function Layout({
  children,
  coverUrls = [],
  loggedIn = false,
  route,
}: {
  children: ReactNode;
  coverUrls?: string[];
  loggedIn?: boolean;
  route: Route;
}) {
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [offerHidden, setOfferHidden] = useState(false);

  /**
   * Anderssprachigen Besuchern die passende Fassung anbieten – als Hinweis,
   * nicht als automatische Weiterleitung: eine Weiterleitung würde auch den
   * Googlebot erwischen (der crawlt mit englischem Accept-Language) und die
   * deutsche Startseite als englische Seite in den Index bringen.
   */
  const showLanguageOffer =
    !offerHidden && !storedLanguage() && browserLanguage() !== LANG;

  return (
    <>
      <CoverCollage coverUrls={coverUrls} />

      <header className="topbar">
        <div className="topbar-inner">
          <a
            className="brand"
            href={ROUTES.landing}
            onClick={(event) => {
              event.preventDefault();
              navigate(ROUTES.landing);
            }}
          >
            <img className="brand-logo" src="/brand/emphasis-logo-horizontal.svg" alt="Emphasis" />
            <span className="brand-sub">{t.brandSub}</span>
          </a>
          {/* Auf schmalen Displays nur die Icons – sonst überlappt die Leiste das Logo */}
          <nav className="topbar-nav">
            {route !== ROUTES.landing && (
              <button
                className="ghost small with-icon"
                onClick={() => navigate(ROUTES.landing)}
                title={t.navAllTools}
                aria-label={t.navAllTools}
              >
                <LayoutGrid size={16} strokeWidth={2} aria-hidden />
                <span className="nav-label">{t.navAllTools}</span>
              </button>
            )}
            {loggedIn && (
              <button
                className="ghost small with-icon"
                onClick={logout}
                title={t.logoutButton}
                aria-label={t.logoutButton}
              >
                <LogOut size={16} strokeWidth={2} aria-hidden />
                <span className="nav-label">{t.logoutButton}</span>
              </button>
            )}
            <LanguageSwitch route={route} />
          </nav>
        </div>
      </header>

      <main className="app">
        {showLanguageOffer && (
          <div className="banner lang-offer" lang={LANG === 'de' ? 'en' : 'de'}>
            <span>{t.langOfferText}</span>{' '}
            <a
              href={routeInLanguage(route, LANG === 'de' ? 'en' : 'de')}
              onClick={() => rememberLanguage(LANG === 'de' ? 'en' : 'de')}
            >
              {t.langOfferAction}
            </a>
            <button
              className="linklike lang-offer-dismiss"
              onClick={() => setOfferHidden(true)}
              aria-label={t.langOfferDismiss}
            >
              ×
            </button>
          </div>
        )}

        {children}

        {showPrivacy && (
          <section className="card rise">
            <h2>{t.privacyTitle}</h2>
            {t.privacyBody.map((paragraph, index) => (
              <p className="muted" key={index}>
                {paragraph}
              </p>
            ))}
            <button className="ghost" onClick={() => setShowPrivacy(false)}>
              {t.privacyClose}
            </button>
          </section>
        )}

        <footer className="footer">
          <div className="footer-icons">
            <a
              className="footer-icon"
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              title={t.footerRepo}
              aria-label={t.footerRepo}
            >
              <GithubIcon size={18} />
            </a>
            <button
              className="footer-icon"
              onClick={() => setShowContact(true)}
              title={t.footerContact}
              aria-label={t.footerContact}
            >
              <MessageSquarePlus size={19} strokeWidth={1.75} aria-hidden />
            </button>
          </div>

          {t.footer}{' '}
          <button className="linklike" onClick={() => setShowPrivacy((value) => !value)}>
            {t.privacyLink}
          </button>
        </footer>
      </main>

      {showContact && <ContactDialog onClose={() => setShowContact(false)} />}
    </>
  );
}
