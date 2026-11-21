// State shared by the stick's parts: the sampler task writes it, the display reads it.
#pragma once
#include <Arduino.h>

#include "protocol.h"

#ifndef DEVICE_ID
#error "DEVICE_ID fehlt (platformio.ini)"
#endif

static constexpr int KEY1_PIN = 11;
static constexpr int KEY2_PIN = 12;

struct Status {
  volatile uint8_t battery = 255;
  volatile bool charging = false;
  volatile bool imuOk = false;
  volatile bool joyPresent = false;
  volatile uint16_t sendHz = 0;
  volatile uint16_t atomPps = 0;
  volatile uint32_t lastBeaconMs = 0;
  volatile uint32_t loopOverruns = 0;
  volatile uint8_t screenMode = proto::SCREEN_STATUS;
};
extern Status g;

inline const char* roleName() { return DEVICE_ID == proto::DEV_SWORD ? "SCHWERT" : "SCHILD"; }
