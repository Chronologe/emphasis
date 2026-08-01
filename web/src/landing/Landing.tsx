import { ArrowRight, ListMusic, UsersRound, type LucideIcon } from 'lucide-react';
import { CLIENT_ID, login } from '../shared/auth';
import { t } from '../shared/i18n';
import { navigate, ROUTES, type Route } from '../shared/router';
import SeoContent from '../shared/SeoContent';

type Tool = {
  route: Route;
  Icon: LucideIcon;
  title: string;
  text: string;
  bullets: string[];
};

/**
 * Startseite: zeigt beide Tools. Ist der Nutzer nicht eingeloggt, führt der
 * Klick über den Tidal-Login und landet danach direkt im gewählten Tool.
 */
export default function Landing({ loggedIn }: { loggedIn: boolean }) {
  const tools: Tool[] = [
    {
      route: ROUTES.weeklyMix,
      Icon: ListMusic,
      title: t.toolWeeklyMixTitle,
      text: t.toolWeeklyMixText,
      bullets: t.toolWeeklyMixBullets,
    },
    {
      route: ROUTES.sharedPlaylist,
      Icon: UsersRound,
      title: t.toolSharedTitle,
      text: t.toolSharedText,
      bullets: t.toolSharedBullets,
    },
  ];

  function open(route: Route) {
    if (loggedIn || !CLIENT_ID) {
      navigate(route);
    } else {
      void login(route);
    }
  }

  return (
    <>
      <section className="hero rise">
        <h1>
          {t.landingTitlePrefix} <span className="accent">{t.landingTitleAccent}</span>
          {t.landingTitleSuffix}
        </h1>
        <p className="subtitle">{t.landingSubtitle}</p>
      </section>

      <div className="tool-grid">
        {tools.map((tool, index) => (
          <section
            className="card tool-card rise"
            style={{ animationDelay: `${index * 90}ms` }}
            key={tool.route}
          >
            <span className="tool-icon" aria-hidden>
              <tool.Icon size={22} strokeWidth={1.75} />
            </span>
            {/* Überschrift als echter Link: so findet eine Suchmaschine die
                Unterseiten überhaupt – ein onClick-Button ist für sie unsichtbar */}
            <h2>
              <a
                className="plain-link"
                href={tool.route}
                onClick={(event) => {
                  event.preventDefault();
                  open(tool.route);
                }}
              >
                {tool.title}
              </a>
            </h2>
            <p className="muted">{tool.text}</p>
            <ul className="tool-bullets">
              {tool.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
            <button className="primary glow with-icon" onClick={() => open(tool.route)}>
              {loggedIn ? t.landingOpen : t.loginButton}
              <ArrowRight size={17} strokeWidth={2.25} aria-hidden />
            </button>
          </section>
        ))}
      </div>

      {!loggedIn && CLIENT_ID && <p className="muted center-text">{t.landingLoginHint}</p>}

      <SeoContent page="landing" />
    </>
  );
}
