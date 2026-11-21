# The Bell Foundry

Ein Duell in einer gefluteten Glockengießerei, im Browser (three.js), gespielt mit einem echten Schwert und Schild:
zwei M5StickS3 mit Bewegungssensoren, ein Atom als Funkempfänger am Laptop, dazu optional ein Pulsband.
Ohne Hardware spielt man mit Tastatur und Maus, Gamepad oder Touch.

## Starten

```sh
npm install        # nur Prüfwerkzeuge; das Spiel selbst braucht keinen Build
npm run serve      # http://localhost:8080
```

Nützliche Adressen: `?at=fight` (direkt in den Kampf),
`?dev` (Entwicklermodus), `?hw` (Hardware-Testanzeige), `?expo` (Ausstellungsmodus).

## Ordner

| Ordner | Inhalt |
|---|---|
| `game/` | das Spiel, so wie es ausgeliefert wird (`index.html`, `src/`, `assets/`, `vendor/three/`) |
| `game/tools/` | Werkzeuge für Modelle, Ton und Deployment (Python, Node) |
| `firmware/` | PlatformIO-Firmware für Schwert, Schild und Empfänger, siehe [docs/FIRMWARE.md](docs/FIRMWARE.md) |
| `tests/` | Unit-Tests (`node --test`) |
| `tools/` | Testserver, Regressionslauf, Pulsband-Testseite (`heart-rate-test.html`) |
| `docs/` | alle Dokumente: [Architektur](docs/ARCHITEKTUR.md), [Hardware](docs/HARDWARE.md), [Protokoll](docs/PROTOKOLL.md), [Firmware](docs/FIRMWARE.md), [Deployment](docs/DEPLOY.md), [Credits](docs/CREDITS.md), `licenses/` |

## Entwickeln

| Befehl | Was |
|---|---|
| `npm run check` | ESLint, Prettier, Typprüfung, Unit-Tests |
| `npm run format` | Code formatieren (Prettier) |
| `npm run regress -- baseline` | Bot-Kämpfe und Szenen in Chrome aufnehmen (vor einer Änderung) |
| `npm run regress` | erneut aufnehmen und mit der Baseline vergleichen |

Deployment nach GitHub Pages: [docs/DEPLOY.md](docs/DEPLOY.md).
