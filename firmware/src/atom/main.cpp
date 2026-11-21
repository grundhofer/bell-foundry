// Bridge ESP-NOW to USB serial at 921600 baud. LED: green for two sticks, yellow for one, red for none.
#include <Arduino.h>
#include <freertos/queue.h>

#include "framing.h"
#include "protocol.h"
#include "radio.h"

// Atom Lite: LED G27, button G39. AtomS3 Lite: LED G35, button G41.
#ifndef ATOM_LED_PIN
#define ATOM_LED_PIN 27
#endif
#ifndef ATOM_BTN_PIN
#define ATOM_BTN_PIN 39
#endif
static constexpr int LED_PIN = ATOM_LED_PIN;
static constexpr int BTN_PIN = ATOM_BTN_PIN;
static constexpr uint8_t LED_DIM = 40;
static constexpr uint32_t STICK_TIMEOUT_MS = 500;
static constexpr uint32_t STATUS_PERIOD_MS = 500;

// Queue packets from the Wi-Fi task for loop().
struct RxMsg {
  uint8_t len;
  int8_t rssi;
  uint8_t data[sizeof(proto::ImuPacket)];
};
static QueueHandle_t s_rxQueue;
static volatile uint32_t s_dropped = 0;

static void onRecv(const uint8_t*, const uint8_t* data, int len, int8_t rssi) {
  if (len != (int)sizeof(proto::ImuPacket) || data[0] != proto::MAGIC || data[1] != proto::T_IMU ||
      (data[2] != proto::DEV_SWORD && data[2] != proto::DEV_SHIELD)) {
    s_dropped = s_dropped + 1;
    return;
  }
  RxMsg m;
  m.len = (uint8_t)len;
  m.rssi = rssi;
  memcpy(m.data, data, len);
  if (xQueueSend(s_rxQueue, &m, 0) != pdTRUE) s_dropped = s_dropped + 1;
}

static void sendPayload(const uint8_t* p, size_t len) {
  uint8_t out[300];
  size_t n = proto::buildFrame(p, len, out);
  if (n) Serial.write(out, n);
}

static void sendLog(const char* text) {
  uint8_t p[1 + proto::LOG_MAX];
  p[0] = proto::T_LOG;
  size_t n = strnlen(text, proto::LOG_MAX);
  memcpy(p + 1, text, n);
  sendPayload(p, n + 1);
}

static bool s_ledOverride = false;
static uint8_t s_ovR = 0, s_ovG = 0, s_ovB = 0;
static uint32_t s_ledShown = 0xFFFFFFFF;

static void showLed(uint8_t r, uint8_t g, uint8_t b) {
  uint32_t c = ((uint32_t)r << 16) | ((uint32_t)g << 8) | b;
  if (c == s_ledShown) return;
  s_ledShown = c;
#if ESP_ARDUINO_VERSION_MAJOR >= 3
  rgbLedWrite(LED_PIN, r, g, b);
#else
  neopixelWrite(LED_PIN, r, g, b);
#endif
}

static void onSerialPayload(const uint8_t* p, size_t len, void*) {
  const uint8_t type = p[0];
  switch (type) {
    case proto::T_PING:
      if (len >= proto::SER_LEN_PING) {
        uint8_t r[proto::SER_LEN_PING];
        r[0] = proto::T_PONG;
        memcpy(r + 1, p + 1, 4);
        sendPayload(r, sizeof(r));
      }
      return;
    case proto::T_LED:
      if (len >= proto::SER_LEN_LED) {
        s_ovR = p[1];
        s_ovG = p[2];
        s_ovB = p[3];
        // RGB 0,0,0 restores automatic LED colors.
        s_ledOverride = (s_ovR | s_ovG | s_ovB) != 0;
      }
      return;
    case proto::T_VIBRATE:
    case proto::T_TONE:
    case proto::T_SCREEN: {
      const size_t need = type == proto::T_VIBRATE ? proto::SER_LEN_VIBRATE
                          : type == proto::T_TONE  ? proto::SER_LEN_TONE
                                                   : proto::SER_LEN_SCREEN;
      if (len < need) break;
      uint8_t pkt[1 + proto::SER_LEN_TONE];
      pkt[0] = proto::MAGIC;
      memcpy(pkt + 1, p, need);
      radio::broadcast(pkt, need + 1);
      return;
    }
    default:
      break;
  }
  s_dropped = s_dropped + 1;
}

