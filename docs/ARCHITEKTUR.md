# Architektur

Stand: 21.11.2026. Das Spiel ist ein Browser-Spiel mit three.js **ohne Build-Schritt**: `game/index.html` lädt
`src/main.js` als ES-Modul, eine Import-Map löst `three` auf `game/vendor/three/` auf. Was im Repo liegt, läuft so im
Browser. Node braucht man nur für Prüfwerkzeuge (Lint, Format, Typen, Tests, Regression) und für das Deployment.

## Schichten

Abhängigkeiten zeigen nur nach unten. Eine Schicht darf jede tiefere importieren, nie eine höhere.

```
main.js                      Einstieg: Look früh anwenden, Game bauen, laden, Look einbauen, starten
  │
  ├── dev/                   Entwicklerwerkzeuge, nur bei ?dev, ?at= oder einem unbeaufsichtigten Lauf geladen
  ├── look/                  Gießerei-Look: eigene Stücke (Ofen, Lava, Glocken …), hängt sich ins Spiel ein
  ├── app/                   Kompositionswurzel (game.js), Spielablauf (flow.js), Ausstellung, Bot
  │
  ├── cinematics/ camera/ ui/            Zwischensequenzen und Regie, Spielkamera, Oberfläche
  ├── characters/                        Figuren, Animation, Kampf, Regeln je Figur
  ├── world/ graphics/ audio/ hardware/  Arena, Renderer und Effekte, Ton, Schwert und Schild
  │
  ├── core/                  Schleife, Ereignisbus, Eingabe, Laden, Mathe, Konstanten, Regeln
  └── config/                Was pro Seitenaufruf feststeht: Adressoptionen, Daten des Gießerei-Looks
```

Geprüft wird das nicht automatisch. Bei neuen Importen gilt: Kein Modul unterhalb von `look/` importiert aus `look/`,
und kein Modul unterhalb von `app/` importiert aus `app/` oder `dev/`. Ausnahme: `characters/`, `ui/` und `audio/` lesen die
Figurenwahl aus `characters/roster.js`.

## Benennung

- Ordner und Dateien: englisch, kebab-case, sprechend (`graphics/effects/visual-effects.js`, nicht `gfx/vfx.js`).
  Ausnahme: generierte Dateien behalten ihr eigenes Format (`audio/manifest.js`, `characters/roster-data.js`,
  `characters/clip-data.js`; von Prettier ausgenommen).
- Bezeichner: Klassen PascalCase (`EventBus`, `PostProcessing`), Funktionen und Methoden camelCase mit Verb
  (`applyDifficulty`, `encodeFrame`), Konstanten-Tabellen UPPER_CASE (`CAMERA_TUNING`, `NORMAL_RULES`).
  Ein führender Unterstrich markiert Methoden, die nur die eigene Klasse aufruft.
- Was nach außen sichtbar oder gespeichert ist, bleibt, auch wenn der Name heute anders gewählt würde: URL-Optionen
  (z. B. `?expo`), Ereignisnamen, Asset-Ordner (`voice_giesserei/`), CSS-Klassen, Speicherschlüssel.
- Dokumente sind deutsch und liegen alle in `docs/`, ebenso Lizenzen (`docs/licenses/`) und Namensnennungen
  (`docs/CREDITS.md`). Der Deploy-Build kopiert beides ins ausgelieferte Spiel. Wer Fremdmaterial einbaut, trägt es
  in `CREDITS.md` ein.

## Gemeinsame Helfer

Wer eine dieser Aufgaben hat, nimmt den Helfer und schreibt ihn nicht neu:

| Aufgabe | Wo |
|---|---|
| Seed-Zufall (Kampf, Welt, Effekte, Ton) | `core/math.js`: `mulberry32`, `seededRandom` (Seed 0 zählt als 1), `xorshift32` (Formen und Texturen des Looks) |
| klemmen, mischen, glätten, Winkel | `core/math.js`: `clamp`, `lerp`, `smooth`, `smoother`, `angleDiff`, `TAU`, `DEG`, `hash` |
| nächste Punkte zweier Strecken, Strecke trifft Säule | `core/geometry.js`: `closestSegmentPoints`, `segmentEntersCylinder` |
| three.js-Shader ergänzen | `graphics/shader-patch.js`: `patchShader`, `insertAfterInclude` |
| HTML maskieren | `ui/glyphs.js`: `escapeHtml` |
| Eingabe der Dev-Skripte | `dev/input-script.js`: `MOVES`, `ACTIONS`, `commandFrames`, `commandInput` |

`tests/shared-helpers.test.mjs` prüft, dass die Generatoren Wert für Wert liefern, was die früheren Kopien lieferten.

## Laufzeit

