// Joystick2 on PORT.A: SDA G9, SCL G10, address 0x63. Leave it centered at startup.
#pragma once
#include <stdint.h>

// Check axis directions on the device.
#ifndef JOY_INVERT_X
#define JOY_INVERT_X 0
#endif
#ifndef JOY_INVERT_Y
#define JOY_INVERT_Y 0
#endif

namespace joystick {
void begin();
bool poll(uint32_t nowMs);
bool present();
int8_t x();
int8_t y();
bool pressed();
}  // namespace joystick
