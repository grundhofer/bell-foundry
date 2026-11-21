# Firmware: Schwert, Schild, Empfänger

Vertrag: `PROTOKOLL.md`. Vier PlatformIO-Umgebungen:

| Umgebung | Gerät | Inhalt |
|---|---|---|
| `sword` | M5StickS3 + Vibration N20 Unit an PORT.A | device 1, IMU 100 Hz, KEY1/KEY2, Vibration (PWM 10 kHz an G9) |
| `shield` | M5StickS3 + Joystick2 an PORT.A | device 2, IMU 100 Hz, KEY1/KEY2, Joystick (I2C 0x63, SDA G9, SCL G10) |
| `atom` | Atom Lite am Laptop | ESP-NOW ↔ USB-Serial 921600, COBS + crc8 |
| `atoms3` | AtomS3 Lite am Laptop | wie `atom` (USB Serial/JTAG, LED G35, Taste G41) |

Gemeinsamer Code liegt in `lib/`: `protocol` (Pakete, COBS, crc8), `mahony` (Lagefusion), `radio` (ESP-NOW auf Kanal 1).

Aufbau des Sticks (`src/stick/`, ein Baustein je Datei, jeweils mit eigenem Namespace):

| Datei | Aufgabe |
|---|---|
| `main.cpp` | `setup()` in fester Reihenfolge, `loop()` aktualisiert nur das Display |
| `stick.h` | geteilter Zustand `g` (schreibt der Abtast-Task, liest das Display), Tasten-Pins, Rollenname |
| `sampler.*` | 200-Hz-Task auf Kern 1: IMU, Mahony, Befehle ausführen, alle 2 Takte ein IMU-Paket; einziger I2C-Nutzer nach dem Start |
| `commands.*` | Funkbefehle vom Atom: Callback reiht nur ein, `drain()` im Abtast-Task führt aus |
| `display.*` | Statusanzeige und „KALIBRIEREN“ |
| `vibration.*`, `joystick.*` | Motor (nur Schwert) und Joystick2 (nur Schild) |

Code-Stil: `.clang-format` (`clang-format -i lib/*/*.{h,cpp} src/*/*.{h,cpp}`, z. B. aus `pip install clang-format`).

## PlatformIO einrichten

```sh
python3 -m venv ~/.venvs/pio && ~/.venvs/pio/bin/pip install platformio
alias pio=~/.venvs/pio/bin/pio
cd firmware
pio run            # baut alle vier
```

Der StickS3 hat noch kein eigenes Board-JSON in PlatformIO. Wir nutzen wie die M5Stack-Doku
`esp32-s3-devkitc-1` (espressif32 6.12.0, Arduino-Core 2.0.17) mit 8 MB Flash und Octal-PSRAM.
M5Unified 0.3.0 erkennt den StickS3 zur Laufzeit.

## Flashen

Ports finden: `pio device list` (StickS3: `/dev/cu.usbmodem…`, Atom: `/dev/cu.usbserial-…`).
Vorher den Chrome-Tab mit Web Serial schließen, sonst ist der Port belegt.

```sh
# Schwert
pio run -e sword -t upload --upload-port /dev/cu.usbmodemXXXX
# Schild
pio run -e shield -t upload --upload-port /dev/cu.usbmodemYYYY
# Atom
pio run -e atom -t upload --upload-port /dev/cu.usbserial-ZZZZ
```

StickS3 nimmt den Upload nicht an? Download-Modus: USB-C stecken, Power-Taste gedrückt halten,
bis die grüne LED blinkt, dann loslassen und den Upload nochmal starten. Danach einmal Power
kurz drücken (Reset).

Debug-Ausgabe der Sticks: `pio device monitor -e sword` (115200 Baud, nur beim Start ein paar
Zeilen). Den Atom nicht mit dem Monitor öffnen: Er spricht Binär (COBS), das liest nur der Browser.

## Was LEDs und Display bedeuten

**Atom-LED**

| Farbe | Bedeutung |
|---|---|
| rot | kein Stick in den letzten 0,5 s gehört (auch direkt nach dem Start) |
| gelb | ein Stick da |
| grün | beide Sticks da |
| andere Farbe | der Browser hat per `led` übersteuert; `led 0,0,0` gibt an die Automatik zurück |

Atom-Taste: schickt ein Log „atom button“ an den Browser (Test der Serial-Strecke).

