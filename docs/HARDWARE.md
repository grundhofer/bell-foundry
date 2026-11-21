# Schwert & Schild in The Bell Foundry

## Starten
```sh
# im Wurzelordner des Repos
python3 -m http.server 8765 --bind 127.0.0.1
```
- Spiel: http://localhost:8080/ (`npm run serve`) – **H** blendet die Testanzeige ein/aus
- `?hw` öffnet die Testanzeige gleich beim Start, `?hw=sim` startet zusätzlich den Simulator
- `&at=fight` springt direkt in den Kampf
- Tests ohne Hardware: `node --test tests/hardware.test.mjs`
- Ausstellung: `?expo` – nach 40 s ohne Eingabe kämpft der Bot als Vorführung (jede echte Eingabe beendet sie), jeder Lauf wird gestoppt, Bestzeiten auf dem Endbildschirm, nach 30 s Endbildschirm oder 90 s ohne Eingabe im Lauf zurück zum Titel. `&expo=reset` löscht die Bestzeiten
- Nur Chrome oder Edge (Web Serial und Web Bluetooth), nur über `localhost`/`127.0.0.1`

## Belegung im Kampf
| Bewegung / Taste | Aktion |
|---|---|
| Schwert seitlich schwingen oder stechen | leichter Angriff |
| Schwert von oben nach unten | schwerer Angriff |
| Schild in Deckung halten (Neigung) | blocken |
| Schild kräftig stoßen | Rolle (ohne Stick-Richtung: Rückschritt) |
| Joystick am Schild | laufen |
| Joystick drücken | Rolle (gehalten: Sprint) |
| Schwert KEY1 | Flasche trinken |
| Schwert KEY2 | springen |
| Schild KEY1 halten | Rolle / Sprint (Ersatz für den Stoß) |
| Schild KEY2 kurz | Pause |
| Schild KEY2 halten + Joystick links/rechts | Kamera drehen |
| Schild KEY1 + KEY2 1,5 s | Deckung kalibrieren (Schild dabei wie zum Blocken halten) |

Menüs: Joystick hoch/runter wählt, Schwert KEY1 bestätigt (gehalten überspringt es Zwischensequenzen), Schild KEY2 geht zurück.

## Puls
Testanzeige → „Pulsband verbinden“. Der Ruhepuls ist der Median der ersten 45 s, alternativ „Ruhepuls = jetzt“.
Stress = 0 bis 5 Schläge über Ruhe, 100 % ab 30 darüber. Dann werden die Pausen der Bossin bis zu 30 % kürzer und ihre Ausholbewegungen in Phase 2 bis zu 15 % schneller. Wer 20 s ruhig bleibt, bekommt 15 % längere Pausen.

## Erster Test mit der Hardware
1. Firmware flashen (siehe `FIRMWARE.md`), Atom einstecken.
2. Spiel öffnen, **H**, „Atom verbinden“ und den Port wählen. Dann prüfen:
   - beide Sticks sind „online“ mit ~100/s
   - „verloren“ bleibt nahe 0
   - USB-Rundlauf liegt unter 5 ms
3. Schwert in Ausgangslage halten (Klinge schräg nach oben) und „Schwert-Ausgangslage kalibrieren“ wählen. Danach Schwert ruhig halten: Drehung nahe 0 °/s. Seitlich schwingen → Ereignis `slash`. Von oben → `overhead`. Wird falsch erkannt, siehe Punkt 6.
4. Schild wie zum Blocken halten, „Schild-Deckung = jetzt“ drücken. Danach Schild senken und heben: Deckung wechselt zwischen OBEN und unten.
5. „Vibration testen“: Das Schwert muss brummen.
6. **Aufnehmen** und jede Geste 10× machen: Hiebe, Schläge von oben, Stiche, Deckung, Stöße und „nichts tun, nur herumlaufen“. Speichern. Mit der Aufnahme stimmen wir die Schwellen in `game/src/hardware/gestures.js` (`TUNING`) ab und sehen per Wiedergabe sofort, ob es besser wird.

## Stand 19.11.2026 (erster Test mit echter Hardware)
Geräte: Empfänger ist ein **AtomS3 Lite** (ESP32-S3, Umgebung `atoms3`), nicht der Atom Lite. Schwert und Schild sind StickS3, beide geflasht.
Ein StickS3 nimmt den Upload nur im Download-Modus an. Danach hilft kein Reset über USB: einmal aus- und einschalten (Power ~6 s halten, dann kurz drücken).

Geprüft:
- Atom: Status, Firmware 1, USB-Rundlauf 1,2 ms
- Schwert: online ~98/s, Akku, KEY1/KEY2, ein kräftiger Hieb erkannt (711 °/s); 4–7 % Paketverlust in Bewegung
- Schild: online 100/s, KEY1/KEY2, Deckung und Stoß reagieren, Verlust fast 0. Ohne Kalibrierung: 8 statt 6 Deckungswechsel und 3 statt 2 Stöße (Hochreißen zählt als Stoß)

Offen, Fortsetzung am 20.11. (Joystick2 kommt dann):
1. Joystick2 an das Schild (PORT.A), beim Einschalten nicht berühren: `Joy ok`, Laufen, Lock-on, Menüs mit dem Stick
2. Schwert an der Klinge montieren, „Schwert-Ausgangslage kalibrieren“, Gesten im Kampf (Hieb, Schlag von oben, Stich), Vibration
3. Schild hochkant montieren, „Schild-Deckung kalibrieren“, Deckung und Stoß neu prüfen, ggf. `flickG` anheben
4. Paketverlust des Schwerts mit beiden Sticks an ihrem Platz ansehen
5. Pulsgurt
6. Ungeklärt: Nach dem Klick auf „Atom verbinden“ schaltete die Seite einmal von selbst auf den Simulator

## Dateien
- `PROTOKOLL.md` (hier in `docs/`): Bytes zwischen Sticks, Atom und Browser (verbindlich für beide Seiten)
- `game/src/hardware/`:
  - `protocol.js`: COBS, CRC, Pakete
  - `gestures.js`: Erkennung und Schwellen
  - `controller-input.js`: Belegung und Puls-Einfluss
  - `panel.js`: Testanzeige
  - `simulator.js`: Simulator
  - `sources.js`: Serial, Aufnahme und Wiedergabe
  - `heart-rate.js`: Pulsband
- Anbindung im übrigen Spiel:
  - `src/core/input.js`: zusätzliche Eingabequelle `hw*` und Weiterleitung von `rumble`
  - `src/app/game.js`: Hardware anlegen und je Schritt aktualisieren
