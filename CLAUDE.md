# Tom Bola — Projektdokumentation für Claude

## Projektübersicht

Tombola-Verwaltungs-PWA. Vanilla JS, kein Framework, kein Build-System.
Alle Dateien werden direkt vom Browser geladen.

## Dateistruktur

| Datei | Zweck |
|---|---|
| `index.html` | UI-Struktur |
| `app.js` | Gesamte App-Logik (ein `DOMContentLoaded`-Block) |
| `collab.js` | Stub/Kommentar — frühere P2P-Kollaboration wurde entfernt, siehe unten |
| `api.php` | Backend-API (PHP/PDO-SQLite) für Datensätze & Sync |
| `style.css` | Styling mit CSS Custom Properties (Light/Dark) |
| `sw.js` | Service Worker, Cache-Name: `de.juzmu.tom-bola-v6` |
| `manifest.json` | PWA-Manifest |
| `VERSION` | Einfache Versionsdatei (SemVer, eine Zeile) |
| `data/` | Laufzeitverzeichnis für `tombola.sqlite` (nicht versioniert, wird automatisch angelegt) |

## State-Modell (app.js)

- `currentFileHash` — SHA-256 des CSV-Inhalts, Schlüssel für localStorage und Backend-Dataset-Hash
- `tableData` — Array von `{id, name}`
- `originalFileName` — Dateiname der geladenen CSV
- `lastSyncTime` — Zeitstempel (ms) des letzten erfolgreichen Poll, Basis für inkrementelle `since`-Abfragen
- localStorage-Keys: `lastCsvContent`, `lastCsvHash`, `lastCsvFileName`, `{fileHash}` (checked IDs), `theme`, `hideChecked`

## Backend-Synchronisation (api.php)

Die frühere P2P-Kollaboration (Yjs/y-webrtc, `collab.js`) wurde durch ein klassisches PHP/SQLite-Backend ersetzt. `collab.js` existiert nur noch als Kommentar-Stub und wird nicht mehr eingebunden.

**Datenbank:** SQLite unter `data/tombola.sqlite`, zwei Tabellen:
- `datasets (hash PK, filename, loaded_at)` — ein Eintrag pro importierter CSV
- `participants (id, dataset, name, checked, updated_at, PRIMARY KEY(id, dataset))` — mehrere Datensätze können parallel existieren

**API-Endpunkte (`api.php`):**
- `GET ?action=datasets` — Liste aller Datensätze
- `GET ?since=<ms>&hash=<hash>` — inkrementelle Änderungen für einen Datensatz seit Zeitstempel
- `POST {action:"load_csv", content, filename, hash}` — neuen Datensatz anlegen (kein Überschreiben bestehender Daten)
- `POST {action:"toggle", id, dataset, checked}` — Abhak-Status setzen

**Client-Sync-Flow (app.js):**
- `postCsv()` beim Import, `postToggle()` bei jedem Checkbox-Klick
- `startPolling()` ruft `fetchChanges()` sofort und danach alle 10s (`setInterval`)
- Sync-Status wird über `setSyncStatus()` im UI angezeigt (`#sync-dot`, `#sync-status`)
- Offline-first: `localStorage` bleibt Quelle der Wahrheit bei fehlender Serververbindung, Merge über `applyServerState()`

## Konventionen

- Keine externen JS-Abhängigkeiten (kein CDN/esm.sh mehr, seit Entfernung von Yjs/WebRTC)
- Sprache der UI: Deutsch
- Kein TypeScript, kein Bundler
- Service Worker Cache-Name bei Breaking Changes bumpen: aktuell `v6` → nächste Version hochzählen
- VERSION-Datei bei Releases aktualisieren (SemVer)
- Backend erfordert PHP 7.4+ mit PDO SQLite und Schreibrechte auf `data/`

## Häufige Aufgaben

**Service Worker aktualisieren:** `CACHE_NAME` in `sw.js` bumpen + neue Dateien zu `urlsToCache` hinzufügen.

**Neue UI-Elemente:** In `index.html` einfügen, Styles in `style.css` unter passendem Kommentarblock.

**Backend-Schema ändern:** `CREATE TABLE`-Statements in `db()` (`api.php`) anpassen; bestehende Migration in `db()` beachten (Alt-Schema ohne `dataset`-Spalte wird beim Start automatisch verworfen).
