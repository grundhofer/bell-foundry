// ESP-NOW broadcast on channel 1 for ESP-IDF 4.4 and 5.x.
#pragma once
#include <stdint.h>
#include <stddef.h>

namespace radio {

// Wi-Fi task callback. Only enqueue a copy. RSSI is in dBm (0 if unknown).
typedef void (*RecvHandler)(const uint8_t* mac, const uint8_t* data, int len, int8_t rssi);

// ESP-IDF 4.4 uses promiscuous mode for RSSI.
bool begin(RecvHandler onRecv, bool wantRssi);

bool broadcast(const void* data, size_t len);

uint32_t sendErrors();

}  // namespace radio
