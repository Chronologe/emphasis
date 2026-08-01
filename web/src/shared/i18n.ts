/**
 * Minimale Lokalisierung ohne Abhängigkeiten.
 *
 * Die Sprache hängt an der URL, nicht an der Browsersprache: Deutsch in der
 * Wurzel, Englisch unter /en/. Das ist eine SEO-Notwendigkeit – Google crawlt
 * überwiegend mit englischem Accept-Language, bei Umschaltung auf einer
 * einzigen URL käme die deutsche Fassung nie in den Index. Die Browsersprache
 * entscheidet nur noch auf den alten URLs ohne Sprachpräfix.
 */
import { LEGACY_PATHS, normalizePath, type Lang } from './seo';

const LANG_KEY = 'emp-lang';

/** Ausdrücklich gewählte Sprache (Umschalter im Kopf der Seite). */
export function storedLanguage(): Lang | undefined {
  try {
    const value = localStorage.getItem(LANG_KEY);
    return value === 'de' || value === 'en' ? value : undefined;
  } catch {
    return undefined;
  }
}

export function rememberLanguage(lang: Lang): void {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    /* Speicher gesperrt – dann gilt weiter die URL */
  }
}

export function browserLanguage(): Lang {
  const primary = (
    typeof navigator !== 'undefined'
      ? (navigator.languages?.[0] ?? navigator.language ?? 'en')
      : 'en'
  ).toLowerCase();
  return primary.startsWith('de') ? 'de' : 'en';
}

// Node-sicher (das Modul wird auch vom Auto-Generierungs-Server importiert)
function detectLanguage(): Lang {
  if (typeof window === 'undefined') return 'en';
  const path = normalizePath(window.location.pathname);
  if (path === '/en' || path.startsWith('/en/')) return 'en';
  if (path in LEGACY_PATHS) return storedLanguage() ?? browserLanguage();
  return 'de';
}

export const LANG: Lang = detectLanguage();
export const IS_GERMAN = LANG === 'de';
export const LOCALE = IS_GERMAN ? 'de-DE' : 'en-US';

export function formatDate(date?: Date): string {
  return date ? date.toLocaleDateString(LOCALE) : '';
}

