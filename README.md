# Tom Bola

Eine einfache Progressive Web App (PWA) zur Verwaltung von Tombola-Ziehungen.

## Features

- CSV-Datei mit Teilnehmerlisten laden (`id`, `name`, optional `checked`)
- Teilnehmer als ausgegeben markieren (mit Bestätigungsdialog)
- Suche nach ID oder Name
- Live-Zähler (ausgegeben / gesamt)
- Aktuelle Liste als CSV exportieren
- **P2P-Zusammenarbeit** — mehrere Personen arbeiten live an derselben Liste (via WebRTC / Yjs)
- CSV-Verteilung an alle verbundenen Peers
- Lustiger, persistenter Tiername pro Browser-Client
- Offline-First: funktioniert ohne Netzwerk, synchronisiert sich automatisch beim Reconnect
- Installierbar als native App (PWA)
- Light / Dark / Auto Theme

## Verwendung

1. App im Browser öffnen (oder als PWA installieren)
2. CSV-Datei laden — Format: `id,name` (Kopfzeile erforderlich, Trennzeichen `,` oder `;`)
3. Teilnehmer durch Klick auf die Checkbox als ausgegeben markieren
4. Optional: Raumcode eingeben und „Verbinden" klicken, um mit anderen zusammenzuarbeiten
5. Exportieren über den Button „CSV exportieren"

### CSV-Format

```
id,name
1,Max Mustermann
2,Erika Musterfrau
```

Optional mit Abhak-Status (für Re-Import):

```
id,name,checked
1,Max Mustermann,false
2,Erika Musterfrau,true
```

### P2P-Zusammenarbeit

Alle Beteiligten öffnen die App, laden dieselbe CSV und geben denselben **Raumcode** ein. Die Verbindung ist Ende-zu-Ende-verschlüsselt (Raumcode = Schlüssel). Eine Internetverbindung wird nur für die Synchronisierung benötigt — die App bleibt auch offline vollständig nutzbar.

## Technologie

- Vanilla JavaScript, HTML5, CSS3 — kein Framework, kein Build-System
- PWA: Service Worker (Offline-Cache), Web App Manifest
- P2P: [Yjs](https://yjs.dev/) CRDT + [y-webrtc](https://github.com/yjs/y-webrtc)
- STUN/TURN: [adminforge.de](https://adminforge.de/services/stun-server/)
- Signaling: wss://y-webrtc-eu.fly.dev (Yjs-Team, öffentlich)

## KI-Unterstützung / AI Assistance

Teile dieses Projekts wurden mit Unterstützung von [Claude](https://claude.ai) (Anthropic) entwickelt.
Konkret betrifft das die Implementierung der P2P-Kollaborationsfunktion (`collab.js`),
die Architekturentscheidungen rund um Yjs/y-webrtc sowie kleinere Anpassungen an
`app.js`, `index.html`, `style.css` und `sw.js`.

Der ursprüngliche Kern der Anwendung stammt vom Autor.

> Parts of this project were developed with assistance from [Claude](https://claude.ai) by Anthropic,
> specifically the P2P collaboration feature and related architecture decisions.

## Lizenz

[Unlicense](LICENSE) — gemeinfrei / public domain
