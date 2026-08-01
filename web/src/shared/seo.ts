/**
 * Einzige Quelle für alles, was Suchmaschinen sehen: URLs je Sprache,
 * Titel/Beschreibung je Seite und die Textblöcke unterhalb der Werkzeuge.
 *
 * Wird von zwei Seiten benutzt:
 *  - von React (rendert Abschnitte und FAQ, setzt Titel/Description)
 *  - vom Prerender-Skript (scripts/prerender.ts) beim Build
 *
 * Deshalb muss dieses Modul frei von Browser-APIs bleiben – es wird auch in
 * Node importiert.
 */

export type Lang = 'de' | 'en';
export type PageKey = 'landing' | 'weeklyMix' | 'sharedPlaylist';

export const LANGS: Lang[] = ['de', 'en'];
export const PAGE_KEYS: PageKey[] = ['landing', 'weeklyMix', 'sharedPlaylist'];

export const SITE_URL = 'https://emphasize.me';
export const SITE_NAME = 'Emphasis';
export const REPO_URL = 'https://github.com/Chronologe/emphasis';

/**
 * Deutsch liegt in der Wurzel (Hauptsprache des Projekts), Englisch unter /en/.
 * Eine eigene URL je Sprache ist Pflicht: Google crawlt überwiegend mit
 * englischem Accept-Language – bei Sprachumschaltung auf einer einzigen URL
 * würde die deutsche Fassung nie in den Index gelangen.
 */
export const PATHS = {
  de: {
    landing: '/',
    weeklyMix: '/mix-der-woche',
    sharedPlaylist: '/gemeinsame-playlist',
  },
  en: {
    landing: '/en/',
    weeklyMix: '/en/weekly-mix',
    sharedPlaylist: '/en/shared-playlist',
  },
} as const;

export type Route = (typeof PATHS)[Lang][PageKey];

/** Frühere URLs der Ein-Sprach-Fassung – werden clientseitig weitergeleitet. */
export const LEGACY_PATHS: Record<string, PageKey> = {
  '/your-weekly-mix': 'weeklyMix',
  '/shared-playlist': 'sharedPlaylist',
};

export type FaqItem = { question: string; answer: string };

export type PageSeo = {
  /** <title>; bewusst unter ~60 Zeichen, damit Google ihn nicht abschneidet */
  title: string;
  /** meta description; ~150–160 Zeichen */
  description: string;
  /** Fließtext-Abschnitte unterhalb des Werkzeugs */
  sections: { heading: string; body: string[] }[];
  /** FAQ – beantwortet die Suchanfragen wörtlich und wird als FAQPage ausgezeichnet */
  faq: FaqItem[];
};