const de = {
  brandSub: 'Inoffizielle Tidal-Erweiterung · Open Source',
  heroTitlePrefix: 'Dein',
  heroTitleAccent: 'Mix der Woche',
  heroTitleSuffix: ' für Tidal',
  heroSubtitle: '20 Titel aus deinem Tidal-Hörprofil – jede Woche frisch zusammengestellt.',

  setupTitle: 'Einrichtung nötig',
  setupBefore: 'Es fehlt die Tidal Client-ID. Registriere eine App im',
  setupDashboard: 'Tidal Developer Dashboard',
  setupRedirect: '(Redirect-URI:',
  setupEnterId: ') und trage die Client-ID in',
  setupInto: 'ein:',
  setupRestart: 'Danach den Dev-Server neu starten.',

  connectPrompt: 'Verbinde dein Tidal-Konto, um loszulegen.',
  loginButton: 'Mit Tidal anmelden',
  logoutButton: 'Abmelden',

  profileTitle: 'Dein Hörprofil',
  inputSummary: (recent: number, artists: number, playlists: number, favorites: number) =>
    `Basierend auf deinen letzten ${recent} gespeicherten Songs aus ${playlists} Playlists und ${favorites} Favoriten (${artists} Interpreten).`,
  scoreResult: (total: number, artists: number) =>
    `Gesamtscore: ${total} Punkte · ${artists} unterschiedliche Interpreten`,
  bonusDistinct: '+500 Vielfalt-Bonus (≥ 10 Interpreten)',
  bonusComposition: '+100 Mix-Bonus (15 vertraute + 5 neue Interpreten)',
  noGenres:
    'Tidal liefert für deine Songs keine Genre-Daten – der Mix basiert dann auf Ähnlichkeits-Empfehlungen zu deinen Songs.',
  generateButton: 'Mix der Woche generieren',

  statusLoadingProfile: 'Lade dein Hörprofil …',
  statusFavorites: 'Lade Favoriten …',
  statusArtists: 'Lade Lieblingskünstler …',
  statusMixes: 'Lade deine Tidal-Mixe …',
  statusPlaylists: 'Lade deine Playlists …',
  statusGenres: 'Ermittle Genres …',
  statusRecommendations: (round: number, seed: number, total: number) =>
    `Sammle Empfehlungen (Runde ${round}, Seed ${seed}/${total}) …`,
  statusCandidates: (loaded: number, total: number) =>
    `Lade Details zu Kandidaten (${loaded}/${total}) …`,
  statusCandidateCount: (count: number) => `Lade Details zu ${count} Kandidaten …`,
  statusSimilarArtists: 'Suche ähnliche Interpreten …',
  statusArtistTop: (current: number, total: number) =>
    `Lade Top-Songs der Interpreten (${current}/${total}) …`,
  statusSimilarTracks: (current: number, total: number) =>
    `Suche ähnliche Songs (${current}/${total}) …`,
  statusScoring: 'Berechne Scores & optimiere Auswahl …',
  statusSaving: 'Speichere Playlist …',

  mixTitle: (count: number) => `Dein Mix (${count} Tracks)`,
  regenerateButton: 'Neu generieren',
  saveButton: 'Als Playlist speichern',
  savedAs: (name: string) => `Gespeichert als „${name}“ –`,
  openInTidal: 'in Tidal öffnen',
  familiarTag: 'vertraut',

  coverSet: 'Das Titelbild wurde gesetzt.',
  coverNoFile: 'Kein Titelbild gefunden – lege das Bild als public/cover.png ab.',
  coverNotAllowed:
    'Tidal erlaubt Drittanbieter-Apps das Hochladen von Titelbildern leider nicht – die Playlist wurde ohne Cover gespeichert.',
  coverFailed: 'Titelbild konnte nicht gesetzt werden – die Playlist wurde ohne Cover gespeichert.',

  warningFewTracks: (found: number, target: number) =>
    `Es konnten nur ${found} von ${target} Tracks gefunden werden, die alle Kriterien erfüllen. Favorisiere mehr Songs in Tidal oder generiere später erneut.`,
  errorNoFavorites:
    'Deine Tidal-Sammlung enthält keine favorisierten Tracks. Füge erst einige Lieblingssongs zu "Meine Sammlung" hinzu.',
  errorPlaylistCreate: 'Playlist konnte nicht erstellt werden (keine ID in der Antwort).',
  errorNotLoggedIn: 'Nicht eingeloggt',

  playlistName: 'Dein Mix der Woche',

  autogenTitle: 'Automatischer Wochen-Mix',
  autogenIntro:
    'Lass deinen Mix jede Woche automatisch vom Emphasis-Server generieren – auch wenn du die Seite nicht öffnest. Dafür meldest du dich einmal erneut bei Tidal an, damit der Server die Berechtigung erhält.',
  autogenEnable: 'Wöchentliche Auto-Generierung aktivieren',
  autogenActive: 'Aktiv – dein Mix wird jede Woche automatisch aktualisiert.',
  autogenLastRun: (date: string) => `Zuletzt generiert: ${date}.`,
  autogenJustEnabled: 'Automatische wöchentliche Generierung ist jetzt aktiv!',
  autogenDisable: 'Deaktivieren & Daten löschen',
  autogenDisabled:
    'Automatische Generierung wurde deaktiviert. Alle deine Daten wurden vollständig vom Server gelöscht.',
  autogenError: 'Auto-Generierung konnte nicht aktiviert werden. Bitte versuche es erneut.',
  autogenFull:
    'Alle Plätze für die automatische Generierung sind derzeit belegt. Bitte versuche es später erneut.',

  // ---------- Startseite & Navigation ----------
  navAllTools: 'Alle Tools',
  // H1 der Startseite trägt die Suchbegriffe; der Marken-Slogan rutscht in die Zeile darunter
  landingTitlePrefix: 'Mix der Woche und gemeinsame Playlists für',
  landingTitleAccent: 'Tidal',
  landingTitleSuffix: '',
  landingSubtitle:
    'Emphasize your music experience – zwei kostenlose Werkzeuge für dein Tidal-Konto.',
  landingOpen: 'Öffnen',
  landingLoginHint:
    'Beim ersten Klick verbindest du einmalig dein Tidal-Konto – danach landest du direkt im gewählten Tool.',
  toolWeeklyMixTitle: 'Dein Mix der Woche',
  toolWeeklyMixText:
    'Ein persönlicher Wochen-Mix aus 20 Titeln, punktebasiert aus deinen Favoriten und Playlists zusammengestellt.',
  toolWeeklyMixBullets: [
    'Transparentes Punktesystem statt Blackbox',
    'Wiederholt nie zuvor vorgeschlagene Titel',
    'Optional jede Woche automatisch',
  ],
  toolSharedTitle: 'Gemeinsame Playlist',
  toolSharedText:
    'Eine Playlist mit Freunden teilen: jede und jeder hat eine eigene Kopie, die täglich abgeglichen wird.',
  toolSharedBullets: [
    'Einladungslink zum Beitreten',
    'Rechte pro Person: hinzufügen, löschen',
    'Täglicher Abgleich oder manuell',
  ],

  privacyLink: 'Datenschutz',
  privacyTitle: 'Datenschutz',
  privacyBody: [
    'Ohne aktivierte Auto-Generierung und ohne gemeinsame Playlist speichert Emphasis alle Daten (Anmelde-Tokens, Playlist-Verlauf, Wochen-Sperre) ausschließlich lokal in deinem Browser. Der Emphasis-Server speichert dann nichts; alle Anfragen gehen direkt von deinem Browser an die Tidal-API.',
    'Aktivierst du die automatische wöchentliche Generierung, speichert der Emphasis-Server folgende Daten: deine Tidal-Nutzer-ID, ein OAuth-Zugriffstoken (beschränkt auf Favoriten/Playlists lesen und Playlists schreiben – kein Zugriff auf Passwort oder Zahlungsdaten), die ID deiner Mix-Playlist, deine Spracheinstellung, die Track-IDs früherer Mixe (für den Nicht-wiederholen-Filter) und den Zeitpunkt des letzten Laufs. Zweck ist ausschließlich die wöchentliche Generierung deiner Playlist.',
    'Nutzt du die gemeinsame Playlist, speichert der Server zusätzlich: die Zugehörigkeit zur Gruppe, die ID deiner Playlist-Kopie, deine Rechte (hinzufügen/löschen), den letzten abgeglichenen Titel-Stand und ebenfalls ein OAuth-Zugriffstoken – ausschließlich, um die Playlists der Gruppe täglich abzugleichen. Die Mitglieder einer Gruppe sehen deinen Anzeigenamen und dein Beitrittsdatum.',
    'Es werden keine Daten an Dritte weitergegeben und keine Analyse- oder Tracking-Dienste eingesetzt. Dein Hörprofil wird bei jedem Lauf frisch von der Tidal-API geladen und nicht dauerhaft gespeichert.',
    'Beim Klick auf „Deaktivieren & Daten löschen" bzw. „Verlassen & Daten löschen" werden sämtliche deiner Daten sofort und vollständig vom Server gelöscht. Deine Playlist-Kopie bleibt dabei unangetastet in deinem Tidal-Konto.',
    'Die Datenverarbeitung durch TIDAL selbst unterliegt der Datenschutzerklärung der TIDAL Music AS. Betreiber-Kontakt: github.com/Chronologe.',
  ],
  privacyClose: 'Zurück',
  analyticsStatusOn: 'Anonyme Messung: aktiv',
  analyticsStatusOff: 'Anonyme Messung: deaktiviert',
  analyticsTurnOff: 'deaktivieren',
  analyticsTurnOn: 'aktivieren',
  analyticsBrowserNote: 'durch deine Browsereinstellung (Do Not Track)',

  // ---------- Gemeinsame Playlist ----------
  sharedHeroPrefix: 'Eine Tidal-Playlist,',
  sharedHeroAccent: 'gemeinsam gepflegt',
  sharedHeroSuffix: '',
  sharedHeroSubtitle:
    'Teile eine Playlist mit Freunden. Jede Person hat eine eigene Kopie – einmal am Tag werden alle abgeglichen.',
  sharedConnectPrompt: 'Verbinde dein Tidal-Konto, um eine Playlist zu teilen.',

  sharedCreateTitle: 'Gemeinsame Playlist starten',
  sharedCreateIntro:
    'Wähle eine vorhandene Playlist oder lege eine neue an. Du wirst Verwalter: du steuerst Mitglieder, Rechte und den Abgleich.',
  sharedUseExisting: 'Vorhandene Playlist teilen',
  sharedCreateNew: 'Neue Playlist anlegen',
  sharedSelectPlaceholder: 'Playlist auswählen …',
  sharedNewNamePlaceholder: 'Name der neuen Playlist',
  sharedCreateButton: 'Gemeinsame Playlist erstellen',
  sharedNoPlaylists: 'In deinem Konto wurden keine eigenen Playlists gefunden.',

  sharedJoinTitle: 'Gemeinsamer Playlist beitreten',
  sharedJoinIntro: (name: string) =>
    `Du wurdest zu „${name}" eingeladen. Beim Beitreten wird eine Kopie in deinem Tidal-Konto angelegt und täglich mit der Gruppe abgeglichen. Dafür erteilst du dem Emphasis-Server einmalig die Berechtigung, deine Playlists zu lesen und zu schreiben.`,
  sharedJoinButton: 'Beitreten',
  sharedJoinInvalid: 'Dieser Einladungslink ist ungültig oder wurde deaktiviert.',
  sharedJoinedNotice: 'Du bist der gemeinsamen Playlist beigetreten!',

  sharedOverviewTitle: 'Gemeinsame Playlist',
  sharedRoleMaster: 'Du verwaltest diese Playlist',
  sharedRoleMember: 'Du bist Mitglied',
  sharedMasterLabel: (name: string) => `Verwaltet von ${name}`,
  sharedTrackCount: (count: number) => `${count} Titel im gemeinsamen Stand`,
  sharedTrackShort: (count: number) => `${count} Titel`,
  sharedLastSync: (date: string) => `Letzter Abgleich: ${date}`,
  sharedNeverSynced: 'Noch nicht abgeglichen',
  sharedNextSync: 'Der nächste Abgleich läuft automatisch innerhalb von 24 Stunden.',
  sharedOpenInTidal: 'Playlist in Tidal öffnen',

  sharedInviteTitle: 'Einladungslink',
  sharedInviteCopy: 'Link kopieren',
  sharedInviteCopied: 'Link kopiert!',
  sharedInviteRegenerate: 'Neuen Link erzeugen',
  sharedInviteDisable: 'Link deaktivieren',
  sharedInviteEnable: 'Link aktivieren',
  sharedInviteDisabled: 'Der Einladungslink ist derzeit deaktiviert.',

  sharedMembersTitle: (count: number) => `Mitglieder (${count})`,
  sharedMemberSince: (date: string) => `dabei seit ${date}`,
  sharedMemberYou: 'du',
  sharedPermAdd: 'darf hinzufügen',
  sharedPermRemove: 'darf löschen',
  sharedMemberRemove: 'Entfernen',
  sharedMemberRemoveConfirm: (name: string) =>
    `${name} aus der gemeinsamen Playlist entfernen? Die bereits vorhandene Kopie bleibt im Konto der Person, wird aber nicht mehr abgeglichen.`,
  sharedYourRights: 'Deine Rechte:',
  sharedRightsBoth: 'Titel hinzufügen und löschen',
  sharedRightsAddOnly: 'nur Titel hinzufügen',
  sharedRightsRemoveOnly: 'nur Titel löschen',
  sharedRightsNone: 'nur mitlesen',

  sharedSyncNow: 'Jetzt abgleichen',
  sharedSyncing: 'Playlists werden abgeglichen …',
  sharedSyncDone: (changed: number) =>
    changed === 0
      ? 'Abgleich fertig – es gab keine Änderungen.'
      : `Abgleich fertig – ${changed} Änderungen übernommen.`,
  sharedSyncPause: 'Abgleich pausieren',
  sharedSyncResume: 'Abgleich fortsetzen',
  sharedSyncPaused: 'Dein Abgleich ist pausiert – deine Kopie wird nicht verändert.',
  sharedSyncPausedGroup: 'Der Verwalter hat den Abgleich für die Gruppe pausiert.',

  sharedLeave: 'Verlassen & Daten löschen',
  sharedLeaveConfirm:
    'Wirklich verlassen? Alle deine Daten zu dieser Gruppe werden vom Server gelöscht. Deine Playlist-Kopie bleibt in deinem Tidal-Konto.',
  sharedDissolve: 'Gemeinsame Playlist auflösen',
  sharedDissolveConfirm:
    'Gruppe wirklich auflösen? Der Abgleich endet für alle Mitglieder und alle Gruppendaten werden vom Server gelöscht. Die Playlist-Kopien bleiben in den jeweiligen Konten.',
  sharedLeftNotice: 'Du hast die gemeinsame Playlist verlassen. Alle Daten wurden gelöscht.',
  sharedError: 'Die Aktion ist fehlgeschlagen. Bitte versuche es erneut.',
  sharedUnavailable:
    'Die gemeinsame Playlist braucht den Emphasis-Server, der gerade nicht erreichbar ist.',

  faqTitle: 'Häufige Fragen',

  // Umschalter zeigt immer die jeweils andere Sprache an
  langSwitchLabel: 'EN',
  langSwitchTitle: 'Switch to English',
  // Hinweisleiste richtet sich an Anderssprachige, steht daher in deren Sprache
  langOfferText: 'This page is also available in English.',
  langOfferAction: 'Switch to English',
  langOfferDismiss: 'Dismiss',

  // ---------- Fußzeile & Kontakt ----------
  footerRepo: 'Quellcode auf GitHub',
  footerContact: 'Anfrage, Fehler oder Vorschlag senden',
  contactTitle: 'Schreib mir',
  contactIntro:
    'Frage, Fehler oder Idee? Schreib es hier hinein – die Nachricht geht direkt an mich.',
  contactKindQuestion: 'Anfrage',
  contactKindBug: 'Fehler',
  contactKindSuggestion: 'Vorschlag',
  contactMessagePlaceholder: 'Worum geht es? (mindestens 10 Zeichen)',
  contactReplyPlaceholder: 'Deine E-Mail für eine Antwort (optional)',
  contactSend: 'Absenden',
  contactSending: 'Wird gesendet …',
  contactSent: 'Danke! Deine Nachricht ist angekommen.',
  contactError: 'Das Senden hat nicht geklappt. Bitte versuche es später noch einmal.',
  contactClose: 'Schließen',
  contactPrivacyNote:
    'Es wird nur übertragen, was du hier eingibst. Ohne E-Mail-Adresse kann ich nicht antworten.',

  footer:
    'Emphasis ist ein unabhängiges, quelloffenes Community-Projekt und steht in keiner Verbindung zu TIDAL. TIDAL ist eine Marke der TIDAL Music AS.',
};

