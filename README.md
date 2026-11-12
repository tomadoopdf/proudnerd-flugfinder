# ProudNerdFlugfinder

Flugplaner für Künstler-Touren mit vielen Flügen hintereinander (Gabelflüge, 5–6 Flüge und mehr).
**Kostenlos nutzbar.** Wer die App benutzt, braucht weder Claude noch einen Account, nur den Link.

## Was die App kann

- **Chat-Anfrage:** Beschreib in eigenen Worten, was ihr braucht („6 Flüge, 4 Personen Business, München → New York am 15.12., dann Los Angeles, Tokio … 2 Koffer und eine Gitarre“). Der eingebaute Assistent trägt Route, Personen, Kabine und Gepäck ein und rechnet. Ein KI-Schlüssel ist dafür nicht nötig.
- **Anzahl Flüge:** Mit dem Zähler (− / +) die Zahl der Flüge der Tour festlegen.
- **Pläne:** Empfohlen, Günstigste, Preisstabil, Schnellste, Ein Ticket (Allianz).
- **Preisstabilität:** Stabilitätswert je Option, Flex-Tarife, Preisverlauf.
- **Pässe:** MRZ-Prüfziffern, 6-Monats-Regel und Namensabgleich.
- **Lernende Vorlieben:** „nie Ryanair“, „keine Nachtflüge“ … per „Merken“ speichern.
- **PDF für die Agentur** und **Export/Import** von Touren als Datei.
- **Daten bleiben auf dem Gerät:** Alles wird im Browser gespeichert, nicht auf einem Server.

Optional, wenn du später möchtest (nur mit eigenem Server, siehe Weg B):
- **Claude** als noch klügerer Chat und zum Lesen von Passfotos (`ANTHROPIC_API_KEY`, Abrechnung pro Nutzung, kein Abo).
- **Echte, buchbare Preise** über Duffel (`DUFFEL_TOKEN`, Testmodus kostenlos).

---

## Kostenlos online stellen

Es gibt zwei Gratis-Wege. **Weg A ist der einfachste** und reicht für fast alles.

| | Weg A: GitHub Pages | Weg B: Render (Gratisplan) |
|---|---|---|
| Kosten | 0 € | 0 € |
| Chat-Assistent, Schätzpreise, Pässe (MRZ), PDF | ✓ | ✓ |
| Claude-Chat und Foto-Scan (mit eigenem Key) | – | ✓ |
| Echte Live-Preise (mit Duffel) | – | ✓ |
| Sofort da | ✓ immer | startet nach 15 Min. Pause neu, erster Aufruf dauert ca. 1 Minute |
| Konten nötig | GitHub | GitHub + Render |

### Weg A: GitHub Pages (komplett kostenlos, immer erreichbar)

1. **GitHub-Konto:** auf github.com → **Sign up** und E-Mail bestätigen.
2. **Ablage anlegen:** oben rechts **+** → **New repository**.
   - Name: `proudnerd-flugfinder`
   - **Public** wählen (GitHub Pages ist im Gratisplan nur für öffentliche Ablagen verfügbar. In den Dateien stehen keine Schlüssel und keine Daten, die liegen nur in deinem Browser.)
   - **Create repository** klicken.
3. **Dateien hochladen:** auf der neuen Seite den Link **„uploading an existing file“** klicken. Im Finder den Ordner **ProudNerdFlugfinder-Upload** öffnen, alles markieren (Cmd + A) und ins Browserfenster ziehen. Dann unten **Commit changes** klicken.
4. **Webseite einschalten:** oben **Settings** → links **Pages** → bei *Branch* `main` und `/ (root)` wählen → **Save**.
5. Nach 1 bis 2 Minuten erscheint oben auf dieser Seite der Link, z. B. `https://deinname.github.io/proudnerd-flugfinder/`. Den gibst du deinem Team.

### Weg B: Render (kostenlos, mit Claude und Live-Preisen)

1. Schritte 1 bis 3 wie bei Weg A. Die Ablage darf hier **Private** sein.
2. Auf render.com → **Get Started** → **Sign up with GitHub** und den Zugriff auf `proudnerd-flugfinder` erlauben.
3. **New +** → **Blueprint** → `proudnerd-flugfinder` wählen.
4. Render fragt nach Schlüsseln. Alle Felder sind freiwillig. Leer gelassen läuft der eingebaute Assistent.
   - `ANTHROPIC_API_KEY`: für Claude (von console.anthropic.com)
   - `DUFFEL_TOKEN`: für echte Preise (von app.duffel.com)
5. **Apply** klicken. Nach 3 bis 5 Minuten steht oben **Live**, links daneben steht dein Link.
6. Falls du Schlüssel eingetragen hast: in Render links **Environment** → bei `APP_TOKEN` aufs Auge klicken und den Code kopieren. In der App unter **Einstellungen** einfügen. Diesen Code bekommt auch dein Team. Er verhindert, dass Fremde deinen API-Key verbrauchen.

Der Gratisplan von Render legt die App nach 15 Minuten ohne Nutzung schlafen. Der nächste Aufruf weckt sie, das dauert etwa eine Minute. Daten gehen dabei nicht verloren, weil sie im Browser liegen.

---

## Daten und Teilen

- Jede Person hat ihre Touren **im eigenen Browser**. Wer den Browserverlauf samt Website-Daten löscht, löscht auch die Touren.
- **Tour weitergeben:** Einstellungen → **Tour exportieren** → Datei per Mail oder Messenger schicken → die andere Person klickt auf **Tour importieren**.
- **Passdaten** werden nur exportiert, wenn du „Mit Passdaten exportieren“ wählst. Solche Dateien vertraulich behandeln.

## Auf dem eigenen Rechner testen

Voraussetzung: [Node.js](https://nodejs.org) 20.12 oder neuer.

```bash
cd ProudNerdFlugfinder
npm install
npm start
```

Dann `http://localhost:8787` öffnen. Schlüssel sind optional und kommen in die Datei `.env` (Vorlage: `.env.example`).

## Aufbau

```
index.html          Weiterleitung für GitHub Pages
public/index.html   Oberfläche
public/ui.js        Chat, Tour-Editor, Ergebnisse, Pässe, PDF, Speicher im Browser
public/assistant.js Eingebauter Assistent (versteht Anfragen ohne KI-Schlüssel)
public/engine.js    Tarifmodell (Schätzpreise), Flughafen- und Airline-Daten, MRZ-Prüfung
server.mjs          Optionaler Server für Claude und Duffel (nur Weg B)
render.yaml         Bauanleitung für Render (Gratisplan)
Dockerfile          Für andere Hoster mit Docker
```

Die API-Schlüssel liegen nur auf dem Server und erreichen nie den Browser.