**Kontext.** `Game` (`app/game.js`) legt ein Objekt `ctx` an und gibt es jedem System im Konstruktor mit. Darin stehen
der Takt `DT`, die Optionen `params`, der Bus `bus`, die geladenen Dateien `assets` und alle Systeme (`ctx.player`,
`ctx.gfx` …). Der JSDoc-Typ `GameContext` in `app/game.js` listet sie in der Reihenfolge, in der sie entstehen.
Spätere Systeme dürfen frühere im Konstruktor benutzen.

**Schleife.** `core/loop.js` rechnet in festen Schritten von 1/60 s (`step`) und zeichnet so oft, wie der Browser
Bilder anfordert (`frame`, mit Interpolationsanteil). Treffer-Stopp (`game.hitStop`) und Zeitlupe (`game.slow`)
greifen dort ein. Weil die Schritte fest sind und alle Zufallszahlen aus Seeds kommen, laufen Kämpfe mit gleichem
Seed und gleicher Eingabe Bit für Bit gleich. Darauf beruhen Wiederholungen, Aufnahmen und der Regressionslauf.

**Ein Schritt** (`Game.step`):

1. `hooks.stepStart` (Ausstellungsmodus)
2. Hardware und Eingabe lesen
3. `hooks.afterInput` (Dev-Skripte, Bot)
4. `flow.update`: Spielablauf
5. alle Systeme in der Reihenfolge von `game.systems`: player, boss, combat, arena, *look*, water, candles, vfx,
   impacts, cine, cam, ui, audio (die Namen sind die Schlüssel in `ctx`)

Ein neues System trägt man mit `game.addSystem(name, system, { after })` ein. Ein System braucht nur `update(dt)`.
Methoden anderer Module zu überschreiben ist nicht vorgesehen.

**Spielablauf.** `app/flow.js` ist ein Zustandsautomat:

```
title -> intro -> fight <-> rescue
                    ├─> phase -> fight
                    └─> won
```

Er entscheidet, wann gewechselt wird und was der Wechsel startet (Bildschirm, Zwischensequenz, Musik). `Flow.reset()`
setzt einen Kampf zurück und meldet danach `fight-reset`. `game.state` und `game.begin(at)` sind Abkürzungen auf den
Automaten. Getestet wird er ohne Renderer in `tests/flow.test.mjs`.

**Ereignisse.** Systeme reden über `ctx.bus` miteinander (`on`, `off`, `emit`; `'*'` hört alles). Ein Listener, der
wirft, hält die anderen nicht auf. Die wichtigsten Ereignisse:

| Ereignis | Wer sendet | Bedeutung |
|---|---|---|
| `state` `{from, to}` | Flow | Zustand des Ablaufs gewechselt |
| `fight-reset` | Flow | Kampf zurückgesetzt (Neustart, Titel) |
| `player-died`, `player-rescued` | Flow | Spieler gefallen bzw. zurückgetragen |
| `hit` `{attacker, target, damage, blocked …}` | Combat | Treffer |
| `boss-move` `{name, stage}`, `boss-phase`, `boss-stagger`, `boss-slam`, `boss-died` | Boss | Angriffe und Phasen |
| `swing`, `roll`, `heal`, `land`, `step`, `clash`, `charge`, `stamina-out`, `lock` | Figuren, Kampf, Kamera | für Ton, Kamera, Effekte |
| `cine`, `subtitle`, `candles`, `lava-burn`, `whoosh` | Regie, Welt, Look | für Ton und Oberfläche |
| `setting` `{key, value}` | Game | eine Einstellung im Menü geändert |

## Konfiguration

- **Adressoptionen** (`?q=low&novfx&seed=7`): nur `config/options.js` liest `location.search`. Alle anderen bekommen
  `ctx.params` (ein `Options`-Objekt mit `has`, `get`, `flag`, `num`, `tune`) oder importieren `OPTIONS`, wenn sie
  schon beim Laden des Moduls entscheiden müssen.
- **Look** (die Gießerei): Seine Daten stehen in `config/foundry-look.js`
  (`FOUNDRY_LOOK`). `look/install.js` wendet ihn in zwei Schritten an: `applyEarly()` vor dem Bau des Spiels
  (Farbtabellen, Logo, Menü-Skin), `install(game)` nach dem Laden (Ofen, Lava, Glocken …, als System nach der Arena).
- **Figurenwahl** (`?player=…&boss=…` oder gespeicherte Einstellung): `characters/roster.js`. Ein Wechsel lädt die Seite
  neu, weil die Wahl die zu ladenden Modelle und Stimmen bestimmt. Standard sind der Steinritter
  (`sculpture`) als Pilger und der Schmied (`blacksmith`) als Boss. Jede Figur wird auf ein Referenzskelett umgelenkt:
  Pilger auf das Skelett in `pilgrim.clips.glb`, Bosse auf das in `boss.clips.glb`; beide Dateien enthalten zugleich
  die Animationen. Die Geister der Gießerei (`look/ghosts.js`) tragen die gewählte Pilgerfigur.
