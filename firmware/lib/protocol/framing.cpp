#include "framing.h"

namespace proto {

uint8_t crc8(const uint8_t* data, size_t len) {
  uint8_t c = 0x00;
  for (size_t i = 0; i < len; i++) {
    c ^= data[i];
    for (int k = 0; k < 8; k++) c = (c & 0x80) ? (uint8_t)((c << 1) ^ 0x07) : (uint8_t)(c << 1);
  }
  return c;
}

size_t cobsEncode(const uint8_t* src, size_t len, uint8_t* dst) {
  size_t o = 1, codeAt = 0;
  uint8_t code = 1;
  for (size_t i = 0; i < len; i++) {
    if (src[i] == 0) {
      dst[codeAt] = code;
      codeAt = o++;
      code = 1;
      continue;
    }
    dst[o++] = src[i];
    code++;
    if (code == 0xFF) {
      dst[codeAt] = code;
      codeAt = o++;
      code = 1;
    }
  }
  dst[codeAt] = code;
  return o;
}

size_t cobsDecode(const uint8_t* src, size_t len, uint8_t* dst) {
  size_t i = 0, o = 0;
  while (i < len) {
    uint8_t code = src[i++];
    if (code == 0) return 0;
    for (uint8_t k = 1; k < code; k++) {
      if (i >= len) return 0;
      dst[o++] = src[i++];
    }
    if (code != 0xFF && i < len) dst[o++] = 0;
  }
  return o;
}

size_t buildFrame(const uint8_t* payload, size_t payloadLen, uint8_t* out) {
  uint8_t tmp[256];
  if (payloadLen > 250) return 0;
  for (size_t i = 0; i < payloadLen; i++) tmp[i] = payload[i];
  tmp[payloadLen] = crc8(payload, payloadLen);
  size_t n = cobsEncode(tmp, payloadLen + 1, out);
  out[n++] = 0x00;
  return n;
}

void FrameReader::push(uint8_t b) {
  if (b != 0) {
    if (n_ < BUF) {
      buf_[n_++] = b;
    } else if (!overflow_) {
      overflow_ = true;
      errors++;
    }
    return;
  }
  if (overflow_) {
    overflow_ = false;
    n_ = 0;
    return;
  }
  if (n_ == 0) return;
  size_t d = cobsDecode(buf_, n_, dec_);
  n_ = 0;
  if (d < 2 || crc8(dec_, d - 1) != dec_[d - 1]) {
    errors++;
    return;
  }
  frames++;
  handler_(dec_, d - 1, ctx_);
}

}  // namespace proto