const en: typeof de = {
  brandSub: 'An unofficial Tidal extension · open source',
  heroTitlePrefix: 'Your',
  heroTitleAccent: 'Weekly Mix',
  heroTitleSuffix: ' for Tidal',
  heroSubtitle: '20 tracks from your Tidal listening profile – freshly generated every week.',

  setupTitle: 'Setup required',
  setupBefore: 'The Tidal client ID is missing. Register an app in the',
  setupDashboard: 'Tidal Developer Dashboard',
  setupRedirect: '(redirect URI:',
  setupEnterId: ') and put the client ID into',
  setupInto: ':',
  setupRestart: 'Then restart the dev server.',

  connectPrompt: 'Connect your Tidal account to get started.',
  loginButton: 'Sign in with Tidal',
  logoutButton: 'Sign out',

  profileTitle: 'Your listening profile',
  inputSummary: (recent, artists, playlists, favorites) =>
    `Based on your last ${recent} saved songs from ${playlists} playlists and ${favorites} favorites (${artists} artists).`,
  scoreResult: (total, artists) => `Total score: ${total} points · ${artists} distinct artists`,
  bonusDistinct: '+500 diversity bonus (≥ 10 artists)',
  bonusComposition: '+100 mix bonus (15 familiar + 5 new artists)',
  noGenres:
    'Tidal provides no genre data for your songs – the mix will be based on similarity recommendations instead.',
  generateButton: 'Generate weekly mix',

  statusLoadingProfile: 'Loading your listening profile …',
  statusFavorites: 'Loading favorites …',
  statusArtists: 'Loading favorite artists …',
  statusMixes: 'Loading your Tidal mixes …',
  statusPlaylists: 'Loading your playlists …',
  statusGenres: 'Determining genres …',
  statusRecommendations: (round, seed, total) =>
    `Collecting recommendations (round ${round}, seed ${seed}/${total}) …`,
  statusCandidates: (loaded, total) => `Loading candidate details (${loaded}/${total}) …`,
  statusCandidateCount: (count) => `Loading details for ${count} candidates …`,
  statusSimilarArtists: 'Finding similar artists …',
  statusArtistTop: (current, total) => `Loading artists' top songs (${current}/${total}) …`,
  statusSimilarTracks: (current, total) => `Finding similar songs (${current}/${total}) …`,
  statusScoring: 'Calculating scores & optimizing selection …',
  statusSaving: 'Saving playlist …',

  mixTitle: (count) => `Your mix (${count} tracks)`,
  regenerateButton: 'Regenerate',
  saveButton: 'Save as playlist',
  savedAs: (name) => `Saved as “${name}” –`,
  openInTidal: 'open in Tidal',
  familiarTag: 'familiar',

  coverSet: 'The cover image has been set.',
  coverNoFile: 'No cover image found – place it as public/cover.png.',
  coverNotAllowed:
    'Unfortunately Tidal does not allow third-party apps to upload cover images – the playlist was saved without a cover.',
  coverFailed: 'The cover image could not be set – the playlist was saved without a cover.',

  warningFewTracks: (found, target) =>
    `Only ${found} of ${target} tracks matching all criteria could be found. Favorite more songs on Tidal or try again later.`,
  errorNoFavorites:
    'Your Tidal collection has no favorite tracks yet. Add some favorite songs to "My Collection" first.',
  errorPlaylistCreate: 'The playlist could not be created (no ID in the response).',
  errorNotLoggedIn: 'Not signed in',

  playlistName: 'Your Weekly Mix',

  autogenTitle: 'Automatic weekly mix',
  autogenIntro:
    'Let the Emphasis server generate your mix automatically every week – even when you never open this page. You sign in with Tidal once more so the server gets its own permission.',
  autogenEnable: 'Enable weekly auto-generation',
  autogenActive: 'Active – your mix is updated automatically every week.',
  autogenLastRun: (date) => `Last generated: ${date}.`,
  autogenJustEnabled: 'Automatic weekly generation is now active!',
  autogenDisable: 'Disable & delete data',
  autogenDisabled:
    'Automatic generation has been disabled. All of your data has been completely deleted from the server.',
  autogenError: 'Auto-generation could not be enabled. Please try again.',
  autogenFull: 'All slots for automatic generation are currently taken. Please try again later.',

  // ---------- Landing & navigation ----------
  navAllTools: 'All tools',
  landingTitlePrefix: 'Weekly Mix and collaborative playlists for',
  landingTitleAccent: 'Tidal',
  landingTitleSuffix: '',
  landingSubtitle:
    'Emphasize your music experience – two free tools for your Tidal account.',
  landingOpen: 'Open',
  landingLoginHint:
    'On the first click you connect your Tidal account once – after that you land straight in the tool you picked.',
  toolWeeklyMixTitle: 'Your Weekly Mix',
  toolWeeklyMixText:
    'A personal 20-track weekly mix, assembled from your favorites and playlists with a transparent scoring algorithm.',
  toolWeeklyMixBullets: [
    'Transparent scoring instead of a black box',
    'Never repeats previously suggested tracks',
    'Optionally automatic every week',
  ],
  toolSharedTitle: 'Shared Playlist',
  toolSharedText:
    'Share a playlist with friends: everyone keeps their own copy, and all copies are reconciled daily.',
  toolSharedBullets: [
    'Invite link to join',
    'Per-person rights: add, remove',
    'Daily sync or on demand',
  ],

  privacyLink: 'Privacy',
  privacyTitle: 'Privacy',
  privacyBody: [
    'Without auto-generation and without a shared playlist, Emphasis stores all data (auth tokens, playlist history, weekly lock) exclusively in your browser. The Emphasis server stores nothing; all requests go directly from your browser to the Tidal API.',
    'If you enable automatic weekly generation, the Emphasis server stores the following: your Tidal user ID, an OAuth token (limited to reading favorites/playlists and writing playlists – no access to your password or payment data), the ID of your mix playlist, your language setting, the track IDs of previous mixes (for the no-repeat filter) and the time of the last run. The sole purpose is generating your weekly playlist.',
    'If you use a shared playlist, the server additionally stores: your group membership, the ID of your playlist copy, your rights (add/remove), the last reconciled track state and likewise an OAuth token – solely to reconcile the group’s playlists once a day. Other members of a group can see your display name and join date.',
    'No data is shared with third parties, and no analytics or tracking services are used. Your listening profile is fetched freshly from the Tidal API on every run and never stored permanently.',
    'Clicking “Disable & delete data” or “Leave & delete data” immediately and completely deletes all of your data from the server. Your playlist copy stays untouched in your Tidal account.',
    'Data processing by TIDAL itself is subject to the privacy policy of TIDAL Music AS. Operator contact: github.com/Chronologe.',
  ],
  privacyClose: 'Back',
  analyticsStatusOn: 'Anonymous analytics: on',
  analyticsStatusOff: 'Anonymous analytics: off',
  analyticsTurnOff: 'turn off',
  analyticsTurnOn: 'turn on',
  analyticsBrowserNote: 'by your browser setting (Do Not Track)',

  // ---------- Shared playlist ----------
  sharedHeroPrefix: 'One Tidal playlist,',
  sharedHeroAccent: 'curated together',
  sharedHeroSuffix: '',
  sharedHeroSubtitle:
    'Share a playlist with friends. Everyone keeps their own copy – once a day all copies are reconciled.',
  sharedConnectPrompt: 'Connect your Tidal account to share a playlist.',

  sharedCreateTitle: 'Start a shared playlist',
  sharedCreateIntro:
    'Pick an existing playlist or create a new one. You become the owner: you manage members, rights and syncing.',
  sharedUseExisting: 'Share an existing playlist',
  sharedCreateNew: 'Create a new playlist',
  sharedSelectPlaceholder: 'Select a playlist …',
  sharedNewNamePlaceholder: 'Name of the new playlist',
  sharedCreateButton: 'Create shared playlist',
  sharedNoPlaylists: 'No playlists of your own were found in your account.',

  sharedJoinTitle: 'Join a shared playlist',
  sharedJoinIntro: (name) =>
    `You have been invited to “${name}”. Joining creates a copy in your Tidal account that is reconciled with the group daily. For that you grant the Emphasis server one-time permission to read and write your playlists.`,
  sharedJoinButton: 'Join',
  sharedJoinInvalid: 'This invite link is invalid or has been disabled.',
  sharedJoinedNotice: 'You joined the shared playlist!',

  sharedOverviewTitle: 'Shared playlist',
  sharedRoleMaster: 'You manage this playlist',
  sharedRoleMember: 'You are a member',
  sharedMasterLabel: (name) => `Managed by ${name}`,
  sharedTrackCount: (count) => `${count} tracks in the shared state`,
  sharedTrackShort: (count) => `${count} tracks`,
  sharedLastSync: (date) => `Last sync: ${date}`,
  sharedNeverSynced: 'Not synced yet',
  sharedNextSync: 'The next sync runs automatically within 24 hours.',
  sharedOpenInTidal: 'Open playlist in Tidal',

  sharedInviteTitle: 'Invite link',
  sharedInviteCopy: 'Copy link',
  sharedInviteCopied: 'Link copied!',
  sharedInviteRegenerate: 'Generate new link',
  sharedInviteDisable: 'Disable link',
  sharedInviteEnable: 'Enable link',
  sharedInviteDisabled: 'The invite link is currently disabled.',

  sharedMembersTitle: (count) => `Members (${count})`,
  sharedMemberSince: (date) => `joined ${date}`,
  sharedMemberYou: 'you',
  sharedPermAdd: 'may add',
  sharedPermRemove: 'may remove',
  sharedMemberRemove: 'Remove',
  sharedMemberRemoveConfirm: (name) =>
    `Remove ${name} from the shared playlist? Their existing copy stays in their account but is no longer synced.`,
  sharedYourRights: 'Your rights:',
  sharedRightsBoth: 'add and remove tracks',
  sharedRightsAddOnly: 'add tracks only',
  sharedRightsRemoveOnly: 'remove tracks only',
  sharedRightsNone: 'read only',

  sharedSyncNow: 'Sync now',
  sharedSyncing: 'Reconciling playlists …',
  sharedSyncDone: (changed) =>
    changed === 0
      ? 'Sync finished – there were no changes.'
      : `Sync finished – ${changed} changes applied.`,
  sharedSyncPause: 'Pause sync',
  sharedSyncResume: 'Resume sync',
  sharedSyncPaused: 'Your sync is paused – your copy will not be changed.',
  sharedSyncPausedGroup: 'The owner paused syncing for the whole group.',

  sharedLeave: 'Leave & delete data',
  sharedLeaveConfirm:
    'Really leave? All of your data for this group will be deleted from the server. Your playlist copy stays in your Tidal account.',
  sharedDissolve: 'Dissolve shared playlist',
  sharedDissolveConfirm:
    'Really dissolve the group? Syncing ends for all members and all group data is deleted from the server. The playlist copies stay in the respective accounts.',
  sharedLeftNotice: 'You left the shared playlist. All data has been deleted.',
  sharedError: 'The action failed. Please try again.',
  sharedUnavailable:
    'The shared playlist needs the Emphasis server, which is currently unreachable.',

  faqTitle: 'Frequently asked questions',

  langSwitchLabel: 'DE',
  langSwitchTitle: 'Auf Deutsch wechseln',
  langOfferText: 'Diese Seite gibt es auch auf Deutsch.',
  langOfferAction: 'Auf Deutsch wechseln',
  langOfferDismiss: 'Ausblenden',

  // ---------- Footer & contact ----------
  footerRepo: 'Source code on GitHub',
  footerContact: 'Send a question, bug report or suggestion',
  contactTitle: 'Get in touch',
  contactIntro: 'Question, bug or idea? Write it here – the message goes straight to me.',
  contactKindQuestion: 'Question',
  contactKindBug: 'Bug',
  contactKindSuggestion: 'Suggestion',
  contactMessagePlaceholder: 'What is it about? (at least 10 characters)',
  contactReplyPlaceholder: 'Your email for a reply (optional)',
  contactSend: 'Send',
  contactSending: 'Sending …',
  contactSent: 'Thank you! Your message has arrived.',
  contactError: 'Sending failed. Please try again later.',
  contactClose: 'Close',
  contactPrivacyNote:
    'Only what you type here is transmitted. Without an email address I cannot reply.',

  footer:
    'Emphasis is an independent, open-source community project and is not affiliated with TIDAL. TIDAL is a trademark of TIDAL Music AS.',
};

/** Beide Sprachfassungen – das Prerender-Skript braucht sie gleichzeitig. */
export const STRINGS = { de, en } as const;

export const t = STRINGS[LANG];

/** Beide Namensvarianten der generierten Playlist (für den Profil-Ausschluss) */
export const KNOWN_MIX_PLAYLIST_NAMES = [de.playlistName, en.playlistName];

export const MIX_PLAYLIST_NAME_BY_LANG: Record<'de' | 'en', string> = {
  de: de.playlistName,
  en: en.playlistName,
};

// Titel und Description setzt App.tsx je Route (siehe applyPageMeta in seoMeta.ts)
if (typeof document !== 'undefined') {
  document.documentElement.lang = LANG;
}
