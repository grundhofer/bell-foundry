#include "commands.h"

#include <M5Unified.h>
#include <freertos/queue.h>

#include "stick.h"

#if HAS_VIBRATION
#include "vibration.h"
#endif

namespace commands {

struct RadioMsg {
  uint8_t len;
  uint8_t data[15];
};
static QueueHandle_t s_cmdQueue;

void begin() { s_cmdQueue = xQueueCreate(16, sizeof(RadioMsg)); }

void onRecv(const uint8_t*, const uint8_t* data, int len, int8_t) {
  if (len < 3 || len > (int)sizeof(RadioMsg::data)) return;
  if (data[0] != proto::MAGIC) return;
  if (data[2] != DEVICE_ID && data[2] != proto::DEV_ALL) return;
  RadioMsg m;
  m.len = (uint8_t)len;
  memcpy(m.data, data, len);
  xQueueSend(s_cmdQueue, &m, 0);
}

static void handle(const RadioMsg& m) {
  const uint8_t type = m.data[1];
  const uint8_t dev = m.data[2];
  if (type == proto::T_BEACON && dev == proto::DEV_ALL && m.len >= sizeof(proto::Beacon)) {
    proto::Beacon b;
    memcpy(&b, m.data, sizeof(b));
    g.atomPps = (DEVICE_ID == proto::DEV_SWORD) ? b.ppsSword : b.ppsShield;
    g.lastBeaconMs = millis();
    return;
  }
  if (dev != DEVICE_ID) return;
  g.lastBeaconMs = millis();
  switch (type) {
    case proto::T_VIBRATE:
      if (m.len >= sizeof(proto::CmdVibrate)) {
        proto::CmdVibrate c;
        memcpy(&c, m.data, sizeof(c));
#if HAS_VIBRATION
        vibration::start(c.strength, c.ms);
#endif
      }
      break;
    case proto::T_TONE:
      if (m.len >= sizeof(proto::CmdTone)) {
        proto::CmdTone c;
        memcpy(&c, m.data, sizeof(c));
        if (c.hz == 0 || c.ms == 0) {
          M5.Speaker.stop();
        } else {
          M5.Speaker.tone((float)c.hz, c.ms);
        }
      }
      break;
    case proto::T_SCREEN:
      if (m.len >= sizeof(proto::CmdScreen)) {
        proto::CmdScreen c;
        memcpy(&c, m.data, sizeof(c));
        if (c.mode <= proto::SCREEN_CALIBRATE) g.screenMode = c.mode;
      }
      break;
    default:
      break;
  }
}

void drain() {
  RadioMsg m;
  while (xQueueReceive(s_cmdQueue, &m, 0) == pdTRUE) handle(m);
}

}  // namespace commands
