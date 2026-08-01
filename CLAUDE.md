# Emphasis — Projektkontext

Arbeitskontext für Claude Code. Ergänzt die READMEs um Entscheidungen, Fallstricke und
Betriebswissen, das nicht aus dem Code hervorgeht.

**Live:** https://emphasize.me · **Repo:** github.com/Chronologe/emphasis

> Betriebsdetails (Server, Pfade, Anbieter, Zugänge) stehen bewusst **nicht** hier,
> sondern in `CLAUDE.local.md` — die Datei ist ignoriert und bleibt lokal.

---

## Was das ist

Zwei quelloffene Werkzeuge für TIDAL in **einer** Vite-/React-App:

| Route | Tool | Kern |
|---|---|---|
| `/` | Startseite | zeigt beide Tools |
| `/your-weekly-mix` | Dein Mix der Woche | 20 Titel, punktebasiert aus der eigenen Bibliothek |
| `/shared-playlist` | Gemeinsame Playlist | jede Person hält eine Kopie, täglicher Abgleich |

Sprachen: Deutsch/Englisch automatisch nach Browsersprache (`de-*` → Deutsch).

## Repo-Aufbau

```
emphasis/
├── CLAUDE.md            ← diese Datei
├── README.md            ← Repo-Startseite (kurz)
└── web/                 ← die App (beherbergt BEIDE Tools)
    ├── README.md        ← vollständige Doku: Algorithmen, Self-Hosting, Tuning
    ├── src/
    │   ├── App.tsx              # Login-Zustand + Routing
    │   ├── shared/              # von beiden Tools genutzt
    │   ├── landing/             # Startseite
    │   ├── your-weekly-mix/     # inputSet, scoring, generator, playlist
    │   └── shared-playlist/     # SharedPlaylist, MemberList, InviteCard, api
    └── server/          # main (Routing+Scheduler), common, autogen, shared
```

**Wichtig:** Der Ordner hieß früher `tidal-weekly-mix`. Alle Pfade sind `web/`.

---

## Getroffene Entscheidungen (und warum)

- **Ein App-Ordner statt Monorepo.** Beide Tools teilen Login, API-Client, i18n und
  Design; ein Build, ein Deployment, eine Redirect-URI.
- **Eigener Mini-Router** (`src/shared/router.ts`, ~30 Zeilen) statt react-router —
  drei Routen rechtfertigen keine Abhängigkeit.
- **Login merkt sich das Ziel-Tool** (`emp-return-to` im localStorage). Dadurch genügt
  Tidal **eine** Browser-Redirect-URI (`https://…/`).
- **Alle Server-OAuth-Flüsse teilen einen Callback-Pfad** (`OAUTH_CALLBACK_PATH` in
  `server/common.ts`, Standard `/api/autogen/callback`, per `EMPHASIS_OAUTH_CALLBACK`
  änderbar). Welcher Fluss gemeint ist, steckt im `state`. → Neue Tools brauchen **nie**
  einen weiteren Dashboard-Eintrag.
- **Gemeinsame Playlist: kollaborativer Merge**, nicht Master-überschreibt-alles.
  `neu = letzter Stand + erlaubte Ergänzungen − erlaubte Entfernungen`. „Master" =
  Verwaltungshoheit (Mitglieder, Rechte, Sync auslösen).
- **Rechte pro Mitglied** (`canAdd`/`canRemove`), beide standardmäßig an.
- **Scoring-Kern wird von Browser und Server identisch genutzt** — Token-Quelle ist über
  `setTokenProvider` injizierbar.
- **Analytics außerhalb des Repos** (GoatCounter, selbst gehostet, cookiefrei).

---

## TIDAL-API: teuer gelernte Fallstricke

1. **Fehler 11102 beim Login** = Autorisierungs-Anfrage passt nicht zur App-Konfiguration.
   Fast immer eine nicht registrierte oder abweichende Redirect-URI (fehlender
   Schrägstrich, `http` statt `https`, falscher Port) oder ein fehlender Scope.
