# Tom Bola

Eine einfache Progressive Web App (PWA) zur Verwaltung von Tombola-Ziehungen.

## Features

- CSV-Datei mit Teilnehmerlisten laden (`id`, `name`, optional `checked`)
- Mehrere Datensätze parallel verwalten — Auswahl über Dropdown
- Teilnehmer als ausgegeben markieren (mit Bestätigungsdialog)
- Suche nach ID oder Name
- Live-Zähler (ausgegeben / gesamt)
- Aktuelle Liste als CSV exportieren
- **Echtzeit-Synchronisation** — mehrere Geräte arbeiten live an derselben Liste (PHP/SQLite-Backend, Polling alle 10 Sekunden)
- Offline-First: funktioniert ohne Netzwerk (localStorage-Cache), synchronisiert sich automatisch beim Reconnect
- Installierbar als native App (PWA)
- Light / Dark / Auto Theme

## Verwendung

1. App im Browser öffnen (oder als PWA installieren)
2. CSV-Datei über „Optionen → CSV importieren" laden
3. Datensatz im Dropdown auswählen (falls mehrere vorhanden)
4. Teilnehmer durch Klick auf die Checkbox als ausgegeben markieren
5. Exportieren über „Optionen → CSV exportieren"

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

### Mehrere Datensätze

Jede hochgeladene CSV wird als eigener Datensatz in der Datenbank gespeichert — bestehende Daten werden nicht überschrieben. Über das Dropdown oberhalb der Suche kann zwischen Datensätzen gewechselt werden. Alle Geräte sehen dieselbe Auswahl.

### Synchronisation

Häkchen werden sofort an den Server übertragen (POST). Alle 10 Sekunden werden Änderungen anderer Geräte abgerufen (GET mit Zeitstempel — nur geänderte Einträge). Der Sync-Status ist als farbiger Punkt oberhalb der Tabelle sichtbar.

## Technologie

- Vanilla JavaScript, HTML5, CSS3 — kein Framework, kein Build-System
- PWA: Service Worker (Offline-Cache), Web App Manifest
- Backend: PHP + SQLite (`api.php`, Datenbank unter `data/tombola.sqlite`)
- Synchronisation: REST-API mit inkrementellem Polling (`?since=<ms>&hash=<hash>`)

## Servervoraussetzungen

- PHP 7.4+ mit PDO SQLite
- Schreibrechte auf `data/` (wird automatisch angelegt)
- Apache oder Nginx mit PHP-Unterstützung

## KI-Unterstützung / AI Assistance

Teile dieses Projekts wurden mit Unterstützung von [Claude](https://claude.ai) (Anthropic) entwickelt.

Der ursprüngliche Kern der Anwendung stammt vom Autor.

> Parts of this project were developed with assistance from [Claude](https://claude.ai) by Anthropic.

## Lizenz

[Unlicense](LICENSE) — gemeinfrei / public domain