static proto::FrameReader s_reader(onSerialPayload, nullptr);

struct StickStats {
  uint32_t lastSeenMs = 0;
  uint16_t countHalf = 0;
  uint16_t prevHalf = 0;
  bool seen = false;
};
static StickStats s_stick[3];

static uint16_t pps(int dev) { return (uint16_t)(s_stick[dev].countHalf + s_stick[dev].prevHalf); }
static bool present(int dev, uint32_t now) {
  return s_stick[dev].seen && (now - s_stick[dev].lastSeenMs) < STICK_TIMEOUT_MS;
}

void setup() {
  Serial.setRxBufferSize(1024);
  Serial.setTxBufferSize(4096);
  Serial.begin(proto::SERIAL_BAUD);
#if ATOM_BTN_PIN == 39
  pinMode(BTN_PIN, INPUT);  // Atom Lite has an external pull-up on G39.
#else
  pinMode(BTN_PIN, INPUT_PULLUP);
#endif
  showLed(LED_DIM, 0, 0);

  s_rxQueue = xQueueCreate(32, sizeof(RxMsg));
  bool ok = radio::begin(onRecv, true);
  sendLog(ok ? "atom up fw1 ch1" : "atom: ESP-NOW-Start fehlgeschlagen");
}

void loop() {
  const uint32_t now = millis();

  // Wait up to one tick (1 ms) for a radio packet.
  RxMsg m;
  TickType_t wait = 1;
  while (xQueueReceive(s_rxQueue, &m, wait) == pdTRUE) {
    wait = 0;
    proto::SerialImu out;
    memcpy(out.bytes, m.data + 1, sizeof(out.bytes));
    out.rssi = m.rssi;
    sendPayload((const uint8_t*)&out, sizeof(out));
    const uint8_t dev = m.data[2];
    s_stick[dev].lastSeenMs = now;
    s_stick[dev].seen = true;
    s_stick[dev].countHalf++;
  }

  while (Serial.available() > 0) {
    int b = Serial.read();
    if (b < 0) break;
    s_reader.push((uint8_t)b);
  }

  static uint32_t nextStatus = 0;
  static uint32_t lastReaderErrors = 0;
  if ((int32_t)(now - nextStatus) >= 0) {
    nextStatus = now + STATUS_PERIOD_MS;
    if (s_reader.errors != lastReaderErrors) {
      s_dropped = s_dropped + (s_reader.errors - lastReaderErrors);
      lastReaderErrors = s_reader.errors;
    }
    proto::SerialStatus st;
    st.type = proto::T_STATUS;
    st.fwVersion = proto::FW_VERSION;
    st.ppsSword = pps(proto::DEV_SWORD);
    st.ppsShield = pps(proto::DEV_SHIELD);
    st.dropped = s_dropped;
    sendPayload((const uint8_t*)&st, sizeof(st));

    proto::Beacon bc;
    bc.h.magic = proto::MAGIC;
    bc.h.type = proto::T_BEACON;
    bc.h.device = proto::DEV_ALL;
    bc.ppsSword = st.ppsSword;
    bc.ppsShield = st.ppsShield;
    radio::broadcast(&bc, sizeof(bc));

    for (int d = 1; d <= 2; d++) {
      s_stick[d].prevHalf = s_stick[d].countHalf;
      s_stick[d].countHalf = 0;
    }
  }

  if (s_ledOverride) {
    showLed(s_ovR, s_ovG, s_ovB);
  } else {
    const int n = (present(proto::DEV_SWORD, now) ? 1 : 0) + (present(proto::DEV_SHIELD, now) ? 1 : 0);
    if (n == 2)
      showLed(0, LED_DIM, 0);
    else if (n == 1)
      showLed(LED_DIM, LED_DIM * 2 / 3, 0);
    else
      showLed(LED_DIM, 0, 0);
  }

  static bool lastBtn = false;
  const bool btn = digitalRead(BTN_PIN) == LOW;
  if (btn && !lastBtn) sendLog("atom button");
  lastBtn = btn;
}
