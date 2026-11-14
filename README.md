# ProudNerdFlugfinder

Flugplaner für Künstler-Touren mit vielen Flügen hintereinander (Gabelflüge, 5–6 Flüge und mehr).

- **Online-Version (kostenlos, für alle):** https://tomadoopdf.github.io/proudnerd-flugfinder/ – mit eingebautem Assistenten, ohne Anmeldung.
- **Lokale Version (mit ChatGPT):** auf dem eigenen Rechner starten und mit dem eigenen **ChatGPT-Plus- oder -Pro-Konto** anmelden. Der Chat und der Pass-Scan laufen dann über ChatGPT und dein Abo. Ein API-Key ist nicht nötig.

## Was die App kann

- **Chat-Anfrage:** „6 Flüge, 4 Personen Business, München → New York am 15.12., dann Los Angeles, Tokio … 2 Koffer und eine Gitarre“. Die KI trägt Route, Personen, Kabine und Gepäck ein und rechnet.
- **Anzahl Flüge** per Zähler, **Pläne** (Empfohlen, Günstigste, Preisstabil, Schnellste, Ein Ticket), **Preisverlauf**.
- **Pässe:** Foto-Scan mit ChatGPT, MRZ-Prüfziffern, 6-Monats-Regel und Namensabgleich.
- **Lernende Vorlieben**, **PDF für die Agentur**, **Export/Import** von Touren.
- **Daten bleiben auf dem Gerät** (im Browser).
- Optional **echte, buchbare Preise** über Duffel.

## Warum ChatGPT nur lokal geht

OpenAI erlaubt „Sign in with ChatGPT“ mit Abo-Nutzung für Open-Source-Apps nur über eine Rücksprungadresse auf dem eigenen Rechner (`127.0.0.1`). Eine Webseite wie GitHub Pages kann sich deshalb nicht mit ChatGPT anmelden. Die Online-Version nutzt stattdessen den eingebauten Assistenten.

## Lokal starten (einmalig einrichten)

1. **Node.js installieren:** auf [nodejs.org](https://nodejs.org) die LTS-Version herunterladen und installieren.
2. **Terminal öffnen** (Programme → Dienstprogramme → Terminal) und eingeben:

   ```bash
   cd ~/Documents/ProudNerdFlugfinder/ProudNerdFlugfinder
   npm start
   ```

3. Im Browser **http://127.0.0.1:8787** öffnen.
4. **Einstellungen → „Mit ChatGPT anmelden“** klicken, mit deinem ChatGPT-Konto anmelden und die Nutzung des Abos für ProudNerdFlugfinder erlauben.
5. Fertig. Oben im Chat steht jetzt „CHATGPT AKTIV“. Unter Einstellungen kannst du das Modell wählen.

Zum Beenden im Terminal `Ctrl + C` drücken. Beim nächsten Mal reichen die Schritte 2 und 3. Die Anmeldung bleibt gespeichert und verlängert sich automatisch, solange du die App mindestens alle 30 Tage nutzt.

### Gut zu wissen

- **Voraussetzung:** ChatGPT Plus oder Pro. Die App verbraucht dabei das Kontingent deines Abos, das ChatGPT für Apps vorsieht. In den ChatGPT-Einstellungen kannst du dafür ein Wochenlimit setzen.
- **Ist das Kontingent aufgebraucht,** sagt die App das, und der eingebaute Assistent übernimmt.
- **Anmeldedaten** liegen nur auf deinem Rechner in `data/chatgpt-auth.json` (nur für dich lesbar). Diese Datei nie weitergeben oder hochladen.
- **Abmelden:** Einstellungen → Abmelden.

## Echte Flugpreise (optional)

Datei `.env` anlegen (Vorlage `.env.example`) und `DUFFEL_TOKEN=` eintragen (von app.duffel.com, Test-Token kostenlos). Dann die App neu starten.

## Aufbau

```
index.html          Weiterleitung für GitHub Pages
public/index.html   Oberfläche
public/ui.js        Chat, Tour-Editor, Ergebnisse, Pässe, PDF, Speicher im Browser
public/assistant.js Eingebauter Assistent (ohne KI)
public/engine.js    Tarifmodell (Schätzpreise), Flughafen- und Airline-Daten, MRZ-Prüfung
server.mjs          Lokaler Server: ChatGPT-Anmeldung (OpenID Connect + PKCE), ChatGPT-Anfragen, Duffel
```