const de: Record<PageKey, PageSeo> = {
  landing: {
    title: 'Mix der Woche & gemeinsame Playlists für Tidal – Emphasis',
    description:
      'Zwei kostenlose Werkzeuge für Tidal: ein persönlicher Mix der Woche aus deiner Bibliothek und eine Playlist, die du gemeinsam mit Freunden pflegst.',
    sections: [
      {
        heading: 'Was Emphasis bei Tidal nachrüstet',
        body: [
          'Tidal hat exzellenten Klang, aber zwei Funktionen fehlen bis heute: einen wöchentlich neu zusammengestellten Mix der Woche im Stil von Spotifys „Discover Weekly“ und Playlists, die mehrere Leute gemeinsam bearbeiten können. Emphasis rüstet beides über die offizielle Tidal-Schnittstelle nach – kostenlos, quelloffen und ohne Tracking.',
          'Du meldest dich einmal mit deinem bestehenden Tidal-Konto an. Emphasis bekommt dabei ausschließlich das Recht, deine Favoriten und Playlists zu lesen und Playlists zu schreiben. Passwort, Zahlungsdaten und Abo-Details bleiben unerreichbar, und die fertigen Playlists liegen ganz normal in deinem Tidal-Konto – auch in der Tidal-App, im Auto und auf dem Fernseher.',
        ],
      },
    ],
    faq: [
      {
        question: 'Hat Tidal einen Mix der Woche wie Spotify?',
        answer:
          'Tidal bietet personalisierte „My Mixes“ und einen Daily Discovery, aber keinen festen wöchentlichen Mix mit nachvollziehbarer Auswahl. Emphasis erzeugt genau das: eine Playlist mit 20 Titeln, jede Woche neu, direkt in deinem Tidal-Konto.',
      },
      {
        question: 'Kann man bei Tidal eine gemeinsame Playlist erstellen?',
        answer:
          'Tidal kennt bislang keine kollaborativen Playlists – geteilte Playlists sind nur lesbar. Emphasis löst das, indem jede Person eine eigene Kopie behält und alle Kopien einmal täglich abgeglichen werden.',
      },
      {
        question: 'Ist Emphasis kostenlos?',
        answer:
          'Ja. Emphasis ist ein quelloffenes Community-Projekt, kostet nichts, zeigt keine Werbung und setzt keine Analyse- oder Tracking-Dienste ein. Du brauchst lediglich ein bestehendes Tidal-Abo.',
      },
      {
        question: 'Braucht Emphasis mein Tidal-Passwort?',
        answer:
          'Nein. Die Anmeldung läuft über den offiziellen OAuth-Login von Tidal. Dein Passwort gibst du ausschließlich bei Tidal ein; Emphasis erhält nur ein eng begrenztes Zugriffs-Token, das du jederzeit widerrufen kannst.',
      },
    ],
  },

  weeklyMix: {
    title: 'Tidal Mix der Woche automatisch erstellen – Emphasis',
    description:
      'Der Mix der Woche, den Tidal nicht hat: 20 Titel aus deinen Favoriten, Playlists und Empfehlungen – jede Woche neu, auf Wunsch vollautomatisch. Kostenlos.',
    sections: [
      {
        heading: 'Der Mix der Woche, den Tidal nicht hat',
        body: [
          'Wer von Spotify zu Tidal wechselt, vermisst meist als Erstes den Mix der Woche: eine Playlist, die montags von selbst gefüllt ist und Vertrautes mit Neuem mischt. Tidal liefert stattdessen „My Mixes“, die sich nach Genre sortieren und deren Zustandekommen niemand nachvollziehen kann. Emphasis baut dir stattdessen einen echten Wochen-Mix aus deiner eigenen Bibliothek.',
          'Die Playlist heißt „Dein Mix der Woche“, liegt in deinem Tidal-Konto und lässt sich überall abspielen, wo Tidal läuft. Beim nächsten Lauf wird sie aktualisiert statt vervielfacht – du sammelst also keine Karteileichen an.',
        ],
      },
      {
        heading: 'Wie der Mix zusammengestellt wird',
        body: [
          'Emphasis liest deine zuletzt gespeicherten Songs, deine Playlists und deine Lieblingsinterpreten und holt dazu passende Empfehlungen und ähnliche Titel von Tidal. Jeder Kandidat bekommt Punkte – für die Nähe zu deinem Hörprofil, für Genre-Übereinstimmung und für Abwechslung. Zwei harte Regeln sorgen für Vielfalt: höchstens zwei Titel pro Interpret, und Songs, die du ohnehin schon favorisiert hast, fallen heraus.',
          'Das Punktesystem ist offengelegt und im Quellcode nachlesbar – anders als bei den Empfehlungen der großen Anbieter siehst du genau, warum ein Titel im Mix gelandet ist. Bereits vorgeschlagene Titel merkt sich Emphasis und wiederholt sie nicht.',
        ],
      },
      {
        heading: 'Jede Woche automatisch',
        body: [
          'Auf Wunsch übernimmt der Emphasis-Server die wöchentliche Generierung, auch wenn du die Seite nie wieder öffnest. Dafür erteilst du einmalig eine gesonderte Berechtigung. Schaltest du die Automatik wieder ab, werden sämtliche Daten sofort und vollständig vom Server gelöscht.',
        ],
      },
    ],
    faq: [
      {
        question: 'Gibt es bei Tidal einen Mix der Woche?',
        answer:
          'Nicht als eigene Funktion. Tidal bietet „My Mixes“ und einen täglichen Discovery-Mix, aber keine feste Wochen-Playlist wie Spotifys Mix der Woche. Emphasis erzeugt eine solche Playlist aus deiner eigenen Tidal-Bibliothek.',
      },
      {
        question: 'Wie unterscheidet sich der Emphasis-Mix von Tidals „My Mix“?',
        answer:
          'Tidals My Mixes sind nach Genre gebündelt und ihre Auswahl ist nicht einsehbar. Der Emphasis-Mix nutzt ein offengelegtes Punktesystem, begrenzt jeden Interpreten auf zwei Titel, schließt bereits favorisierte Songs aus und wiederholt keinen zuvor vorgeschlagenen Titel.',
      },
      {
        question: 'Wie viele Titel hat der Mix der Woche?',
        answer:
          '20 Titel, ungefähr 15 von Interpreten, die du bereits kennst, und 5 von neuen. Findet Emphasis nicht genug Kandidaten, die alle Regeln erfüllen, wird der Mix kürzer statt schlechter.',
      },
      {
        question: 'Wiederholen sich Titel in späteren Wochen?',
        answer:
          'Nein. Emphasis merkt sich alle bisher vorgeschlagenen Track-IDs und schließt sie in künftigen Läufen aus.',
      },
      {
        question: 'Welche Rechte bekommt Emphasis auf mein Tidal-Konto?',
        answer:
          'Lesen von Favoriten, Playlists und Empfehlungen sowie Schreiben von Playlists. Kein Zugriff auf Passwort, Zahlungsdaten oder Abo-Einstellungen. Ohne aktivierte Automatik verlässt kein Datensatz deinen Browser.',
      },
      {
        question: 'Was kostet der Mix der Woche?',
        answer:
          'Nichts. Emphasis ist quelloffen und werbefrei; du brauchst nur ein bestehendes Tidal-Abo.',
      },
    ],
  },

  sharedPlaylist: {
    title: 'Tidal: gemeinsame Playlist mit Freunden – Emphasis',
    description:
      'Tidal kennt keine kollaborativen Playlists. Emphasis gleicht eure Playlist-Kopien täglich ab – mit Einladungslink und Rechten pro Person. Kostenlos.',
    sections: [
      {
        heading: 'Kann man bei Tidal eine Playlist gemeinsam bearbeiten?',
        body: [
          'Direkt in Tidal nicht. Du kannst eine Playlist zwar teilen, aber alle anderen sehen sie nur – hinzufügen oder entfernen darf ausschließlich die Person, der die Playlist gehört. Wer mit Freunden, der WG oder dem Team eine gemeinsame Playlist pflegen will, steht bei Tidal bislang vor verschlossener Tür.',
          'Emphasis löst das ohne Umweg über fremde Dienste: Jede Person legt eine eigene Kopie der Playlist in ihrem Tidal-Konto an. Emphasis vergleicht diese Kopien einmal täglich, übernimmt erlaubte Änderungen in alle Kopien und stellt so einen gemeinsamen Stand her. Für jede Person gilt dabei die Reihenfolge der Titel unverändert weiter.',
        ],
      },
      {
        heading: 'Einladen und Rechte vergeben',
        body: [
          'Wer die gemeinsame Playlist startet, wird Verwalter und bekommt einen Einladungslink. Den kannst du per Messenger verschicken, jederzeit neu erzeugen oder abschalten. Für jedes Mitglied legst du getrennt fest, ob es Titel hinzufügen, entfernen oder nur mitlesen darf – so bleibt eine Party-Playlist offen und eine kuratierte Liste geschützt.',
          'Der Abgleich läuft automatisch innerhalb von 24 Stunden; wer nicht warten will, stößt ihn mit einem Klick sofort an. Einzelne Mitglieder können ihren eigenen Abgleich pausieren, ohne die Gruppe zu verlassen.',
        ],
      },
      {
        heading: 'Deine Playlist bleibt deine Playlist',
        body: [
          'Weil jede Person eine echte Tidal-Playlist im eigenen Konto besitzt, funktioniert alles wie gewohnt: Offline-Download, Wiedergabe im Auto, auf dem Fernseher oder dem Lautsprecher. Verlässt jemand die Gruppe oder wird die Gruppe aufgelöst, bleibt die Kopie unangetastet im jeweiligen Konto – nur der Abgleich endet, und alle Gruppendaten werden vom Server gelöscht.',
        ],
      },
    ],
    faq: [
      {
        question: 'Gibt es bei Tidal kollaborative Playlists?',
        answer:
          'Nein. Geteilte Tidal-Playlists sind für alle anderen nur lesbar. Emphasis stellt eine gemeinsame Bearbeitung her, indem jede Person eine eigene Kopie führt und alle Kopien täglich abgeglichen werden.',
      },
      {
        question: 'Wie lade ich Freunde zu einer gemeinsamen Playlist ein?',
        answer:
          'Du startest die gemeinsame Playlist mit einer vorhandenen oder neuen Playlist und erhältst einen Einladungslink. Wer ihn öffnet, meldet sich mit dem eigenen Tidal-Konto an und bekommt automatisch eine Kopie der Playlist.',
      },
      {
        question: 'Wie oft werden die Playlists abgeglichen?',
        answer:
          'Automatisch einmal täglich, spätestens innerhalb von 24 Stunden. Zusätzlich kann jedes Mitglied den Abgleich jederzeit manuell auslösen.',
      },
      {
        question: 'Kann ich festlegen, wer Titel löschen darf?',
        answer:
          'Ja. Der Verwalter vergibt die Rechte „hinzufügen“ und „löschen“ getrennt für jedes Mitglied. Ohne beide Rechte liest jemand nur mit.',
      },
      {
        question: 'Was passiert, wenn jemand die Gruppe verlässt?',
        answer:
          'Die Playlist-Kopie bleibt vollständig im Tidal-Konto der Person erhalten, wird aber nicht mehr abgeglichen. Alle Daten dieser Person zur Gruppe werden sofort vom Emphasis-Server gelöscht.',
      },
      {
        question: 'Wie viele Personen können mitmachen?',
        answer:
          'Standardmäßig bis zu 50 Mitglieder pro gemeinsamer Playlist.',
      },
    ],
  },
};

