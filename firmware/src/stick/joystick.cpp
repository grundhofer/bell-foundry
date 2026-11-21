#include "joystick.h"

#include <Arduino.h>
#include <Wire.h>

namespace joystick {

static constexpr uint8_t ADDR = 0x63;
static constexpr uint8_t REG_ADC16 = 0x00;
static constexpr uint8_t REG_BUTTON = 0x20;
static constexpr int SDA_PIN = 9;
static constexpr int SCL_PIN = 10;
static constexpr uint32_t I2C_HZ = 400000;
static constexpr uint32_t RETRY_MS = 2000;
static constexpr int FAILS_UNTIL_LOST = 5;

struct Axis {
  int32_t center = 32768;
  int32_t spanPos = 1;
  int32_t spanNeg = 1;
};

static bool s_present = false;
static uint32_t s_nextTryMs = 0;
static int s_fails = 0;
static Axis s_ax, s_ay;
static int8_t s_x = 0, s_y = 0;
static bool s_pressed = false;

static bool readRegs(uint8_t reg, uint8_t* buf, uint8_t len) {
  Wire.beginTransmission(ADDR);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom(ADDR, len) != len) return false;
  for (uint8_t i = 0; i < len; i++) buf[i] = Wire.read();
  return true;
}

static bool readRaw(uint16_t& x, uint16_t& y) {
  uint8_t b[4];
  if (!readRegs(REG_ADC16, b, 4)) return false;
  x = (uint16_t)(b[0] | (b[1] << 8));
  y = (uint16_t)(b[2] | (b[3] << 8));
  return true;
}

static void initAxis(Axis& a, int32_t center) {
  // Assume a 12-bit ADC if the center is below 4096.
  const int32_t full = center < 4096 ? 4095 : 65535;
  a.center = center;
  a.spanPos = (full - center) * 7 / 10;
  a.spanNeg = center * 7 / 10;
  if (a.spanPos < 1) a.spanPos = 1;
  if (a.spanNeg < 1) a.spanNeg = 1;
}

static int8_t mapAxis(Axis& a, int32_t v) {
  int32_t d = v - a.center;
  int32_t r;
  if (d >= 0) {
    if (d > a.spanPos) a.spanPos = d;
    r = d * 127 / a.spanPos;
  } else {
    if (-d > a.spanNeg) a.spanNeg = -d;
    r = d * 127 / a.spanNeg;
  }
  if (r > 127) r = 127;
  if (r < -127) r = -127;
  return (int8_t)r;
}

static bool detectAndCalibrate() {
  Wire.beginTransmission(ADDR);
  if (Wire.endTransmission() != 0) return false;
  delay(5);
  int32_t sx = 0, sy = 0;
  int n = 0;
  for (int i = 0; i < 16; i++) {
    uint16_t x, y;
    if (readRaw(x, y)) {
      sx += x;
      sy += y;
      n++;
    }
    delay(2);
  }
  if (n < 8) return false;
  initAxis(s_ax, sx / n);
  initAxis(s_ay, sy / n);
  s_fails = 0;
  return true;
}

void begin() {
  Wire.begin(SDA_PIN, SCL_PIN, I2C_HZ);
  Wire.setTimeOut(5);  // Bound I2C wait time if the joystick is unplugged.
  s_present = detectAndCalibrate();
  s_nextTryMs = millis() + RETRY_MS;
}

bool poll(uint32_t nowMs) {
  if (!s_present) {
    s_x = s_y = 0;
    s_pressed = false;
    if ((int32_t)(nowMs - s_nextTryMs) >= 0) {
      s_nextTryMs = nowMs + RETRY_MS;
      s_present = detectAndCalibrate();
    }
    return s_present;
  }
  uint16_t rx, ry;
  uint8_t btn;
  if (readRaw(rx, ry) && readRegs(REG_BUTTON, &btn, 1)) {
    s_fails = 0;
    int8_t x = mapAxis(s_ax, rx);
    int8_t y = mapAxis(s_ay, ry);
    s_x = JOY_INVERT_X ? (int8_t)-x : x;
    s_y = JOY_INVERT_Y ? (int8_t)-y : y;
    s_pressed = (btn == 0);
  } else if (++s_fails >= FAILS_UNTIL_LOST) {
    s_present = false;
    s_nextTryMs = nowMs + RETRY_MS;
    s_x = s_y = 0;
    s_pressed = false;
  }
  return s_present;
}

bool present() { return s_present; }
int8_t x() { return s_x; }
int8_t y() { return s_y; }
bool pressed() { return s_pressed; }

}  // namespace joystick
