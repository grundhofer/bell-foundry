#include "radio.h"

#include <Arduino.h>
#include <WiFi.h>
#include <esp_idf_version.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <string.h>

#include "protocol.h"

namespace radio {

static RecvHandler s_handler = nullptr;
static const uint8_t BCAST[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
static volatile uint32_t s_sendErrors = 0;

#if ESP_IDF_VERSION_MAJOR < 5
// ESP-IDF 4.4 needs the promiscuous callback to read RSSI.
static volatile int8_t s_lastRssi = 0;
static uint8_t s_lastMac[6] = {0};

static void IRAM_ATTR promiscCb(void* buf, wifi_promiscuous_pkt_type_t type) {
  if (type != WIFI_PKT_MGMT) return;
  const wifi_promiscuous_pkt_t* p = (const wifi_promiscuous_pkt_t*)buf;
  const uint8_t* f = p->payload;
  // The 802.11 category follows the 24-byte header.
  if (p->rx_ctrl.sig_len < 28) return;
  if ((f[0] & 0xFC) != 0xD0) return;
  if (f[24] != 127) return;
  memcpy(s_lastMac, f + 10, 6);
  s_lastRssi = (int8_t)p->rx_ctrl.rssi;
}

static void recvCb(const uint8_t* mac, const uint8_t* data, int len) {
  int8_t rssi = 0;
  if (memcmp(mac, s_lastMac, 6) == 0) rssi = s_lastRssi;
  if (s_handler) s_handler(mac, data, len, rssi);
}
#else
static void recvCb(const esp_now_recv_info_t* info, const uint8_t* data, int len) {
  int8_t rssi = info->rx_ctrl ? (int8_t)info->rx_ctrl->rssi : 0;
  if (s_handler) s_handler(info->src_addr, data, len, rssi);
}
#endif

bool begin(RecvHandler onRecv, bool wantRssi) {
  s_handler = onRecv;
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  esp_wifi_set_ps(WIFI_PS_NONE);  // Modem sleep drops packets and adds delay.
  esp_wifi_set_channel(proto::WIFI_CHANNEL, WIFI_SECOND_CHAN_NONE);

#if ESP_IDF_VERSION_MAJOR < 5
  if (wantRssi) {
    wifi_promiscuous_filter_t filt = {};
    filt.filter_mask = WIFI_PROMIS_FILTER_MASK_MGMT;
    esp_wifi_set_promiscuous_filter(&filt);
    esp_wifi_set_promiscuous_rx_cb(&promiscCb);
    esp_wifi_set_promiscuous(true);
    esp_wifi_set_channel(proto::WIFI_CHANNEL, WIFI_SECOND_CHAN_NONE);
  }
#else
  (void)wantRssi;
#endif

  if (esp_now_init() != ESP_OK) return false;
  if (esp_now_register_recv_cb(recvCb) != ESP_OK) return false;

  esp_now_peer_info_t peer = {};
  memcpy(peer.peer_addr, BCAST, 6);
  peer.channel = proto::WIFI_CHANNEL;
  peer.ifidx = WIFI_IF_STA;
  peer.encrypt = false;
  if (esp_now_add_peer(&peer) != ESP_OK) return false;
  return true;
}

bool broadcast(const void* data, size_t len) {
  esp_err_t e = esp_now_send(BCAST, (const uint8_t*)data, len);
  if (e != ESP_OK) {
    s_sendErrors = s_sendErrors + 1;
    return false;
  }
  return true;
}

uint32_t sendErrors() { return s_sendErrors; }

}  // namespace radio