const en: Record<PageKey, PageSeo> = {
  landing: {
    title: 'Weekly Mix & collaborative playlists for Tidal – Emphasis',
    description:
      'Two free tools for Tidal: a personal weekly mix built from your own library, and a playlist you can actually curate together with friends.',
    sections: [
      {
        heading: 'What Emphasis adds to Tidal',
        body: [
          'Tidal sounds superb, but two features are still missing: a weekly refreshed mix in the spirit of Spotify’s Discover Weekly, and playlists that several people can edit together. Emphasis adds both on top of the official Tidal API – free, open source and without any tracking.',
          'You sign in once with your existing Tidal account. Emphasis only ever receives permission to read your favorites and playlists and to write playlists. Your password, payment details and subscription settings stay out of reach, and the resulting playlists live in your normal Tidal account – in the Tidal app, in the car and on your TV.',
        ],
      },
    ],
    faq: [
      {
        question: 'Does Tidal have a weekly mix like Spotify?',
        answer:
          'Tidal offers personalized “My Mixes” and a daily discovery, but no fixed weekly playlist with a transparent selection. Emphasis creates exactly that: a 20-track playlist, refreshed every week, right inside your Tidal account.',
      },
      {
        question: 'Can you create a collaborative playlist on Tidal?',
        answer:
          'Tidal has no collaborative playlists – shared playlists are read-only for everyone else. Emphasis works around it: everyone keeps their own copy and all copies are reconciled once a day.',
      },
      {
        question: 'Is Emphasis free?',
        answer:
          'Yes. Emphasis is an open-source community project. It costs nothing, shows no ads and uses no analytics or tracking services. All you need is an existing Tidal subscription.',
      },
      {
        question: 'Does Emphasis need my Tidal password?',
        answer:
          'No. Sign-in goes through Tidal’s official OAuth login. You only ever type your password on Tidal’s own page; Emphasis receives a narrowly scoped access token that you can revoke at any time.',
      },
    ],
  },

  weeklyMix: {
    title: 'Tidal Weekly Mix – build it automatically – Emphasis',
    description:
      'The weekly mix Tidal is missing: 20 tracks from your favorites, playlists and recommendations – refreshed every week, optionally fully automatic. Free.',
    sections: [
      {
        heading: 'The weekly mix Tidal is missing',
        body: [
          'People moving from Spotify to Tidal usually miss one thing first: the weekly mix that is simply there on Monday morning, blending the familiar with something new. Tidal instead offers “My Mixes”, sorted by genre and entirely opaque about how they were assembled. Emphasis builds a real weekly mix from your own library instead.',
          'The playlist is called “Your Weekly Mix”, it lives in your Tidal account and plays anywhere Tidal runs. Each run updates it instead of creating another copy, so you never end up with a graveyard of old mixes.',
        ],
      },
      {
        heading: 'How the mix is assembled',
        body: [
          'Emphasis reads your recently saved songs, your playlists and your favorite artists, then pulls matching recommendations and similar tracks from Tidal. Every candidate is scored – for closeness to your listening profile, for genre match and for variety. Two hard rules keep it varied: at most two tracks per artist, and songs you have already favorited are dropped.',
          'The scoring system is documented and readable in the source code – unlike the recommendations of the big services, you can see exactly why a track made the cut. Tracks that have been suggested before are remembered and never repeated.',
        ],
      },
      {
        heading: 'Automatic, every week',
        body: [
          'If you want, the Emphasis server takes over the weekly run, even if you never open the page again. That requires a one-time additional permission. Turn the automation off again and every piece of your data is deleted from the server immediately and completely.',
        ],
      },
    ],
    faq: [
      {
        question: 'Does Tidal have a Discover Weekly playlist?',
        answer:
          'Not as a dedicated feature. Tidal has “My Mixes” and a daily discovery mix, but no fixed weekly playlist comparable to Spotify’s Discover Weekly. Emphasis generates one from your own Tidal library.',
      },
      {
        question: 'How is this different from Tidal’s “My Mix”?',
        answer:
          'Tidal’s My Mixes are grouped by genre and their selection is not visible to you. The Emphasis mix uses a documented scoring system, limits every artist to two tracks, excludes songs you already favorited, and never repeats a previously suggested track.',
      },
      {
        question: 'How many tracks does the weekly mix contain?',
        answer:
          '20 tracks – roughly 15 from artists you already know and 5 from new ones. If not enough candidates satisfy every rule, the mix gets shorter rather than worse.',
      },
      {
        question: 'Will tracks repeat in later weeks?',
        answer:
          'No. Emphasis remembers every track ID it has suggested so far and excludes them from future runs.',
      },
      {
        question: 'What permissions does Emphasis get on my Tidal account?',
        answer:
          'Reading favorites, playlists and recommendations, and writing playlists. No access to your password, payment details or subscription settings. Without the automation enabled, no data ever leaves your browser.',
      },
      {
        question: 'What does it cost?',
        answer:
          'Nothing. Emphasis is open source and ad-free; you only need an existing Tidal subscription.',
      },
    ],
  },

  sharedPlaylist: {
    title: 'Tidal collaborative playlist with friends – Emphasis',
    description:
      'Tidal has no collaborative playlists. Emphasis reconciles everyone’s playlist copies daily – with an invite link and per-person rights. Free and open source.',
    sections: [
      {
        heading: 'Can you edit a Tidal playlist together?',
        body: [
          'Not inside Tidal itself. You can share a playlist, but everyone else can only look at it – adding or removing tracks stays reserved for the owner. Anyone who wants to keep a playlist going with friends, flatmates or a team hits a wall on Tidal.',
          'Emphasis solves it without routing your music through a third-party service: every person keeps their own copy of the playlist in their own Tidal account. Once a day Emphasis compares those copies, applies the permitted changes to all of them and restores a shared state – while keeping each person’s track order intact.',
        ],
      },
      {
        heading: 'Invites and per-person rights',
        body: [
          'Whoever starts the shared playlist becomes its owner and gets an invite link. Send it by messenger, regenerate it at any time, or switch it off. For every member you decide separately whether they may add tracks, remove tracks or only follow along – so a party playlist can stay open while a curated list stays protected.',
          'Syncing happens automatically within 24 hours; if you do not want to wait, one click runs it right away. Individual members can pause their own sync without leaving the group.',
        ],
      },
      {
        heading: 'Your playlist stays yours',
        body: [
          'Because every person owns a real Tidal playlist in their own account, everything keeps working as usual: offline downloads, playback in the car, on the TV or on a speaker. If someone leaves the group, or the group is dissolved, their copy stays untouched in their account – only the syncing ends, and all group data is deleted from the server.',
        ],
      },
    ],
    faq: [
      {
        question: 'Does Tidal support collaborative playlists?',
        answer:
          'No. Shared Tidal playlists are read-only for everyone but the owner. Emphasis enables collaborative editing by giving every person their own copy and reconciling all copies daily.',
      },
      {
        question: 'How do I invite friends to a shared playlist?',
        answer:
          'You start the shared playlist from an existing or a new playlist and receive an invite link. Anyone who opens it signs in with their own Tidal account and automatically gets a copy of the playlist.',
      },
      {
        question: 'How often are the playlists synced?',
        answer:
          'Automatically once a day, at the latest within 24 hours. On top of that, every member can trigger a sync manually at any time.',
      },
      {
        question: 'Can I control who is allowed to delete tracks?',
        answer:
          'Yes. The owner grants the “add” and “remove” rights separately for each member. Without either right, a member simply follows along.',
      },
      {
        question: 'What happens when someone leaves the group?',
        answer:
          'Their playlist copy stays fully intact in their Tidal account but is no longer synced. All of that person’s group data is deleted from the Emphasis server immediately.',
      },
      {
        question: 'How many people can join?',
        answer: 'By default up to 50 members per shared playlist.',
      },
    ],
  },
};

