import { Languages } from 'lucide-react';
import { LANG, rememberLanguage, t } from './i18n';
import { routeInLanguage, type Route } from './router';

/**
 * Wechselt zwischen deutscher und englischer Fassung. Bewusst ein echter Link
 * mit vollständigem Seitenwechsel: die Sprache hängt an der URL, und der Link
 * ist zugleich der Weg, auf dem Suchmaschinen die andere Fassung finden.
 */
export default function LanguageSwitch({ route }: { route: Route }) {
  const other = LANG === 'de' ? 'en' : 'de';
  const target = routeInLanguage(route, other);

  return (
    <a
      className="button-like with-icon lang-switch"
      href={target}
      hrefLang={other}
      title={t.langSwitchTitle}
      aria-label={t.langSwitchTitle}
      onClick={() => rememberLanguage(other)}
    >
      <Languages size={16} strokeWidth={2} aria-hidden />
      <span>{t.langSwitchLabel}</span>
    </a>
  );
}
