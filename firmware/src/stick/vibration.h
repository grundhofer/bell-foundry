// N20 DIN is G9. Use 10 kHz PWM and cap duty to stay within the StickS3's 380 mA supply.
#pragma once
#include <stdint.h>

#ifndef VIB_PIN
#define VIB_PIN 9
#endif
#ifndef VIB_PWM_HZ
#define VIB_PWM_HZ 10000
#endif
#ifndef VIB_MAX_DUTY_PERCENT
#define VIB_MAX_DUTY_PERCENT 50
#endif

namespace vibration {
void begin();
// Start without blocking. Zero strength or duration stops the motor.
void start(uint8_t strength, uint16_t ms);
void poll(uint32_t nowMs);
bool active();
}  // namespace vibration