- **Ausrüstung** (`characters/wardrobe.js`): Der Pilger trägt Großschwert, Scheide, Schild und Flasche, der Boss den
  Schmiedehammer. Schwert und Scheide haben kein eigenes Modell: `weapons.js` `makeFrame` liefert nur ihre
  Befestigungspunkte, die sichtbaren Teile baut `characters/greatsword.js` aus `FOUNDRY_LOOK.armour.player.greatsword`
  (im Spiel über `look/armour.js`, in der Figurenvorschau des Menüs direkt). Die Körperkapseln (`capsules.js`) halten
  getragene Waffen aus dem Körper.
- **Schwierigkeit und Regeln**: `core/rules.js` (`?rules=film`, `?rule=health:150`).

## Entwicklerwerkzeuge

`dev/index.js` wird nur geladen, wenn die Adresse es verlangt. Es setzt Startpunkt, Kamera, Posen und Skripte und
fährt unbeaufsichtigte Läufe: `?shot=` (Bild), `?fight=` (Bot-Kampf mit Statistik), `?perf=` (Messung),
`?pilot=`, `?capture=`. Die Ergebnisse gehen per `POST /__shot/<name>` an den Testserver (`tools/serve.mjs`).

## Prüfen

| Befehl | Was |
|---|---|
| `npm run serve` | Spiel unter http://localhost:8080 (statisch, kein Build) |
| `npm run check` | ESLint, Prettier, Typprüfung (`npm run typecheck`: `tsc` über Dateien mit `// @ts-check`), Unit-Tests (`tests/support/` bildet die Import-Map für `three` in Node nach) |
| `npm run regress` | Bot-Kämpfe und feste Szenen in Chrome gegen eine gespeicherte Baseline (`npm run regress -- baseline` legt sie an) |

Ein Umbau gilt als verhaltensneutral, wenn `npm run regress` „same as baseline“ meldet: Die Kampfstatistiken müssen
exakt gleich sein, Bilder dürfen höchstens 0,2 % abweichen. Die Baseline liegt in `out/` und ist nicht eingecheckt;
sie wird auf dem Stand vor dem Umbau aufgenommen.

## Bekannte Restschulden

- **Typen.** Nur `app/`, `config/` und einige `core/`-Module haben `// @ts-check`. Systeme sind im `GameContext`
  noch `any`. Nächster Schritt: Klassen-Typen für `ctx.player`, `ctx.boss`, `ctx.gfx` eintragen und `// @ts-check`
  Ordner für Ordner einschalten.
- **Monkey-Patches, die bleiben:**
  - `look/hall.js` ersetzt `Arena.prototype.aisles/eastEnd/westEnd` (die Halle der Gießerei); gehört
    direkt in `world/arena.js`.
  - `look/recast.js` ersetzt `RescueProps.burst` (der glühende Tropfen der Rettungsszene); gehört ebenso direkt in
    `cinematics/rescue-props.js`.
  - `dev/pilot.js` ersetzt für Wiederholungen `input.update` (reines Dev-Werkzeug).
  - `look/lava.js` schreibt per Text-Ersetzung in den Post-Shader (übliches three.js-Vorgehen).
- **Namen aus Bewegungsdaten.** Die Boss-Züge in `characters/boss-moves.js` setzen `flare` (wie weit der Boss sich
  aufbäumt). Es steuert sein Leuchten und, über `Boss.wall`, wie weit er von den Wänden bleibt; Letzteres ist
  Kampfverhalten und bleibt deshalb, auch wenn nichts Sichtbares mehr daran hängt.
- **Große Dateien** (nach der Formatierung): `characters/animation-graph.js` (3300 Zeilen), `characters/boss.js` (2000),
  `characters/player.js` (1900). Sie sind fachlich zusammenhängend und wurden nicht zerlegt, weil
  der Regressionslauf Kampf und Bild abdeckt, aber nicht jede Animation.
- **Nicht umbenannt.** 103 vorgeschlagene Umbenennungen blieben aus, weil der Name auch für anderes benutzt wird und
  sich ohne Typinformation nicht sicher eingrenzen lässt, z. B. `Stage.step`/`fade`/`take`, `GameAudio.player`/`follow`/
  `hush`, `Arena.clear` (liefert einen Wahrheitswert), `Boss.look` (misst Abstand und Richtung), `game.slow`, die
  Simulator-Hilfen in `hardware/simulator.js` (`joy`, `buttons`) und zwei gleichnamige private `_note`/`_key`. Sinnvoll
  erst mit Typen (`// @ts-check`) und Umbenennen über die Typinformation.
- **Toter Code** (nur definiert, nirgends aufgerufen): `GameAudio.cue`, `placeLocal` in `characters/weapons.js`,
  `Character.bodyClear`, der Export `LANGUAGES`.
- **Asset-Listen beim Import.** Module bauen ihre `ASSETS`-Liste beim Laden aus Look und Figurenwahl. Das ist
  gewollt (Boot-Konfiguration), macht diese Module aber ohne Browser schwer testbar.
