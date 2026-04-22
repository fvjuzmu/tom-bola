# Tom Bola — Projektdokumentation für Claude

## Projektübersicht

Tombola-Verwaltungs-PWA. Vanilla JS, kein Framework, kein Build-System.
Alle Dateien werden direkt vom Browser geladen.

## Dateistruktur

| Datei | Zweck |
|---|---|
| `index.html` | UI-Struktur |
| `app.js` | Gesamte App-Logik (ein `DOMContentLoaded`-Block) |
| `collab.js` | P2P-Kollaboration (ES-Modul, `type="module"`) |
| `style.css` | Styling mit CSS Custom Properties (Light/Dark) |
| `sw.js` | Service Worker, Cache-Name: `de.juzmu.tom-bola-v3` |
| `manifest.json` | PWA-Manifest |
| `VERSION` | Einfache Versionsdatei (SemVer, eine Zeile) |

## State-Modell (app.js)

- `currentFileHash` — SHA-256 des CSV-Inhalts, Schlüssel für localStorage
- `tableData` — Array von `{id, name}`
- `originalFileName` — Dateiname der geladenen CSV
- localStorage-Keys: `lastCsvContent`, `lastCsvHash`, `lastCsvFileName`, `{fileHash}` (checked IDs), `theme`, `hideChecked`, `collab_client_name`

## P2P-Kollaboration (collab.js)

Yjs CRDT + y-webrtc via esm.sh. Keine eigene Backend-Infrastruktur.

**Yjs-Dokument:**
- `checkedMap: Y.Map<id, boolean>` — Abhak-Status
- `csvData: Y.Map<string, string>` — CSV-Inhalt + Hash + Dateiname

**Kopplung via window CustomEvents:**
- `tombola:csvloaded` — app.js → collab.js
- `tombola:localchange` — app.js → collab.js
- `tombola:remotechange` — collab.js → app.js
- `tombola:remotecsv` — collab.js → app.js

**Konfiguration:**
- Signaling: `wss://y-webrtc-eu.fly.dev`
- STUN/TURN: `relay.adminforge.de:443`, `relay2.adminforge.de:443` (kein Auth)
- Password = Raumcode (E2E-Verschlüsselung)
- maxConns: 5

## Konventionen

- Keine externen Abhängigkeiten im Core (nur collab.js lädt von esm.sh)
- Sprache der UI: Deutsch
- Kein TypeScript, kein Bundler
- Service Worker Cache-Name bei Breaking Changes bumpen: `v3` → `v4`
- VERSION-Datei bei Releases aktualisieren (SemVer)

## Häufige Aufgaben

**Service Worker aktualisieren:** `CACHE_NAME` in `sw.js` bumpen + neue Dateien zu `urlsToCache` hinzufügen.

**Neue UI-Elemente:** In `index.html` einfügen, Styles in `style.css` unter passendem Kommentarblock.

**Yjs-Bibliotheksversionen ändern:** In `collab.js` die `import()`-URLs anpassen (`https://esm.sh/yjs@13`, `https://esm.sh/y-webrtc@10`).
