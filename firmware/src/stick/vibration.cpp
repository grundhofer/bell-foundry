#include "vibration.h"

#include <Arduino.h>

namespace vibration {

static constexpr uint8_t RES_BITS = 8;
static constexpr uint8_t LEDC_CH = 4;  // Reserve PWM channels 0–3 for the M5GFX backlight.
static bool s_active = false;
static uint32_t s_endMs = 0;

static void writeDuty(uint32_t duty) {
#if ESP_ARDUINO_VERSION_MAJOR >= 3
  ledcWrite(VIB_PIN, duty);
#else
  ledcWrite(LEDC_CH, duty);
#endif
}

void begin() {
#if ESP_ARDUINO_VERSION_MAJOR >= 3
  ledcAttach(VIB_PIN, VIB_PWM_HZ, RES_BITS);
#else
  ledcSetup(LEDC_CH, VIB_PWM_HZ, RES_BITS);
  ledcAttachPin(VIB_PIN, LEDC_CH);
#endif
  writeDuty(0);
}

void start(uint8_t strength, uint16_t ms) {
  if (strength == 0 || ms == 0) {
    writeDuty(0);
    s_active = false;
    return;
  }
  const uint32_t maxDuty = ((1u << RES_BITS) - 1) * VIB_MAX_DUTY_PERCENT / 100;
  uint32_t duty = (uint32_t)strength * maxDuty / 255;
  if (duty == 0) duty = 1;
  writeDuty(duty);
  s_endMs = millis() + ms;
  s_active = true;
}

void poll(uint32_t nowMs) {
  if (s_active && (int32_t)(nowMs - s_endMs) >= 0) {
    writeDuty(0);
    s_active = false;
  }
}

bool active() { return s_active; }

}  // namespace vibration