**StickS3-Display** (quer, 4 × pro Sekunde aktualisiert)

- oben: Rolle `SCHWERT` oder `SCHILD`
- `Funk ok 100/s` (grün): der Atom-Beacon kommt an, die Zahl ist die Rate, die der Atom von
  diesem Stick empfängt. `Funk: kein Atom` (rot): seit 1,5 s kein Beacon.
- `Senden 100 Hz`: so viele Pakete schickt der Stick selbst los
- `Akku 87% +`: Ladestand, `+` = lädt, `?` = unbekannt
- `IMU ok`, beim Schild zusätzlich `Joy ok` oder `Joy --`
- Befehl `screen 2`: blauer Schirm „KALIBRIEREN“, `screen 0`: Display aus

Beim Start: Text „Start, still halten“, etwa 1 s. In der Zeit wird der Gyro-Bias gemessen und die
Lage aus der Schwerkraft gesetzt. Danach ein kurzer Piep (Schwert hoch, Schild tiefer).
Beim Schild: in dieser Zeit den Joystick nicht berühren, die Mitte wird kalibriert.

## Checkliste erster Test

1. `pio run` baut alle vier ohne Fehler.
2. Atom flashen, LED wird rot. Browser verbinden: alle 0,5 s ein `status` mit fwVersion 1 und das
   Log „atom up fw1 ch1“ (kommt nur, wenn der Browser beim Reset schon verbunden war). Ping/Pong prüfen.
3. Schwert flashen, ruhig hinlegen. Display zeigt `SCHWERT`, nach ~1 s `Senden 100 Hz`.
   Atom-LED gelb, im Browser `ppsSword` ≈ 100, Display `Funk ok 100/s`.
4. Schild flashen, Joystick vorher anstecken. Atom-LED grün, `ppsShield` ≈ 100, Display `Joy ok`.
5. Joystick abziehen: `Joy --`, flags Bit0 = 0, Werte 0, IMU läuft weiter. Wieder anstecken:
   nach ≤ 2 s `Joy ok` (Mitte wird dabei neu kalibriert, nicht berühren).
6. **Achsen prüfen (Annahme!)**: Joystick nach rechts → joyX positiv? nach vorne → joyY positiv?
   Sonst in `platformio.ini` beim `shield` `-DJOY_INVERT_X=1` bzw. `-DJOY_INVERT_Y=1` setzen.
7. Stick flach mit Display nach oben: accel ≈ (0, 0, +1000) mg, quat ≈ (1, 0, 0, 0).
   Stick um seine lange Achse und quer kippen und im Browser die Vorzeichen von gyro/accel notieren.
   Die Montage (+Y zur Klingenspitze) ist eine Annahme, siehe `PROTOKOLL.md`.
8. Tasten: KEY1 (vorn, groß) → buttons Bit0, KEY2 (Seite) → Bit1, Joystick drücken → Bit2.
9. **Vibration vorsichtig**: erst `vibrate(1, 128, 300)`, dann `vibrate(1, 255, 1000)`. Startet der
   Stick neu oder geht das Display aus, reicht der Strom von EXT_5V nicht (Doku: Motor 424 mA bei
   50 %, EXT_5V max. 0,38 A). Dann `VIB_MAX_DUTY_PERCENT` senken (Standard 50, in
   `src/stick/vibration.h` oder als `-D` im `sword`-Env). Zu schwach? Vorsichtig erhöhen.
10. `tone(1, 880, 200)` piept (Lautstärke 70 %). `screen(2, 2)` zeigt KALIBRIEREN, `screen(2, 1)` zurück.
11. Latenz: Ping-Rundlauf im Browser ansehen, `dropped` im Status sollte kaum steigen.
12. Akku: Stick vom USB trennen, Prozentwert und `+` beobachten. Mit Motor im Spiel die Laufzeit schätzen.

## Bekannte Grenzen

- Gier driftet (kein Magnetometer); der Browser macht Recenter.
- Gyro ±2000 °/s und Accel ±8 g sind die M5Unified-Bereiche. Sehr schnelle Hiebe können
  sättigen (Werte bleiben dann am Anschlag).
- Die Beschleunigung korrigiert die Lage nur, wenn |a| zwischen 0,85 und 1,15 g liegt. Während
  eines Hiebs zählt nur das Gyro.