export const SEO: Record<Lang, Record<PageKey, PageSeo>> = { de, en };

/** Absolute, kanonische URL einer Seite. */
export function canonicalUrl(lang: Lang, page: PageKey): string {
  return SITE_URL + PATHS[lang][page];
}

/** Ordnet einen Pfad der Seite zu, zu der er gehört (Sprache ist egal). */
export function pageOfPath(pathname: string): PageKey | undefined {
  const path = normalizePath(pathname);
  for (const lang of LANGS) {
    for (const key of PAGE_KEYS) {
      if (normalizePath(PATHS[lang][key]) === path) return key;
    }
  }
  return LEGACY_PATHS[path];
}

/** Vergleichsform eines Pfades: klein geschrieben, ohne Schrägstrich am Ende. */
export function normalizePath(pathname: string): string {
  return pathname.toLowerCase().replace(/\/+$/, '') || '/';
}

/**
 * schema.org-Auszeichnung: die App selbst als WebApplication und die FAQ als
 * FAQPage. Beides kann in der Google-Suche als erweitertes Ergebnis erscheinen
 * und beantwortet die Suchanfrage schon im Ergebnis-Schnipsel.
 */
export function structuredData(lang: Lang, page: PageKey): unknown[] {
  const seo = SEO[lang][page];
  const url = canonicalUrl(lang, page);

  const application = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: page === 'landing' ? SITE_NAME : `${SITE_NAME} – ${seo.title.split(' – ')[0]}`,
    url,
    applicationCategory: 'MultimediaApplication',
    operatingSystem: 'Web',
    inLanguage: lang,
    description: seo.description,
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    author: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
  };

  const faq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: lang,
    mainEntity: seo.faq.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };

  return [application, faq];
}
