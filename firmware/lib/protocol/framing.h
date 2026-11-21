// CRC-8 (0x07, init 0) and COBS match the browser.
#pragma once
#include <stdint.h>
#include <stddef.h>

namespace proto {

uint8_t crc8(const uint8_t* data, size_t len);

// Write up to len + len/254 + 1 bytes. Return length without the delimiter.
size_t cobsEncode(const uint8_t* src, size_t len, uint8_t* dst);

// dst needs len bytes. Return decoded length, or 0 on error.
size_t cobsDecode(const uint8_t* src, size_t len, uint8_t* dst);

// COBS(payload + CRC) + 0x00. Payload max 250 bytes. out needs payloadLen + payloadLen/254 + 3 bytes.
size_t buildFrame(const uint8_t* payload, size_t payloadLen, uint8_t* out);

// Pass valid payloads without CRC to the callback.
class FrameReader {
 public:
  typedef void (*Handler)(const uint8_t* payload, size_t len, void* ctx);
  FrameReader(Handler h, void* ctx) : handler_(h), ctx_(ctx) {}
  void push(uint8_t b);
  uint32_t errors = 0;
  uint32_t frames = 0;

 private:
  static constexpr size_t BUF = 300;
  uint8_t buf_[BUF];
  uint8_t dec_[BUF];
  size_t n_ = 0;
  bool overflow_ = false;
  Handler handler_;
  void* ctx_;
};

}  // namespace proto
