# Protokoll: Sticks → Atom → Browser

Verbindlicher Vertrag zwischen Firmware (`firmware/`) und Browser (`game/src/hardware/`).
Wer etwas ändert, ändert beide Seiten und diese Datei. Alle Zahlen sind **little endian**, Strukturen **gepackt**.

## Geräte

| ID | Gerät | Hardware | Aufgabe |
|---|---|---|---|
| 1 | Schwert | M5StickS3 + Vibration N20 Unit an PORT.A (G9) | IMU, KEY1/KEY2, Vibration |
| 2 | Schild | M5StickS3 + Joystick2 U024-V2 an PORT.A (I2C SDA G9, SCL G10, Adresse 0x63) | IMU, KEY1/KEY2, Joystick |
| — | Empfänger | Atom Lite C008 am Laptop (USB) | ESP-NOW ↔ USB-Serial |

Montage Schwert: Rückseite des Sticks flach an der Klinge, lange Achse parallel zur Klinge. Ausgangslage: Klinge schräg nach oben.
Welches Ende (±Y) zur Spitze zeigt, misst „Schwert-Ausgangslage kalibrieren“ (Standard ohne Kalibrierung: +Y). Die Drehung um die Klinge spielt für die Gesten keine Rolle.
Montage Schild: Stick hochkant, Rückseite flach am Schild. Die Deckung wird gegen die kalibrierte Blockhaltung gemessen („Schild-Deckung kalibrieren“), die Firmware muss die Lage nicht kennen.
Die Browser-Seite kalibriert die tatsächliche Lage, die Firmware muss davon nichts wissen.

## Funk (Stick ↔ Atom)

- ESP-NOW, WLAN-Kanal **1**, Station-Modus, kein Access Point.
- Sticks senden an die **Broadcast-Adresse** `FF:FF:FF:FF:FF:FF`. Kein Pairing, kein MAC-Eintragen.
- Der Atom sendet Befehle ebenfalls per Broadcast. Jeder Stick reagiert nur auf Befehle mit seiner `device`-ID.
- Jedes Funkpaket beginnt mit dem Magic-Byte `0xA7`. Pakete ohne Magic werden verworfen.

### Stick → Atom: `IMU` (Typ `0x01`), 100 Hz

| Offset | Typ | Feld | Bedeutung |
|---|---|---|---|
| 0 | u8 | magic | `0xA7` |
| 1 | u8 | type | `0x01` |
| 2 | u8 | device | 1 = Schwert, 2 = Schild |
| 3 | u8 | flags | Bit0 Joystick vorhanden, Bit1 IMU ok, Bit2 Akku lädt |
| 4 | u16 | seq | fortlaufend, läuft über |
| 6 | u32 | t_us | `micros()` des Sticks (für Jitter-Messung) |
| 10 | i16[4] | quat | w, x, y, z × 16384 (Mahony-Fusion auf dem Stick, Weltachse Z = oben; q dreht Sensor- in Weltkoordinaten: v_welt = q·v_sensor·q⁻¹, Start-Gier = 0) |
| 18 | i16[3] | gyro | x, y, z in °/s × 16 (Sensorachsen, ±2000 °/s passt) |
| 24 | i16[3] | accel | x, y, z in mg (Sensorachsen) |
| 30 | u8 | buttons | Bit0 KEY1 (vorn, groß), Bit1 KEY2 (Seite), Bit2 Joystick gedrückt |
| 31 | i8 | joyX | −127 … 127, rechts positiv, Totzone **nicht** in der Firmware |
| 32 | i8 | joyY | −127 … 127, vorne/oben positiv |
| 33 | u8 | battery | Prozent 0–100, 255 = unbekannt |

Länge **34 Byte**. Sensorachsen = Achsen des BMI270 wie von M5Unified geliefert (M5Unified dreht sie für den StickS3 bereits um: X=+Y, Y=−X, Z=+Z des Chips).

### Atom → Stick: Befehle (Broadcast)

| Typ | Name | Nutzlast nach `magic, type, device` |
|---|---|---|
| `0x10` | vibrate | u8 strength 0–255, u16 ms |
| `0x11` | tone | u16 Hz, u16 ms (Lautstärke ≤ 75 % wegen Akku) |
| `0x13` | screen | u8 Modus: 0 aus, 1 Status, 2 groß „KALIBRIEREN“ |
| `0x20` | beacon | u16 pps Schwert, u16 pps Schild; `device` = 0 (an alle), 2 × pro Sekunde. **Nur Funk**, geht nie über Serial. Der Stick zeigt damit „Funk ok“ an. |

Ein Funkbefehl ist genau `0xA7 ‖ Serial-Payload` (also `magic, type, device, Nutzlast`), z. B. vibrate = 6 Byte, tone = 7 Byte, screen = 4 Byte.
`vibrate` mit strength 0 oder ms 0 und `tone` mit Hz 0 oder ms 0 stoppen sofort. Beide sind nicht blockierend; ein neuer Befehl ersetzt den laufenden.

## USB-Serial (Atom ↔ Browser)

- **921600 Baud**, 8N1. Web Serial in Chrome.
- Jede Nachricht: `payload ‖ crc8`, dann **COBS**-kodiert, Trennbyte `0x00`.
- crc8: Polynom `0x07`, Startwert `0x00`, über `payload` (ohne Trennbyte, vor COBS).
- `payload` ist genau das Funkpaket **ohne** Magic-Byte, also beginnend bei `type`.

### Atom → Browser

| Typ | Name | Inhalt |
|---|---|---|
| `0x01` | IMU | weitergereichtes Stick-Paket (33 Byte ab `type`), danach **i8 rssi** (Atom hängt an) → 34 Byte |
| `0x02` | status | u8 fwVersion, u16 pps Schwert, u16 pps Schild, u32 verworfene Pakete; 2 × pro Sekunde (pps = IMU-Pakete der letzten Sekunde; verworfen zählt fremde/kaputte Funkpakete, volle Empfangs-Queue und kaputte Serial-Frames bzw. unbekannte Befehle, läuft seit Start hoch) |
| `0x03` | pong | u32 token (Antwort auf ping, sofort) |
| `0x04` | log | UTF-8-Text (Debug, höchstens 64 Byte) |

### Browser → Atom

| Typ | Name | Inhalt |
|---|---|---|
| `0x10` | vibrate | u8 device, u8 strength, u16 ms → als Funkbefehl weiter |
| `0x11` | tone | u8 device, u16 Hz, u16 ms → als Funkbefehl weiter |
| `0x12` | led | u8 r, u8 g, u8 b → LED des Atom selbst, bleibt bis zum nächsten led-Befehl; **0, 0, 0 gibt die LED an die Automatik zurück** (grün/gelb/rot) |
| `0x13` | screen | u8 device, u8 Modus → als Funkbefehl weiter |
| `0x14` | ping | u32 token → Atom antwortet sofort mit pong |

## Latenzziel

Bewegung am Stick bis Spielreaktion unter **30 ms**: 10 ms Abtastung, ~2–4 ms Funk, ~1 ms USB, bis 16,7 ms Spielschritt.
Der Browser misst die Serial-Rundlaufzeit mit `ping` und zeigt sie in der Testanzeige.
