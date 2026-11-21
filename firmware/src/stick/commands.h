// Commands from the Atom (vibrate, tone, screen, beacon). The radio callback only queues them; the sampler task runs
// them, so a single task owns I2C.
#pragma once
#include <Arduino.h>

namespace commands {
void begin();
// ESP-NOW receive callback (radio::begin).
void onRecv(const uint8_t* mac, const uint8_t* data, int len, int8_t rssi);
// Runs every queued command. Call from the sampler task.
void drain();
}  // namespace commands
