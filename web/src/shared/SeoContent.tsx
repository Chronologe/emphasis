import { LANG, t } from './i18n';
import { SEO, type PageKey } from './seo';

/**
 * Erklärender Fließtext und FAQ unterhalb des Werkzeugs.
 *
 * Zwei Zwecke in einem: Besucher, die über eine Suche kommen, bekommen ihre
 * Frage direkt beantwortet, und Suchmaschinen bekommen überhaupt erst Text,
 * den sie bewerten können – ohne ihn wäre jede Seite nur eine Handvoll Wörter.
 * Die Antworten stehen offen im Markup (nicht in <details>), damit sie sicher
 * indexiert werden.
 */
export default function SeoContent({ page }: { page: PageKey }) {
  const seo = SEO[LANG][page];

  return (
    <>
      {seo.sections.map((section) => (
        <section className="card seo-section rise" key={section.heading}>
          <h2>{section.heading}</h2>
          {section.body.map((paragraph) => (
            <p className="muted" key={paragraph}>
              {paragraph}
            </p>
          ))}
        </section>
      ))}

      <section className="card seo-section rise">
        <h2>{t.faqTitle}</h2>
        <div className="faq">
          {seo.faq.map((item) => (
            <div className="faq-item" key={item.question}>
              <h3>{item.question}</h3>
              <p className="muted">{item.answer}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
