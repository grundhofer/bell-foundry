#include "display.h"

#include <M5Unified.h>

#include "stick.h"

namespace display {

static constexpr uint32_t RADIO_OK_MS = 1500;

static void drawStatus(bool full) {
  auto& d = M5.Display;
  const uint16_t bg = TFT_BLACK;
  if (full) {
    d.fillScreen(bg);
    d.setTextSize(3);
    d.setTextColor(TFT_ORANGE, bg);
    d.setCursor(6, 4);
    d.print(roleName());
  }
  char line[32];
  d.setTextSize(2);
  const bool radioOk = (millis() - g.lastBeaconMs) < RADIO_OK_MS && g.lastBeaconMs != 0;

  d.setTextColor(radioOk ? TFT_GREEN : TFT_RED, bg);
  if (radioOk) {
    snprintf(line, sizeof(line), "Funk ok %3u/s   ", (unsigned)g.atomPps);
  } else {
    snprintf(line, sizeof(line), "Funk: kein Atom ");
  }
  d.setCursor(6, 40);
  d.print(line);

  d.setTextColor(TFT_WHITE, bg);
  snprintf(line, sizeof(line), "Senden %3u Hz   ", (unsigned)g.sendHz);
  d.setCursor(6, 62);
  d.print(line);

  if (g.battery == 255) {
    snprintf(line, sizeof(line), "Akku  ?%s      ", g.charging ? " +" : "");
  } else {
    snprintf(line, sizeof(line), "Akku %3u%%%s     ", (unsigned)g.battery, g.charging ? " +" : "");
  }
  d.setCursor(6, 84);
  d.print(line);

  d.setTextColor(g.imuOk ? TFT_DARKGREY : TFT_RED, bg);
#if HAS_JOYSTICK
  snprintf(line, sizeof(line), "IMU %s  Joy %s  ", g.imuOk ? "ok" : "--", g.joyPresent ? "ok" : "--");
#else
  snprintf(line, sizeof(line), "IMU %s          ", g.imuOk ? "ok" : "--");
#endif
  d.setCursor(6, 108);
  d.print(line);
}

static void drawCalibrate() {
  auto& d = M5.Display;
  d.fillScreen(TFT_NAVY);
  d.setTextColor(TFT_WHITE, TFT_NAVY);
  d.setTextDatum(middle_center);
  d.setTextSize(3);
  d.drawString("KALIBRIEREN", d.width() / 2, d.height() / 2);
  d.setTextDatum(top_left);
}

void begin() {
  M5.Display.setRotation(1);
  M5.Display.setBrightness(80);
  M5.Display.fillScreen(TFT_BLACK);
  M5.Display.setTextColor(TFT_WHITE, TFT_BLACK);
  M5.Display.setTextSize(2);
  M5.Display.setCursor(6, 6);
  M5.Display.printf("%s\nStart, still halten", roleName());
}

void showStatus() { drawStatus(true); }

void update() {
  static uint8_t shownMode = 255;
  const uint8_t mode = g.screenMode;
  if (mode != shownMode) {
    if (mode == proto::SCREEN_OFF) {
      M5.Display.fillScreen(TFT_BLACK);
      M5.Display.setBrightness(0);
    } else {
      M5.Display.setBrightness(80);
      if (mode == proto::SCREEN_CALIBRATE)
        drawCalibrate();
      else
        drawStatus(true);
    }
    shownMode = mode;
  } else if (mode == proto::SCREEN_STATUS) {
    drawStatus(false);
  }
}

}  // namespace display
