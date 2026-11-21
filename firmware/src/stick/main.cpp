// Sword and shield stick: sample the IMU at 200 Hz and send at 100 Hz (sampler), run the Atom's commands (commands),
// show the status (display, at lower priority in the Arduino loop).
#include <Arduino.h>
#include <M5Unified.h>

#include "commands.h"
#include "display.h"
#include "radio.h"
#include "sampler.h"
#include "stick.h"

#if HAS_VIBRATION
#include "vibration.h"
#endif
#if HAS_JOYSTICK
#include "joystick.h"
#endif

static constexpr uint8_t SPEAKER_VOLUME = 180;

Status g;

void setup() {
  auto cfg = M5.config();
  cfg.serial_baudrate = 115200;
  cfg.internal_mic = false;
  cfg.external_display_value = 0;
  cfg.output_power = true;
  M5.begin(cfg);

  // PORT.A power is off at startup.
  bool ext = M5.Power.setExtOutput(true);
  Serial.printf("[stick %d] setExtOutput(true) -> %d\n", DEVICE_ID, ext);

  pinMode(KEY1_PIN, INPUT_PULLUP);
  pinMode(KEY2_PIN, INPUT_PULLUP);

  M5.Speaker.setVolume(SPEAKER_VOLUME);

  display::begin();

#if HAS_VIBRATION
  vibration::begin();
#endif

  sampler::begin();

#if HAS_JOYSTICK
  delay(100);
  joystick::begin();
  g.joyPresent = joystick::present();
  Serial.printf("Joystick2: %s\n", g.joyPresent ? "gefunden" : "fehlt");
#endif

  commands::begin();
  if (!radio::begin(commands::onRecv, false)) {
    Serial.println("ESP-NOW-Start fehlgeschlagen");
  }

  M5.Speaker.tone(DEVICE_ID == proto::DEV_SWORD ? 1760 : 1320, 80);
  display::showStatus();

  sampler::start();
}

void loop() {
  display::update();
  delay(250);
}