2. **Playlist-Items ersetzen geht nicht per PATCH.** PATCH ist zum *Umsortieren* gedacht
   und verlangt `meta.itemId` bestehender Einträge → sonst 400 `INVALID_REQUEST_BODY`.
   Richtig: `DELETE` (mit `itemId` aus dem GET) + `POST`. Siehe `shared/playlistItems.ts`.
3. **Es gibt keinen „Top-Tracks eines Interpreten"-Endpunkt.** Ersatz: alle Tracks laden
   und clientseitig nach `popularity` sortieren.
4. **Artwork-Upload ist Drittanbietern verboten** (Scope `w_usr` ist intern). Cover muss
   einmal manuell in der Tidal-App gesetzt werden — bleibt beim Überschreiben erhalten.
5. **`crypto.subtle` braucht einen sicheren Kontext.** Das Auth-SDK funktioniert nur über
   `https://` oder `localhost` — nicht über `http://<LAN-IP>`. Dev-Server nutzt daher
   `@vitejs/plugin-basic-ssl`.
6. **Genre-Daten auf Track-Ebene sind lückenhaft** → Album-Genres als Fallback.
7. **Die App bekommt Geheimnisse per URL-Parameter zurück** (`?code=`, `?key=`).
   Alles, was URLs mitschreibt (z. B. Analytics), muss den Query-String verwerfen.
8. **Die Hör-Historie ist für Drittanbieter nicht verfügbar** (`r_usr` ist intern).
   Ersatz: zuletzt gespeicherte/favorisierte Titel.

---

## Betrieb (Grundsätze)

Konkrete Adressen, Pfade und Anbieter stehen in **`CLAUDE.local.md`** (nicht im Repo).
Hier nur, was unabhängig vom konkreten Server gilt:

- **Nutzer- und Gruppendaten liegen außerhalb des Repo-Checkouts** (`EMPHASIS_DATA_DIR`).
  Der Standardwert zeigt ins Deployment-Verzeichnis — im Betrieb immer überschreiben.
- ⚠️ **Niemals `git clean` im Deployment.** Genau das hat einmal das damals im Repo
  liegende Datenverzeichnis gelöscht, inklusive aller Autogen-Aktivierungen. Deshalb
  liegen die Daten heute außerhalb.
- **Deployment** ist `git reset --hard origin/main` + `npm ci` + `npm run build` +
  Dienst-Neustart. Kein Schritt darf ungetrackte Dateien anfassen.
- **Redirect-URIs im Tidal-Dashboard müssen zeichengenau stimmen** (siehe Fallstrick 1),
  je eine für die Dev-Umgebung, die Live-Domain und den Server-Callback.

---

## Konventionen

- **Code-Kommentare auf Deutsch**, erklären das *Warum* (nicht das Was).
- **Nutzertexte ausschließlich über `src/shared/i18n.ts`** — beide Wörterbücher sind
  gegeneinander typgeprüft, eine fehlende Übersetzung bricht den Build.
- **Icons:** [Lucide](https://lucide.dev), einfarbig, `currentColor`.
- **Design-Regel aus dem Marken-Kit:** Mint ist die einzige laute Farbe, höchstens ein
  Mint-Element pro Ansicht.
- **Verifizieren statt behaupten:** Änderungen bauen (`npm run build`, prüft auch Typen),
  sichtbare Änderungen im Browser gegenprüfen, Server-Änderungen im Log
  (`journalctl -u emphasis-autogen`).
- Commits auf Englisch, Nutzer-Antworten auf Deutsch.

---

## Bekannte offene Punkte

- **Cover der Wochen-Mix-Playlist** muss manuell in Tidal gesetzt werden (API-Limit).
- Betriebsseitige offene Punkte stehen in `CLAUDE.local.md`.
