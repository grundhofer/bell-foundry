// Web Serial protocol for the Atom. See docs/PROTOKOLL.md.

export const MESSAGE_TYPE = {
  IMU: 0x01,
  STATUS: 0x02,
  PONG: 0x03,
  LOG: 0x04,
  VIBRATE: 0x10,
  TONE: 0x11,
  LED: 0x12,
  SCREEN: 0x13,
  PING: 0x14,
};
export const DEVICE = { SWORD: 1, SHIELD: 2 };
export const BUTTON = { KEY1: 1, KEY2: 2, JOY: 4 };
export const IMU_LEN = 34; // 33-byte radio payload plus RSSI

export function crc8(b, n = b.length) {
  let c = 0;
  for (let i = 0; i < n; i++) {
    c ^= b[i];
    for (let k = 0; k < 8; k++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 0xff : (c << 1) & 0xff;
  }
  return c;
}

export function cobsEncode(src) {
  const out = new Uint8Array(src.length + Math.ceil(src.length / 254) + 1);
  let o = 1,
    code = 1,
    codeAt = 0;
  for (let i = 0; i < src.length; i++) {
    if (src[i] === 0) {
      out[codeAt] = code;
      codeAt = o++;
      code = 1;
      continue;
    }
    out[o++] = src[i];
    code++;
    if (code === 0xff) {
      out[codeAt] = code;
      codeAt = o++;
      code = 1;
    }
  }
  out[codeAt] = code;
  return out.subarray(0, o);
}

export function cobsDecode(src) {
  const out = new Uint8Array(src.length);
  let i = 0,
    o = 0;
  while (i < src.length) {
    const code = src[i++];
    if (code === 0) return null;
    for (let k = 1; k < code; k++) {
      if (i >= src.length) return null;
      out[o++] = src[i++];
    }
    if (code !== 0xff && i < src.length) out[o++] = 0;
  }
  return out.subarray(0, o);
}

export function encodeFrame(payload) {
  const withCrc = new Uint8Array(payload.length + 1);
  withCrc.set(payload);
  withCrc[payload.length] = crc8(payload);
  const enc = cobsEncode(withCrc),
    out = new Uint8Array(enc.length + 1);
  out.set(enc);
  out[enc.length] = 0;
  return out;
}

export class FrameReader {
  constructor(onPayload) {
    this.onPayload = onPayload;
    this.buf = new Uint8Array(512);
    this.n = 0;
    this.errors = 0;
    this.frames = 0;
  }
  push(chunk) {
    for (let i = 0; i < chunk.length; i++) {
      const b = chunk[i];
      if (b !== 0) {
        if (this.n < this.buf.length) this.buf[this.n++] = b;
        else {
          this.n = 0;
          this.errors++;
        }
        continue;
      }
      if (this.n === 0) continue;
      const dec = cobsDecode(this.buf.subarray(0, this.n));
      this.n = 0;
      if (!dec || dec.length < 2 || crc8(dec, dec.length - 1) !== dec[dec.length - 1]) {
        this.errors++;
        continue;
      }
      this.frames++;
      this.onPayload(dec.slice(0, dec.length - 1));
    }
  }
}

const Q = 1 / 16384,
  G = 1 / 16;
/** Decoded IMU units: unit quaternion, degrees/s, and g. */
export function decodePayload(p) {
  const v = new DataView(p.buffer, p.byteOffset, p.byteLength);
  switch (p[0]) {
    case MESSAGE_TYPE.IMU: {
      if (p.length < IMU_LEN) return null;
      return {
        type: 'imu',
        device: p[1],
        flags: p[2],
        seq: v.getUint16(3, true),
        tUs: v.getUint32(5, true),
        quat: [v.getInt16(9, true) * Q, v.getInt16(11, true) * Q, v.getInt16(13, true) * Q, v.getInt16(15, true) * Q],
        gyro: [v.getInt16(17, true) * G, v.getInt16(19, true) * G, v.getInt16(21, true) * G],
        accel: [v.getInt16(23, true) / 1000, v.getInt16(25, true) / 1000, v.getInt16(27, true) / 1000],
        buttons: p[29],
        joy: [v.getInt8(30) / 127, v.getInt8(31) / 127],
        battery: p[32],
        rssi: v.getInt8(33),
      };
    }
    case MESSAGE_TYPE.STATUS:
      if (p.length < 10) return null;
      return {
        type: 'status',
        fw: p[1],
        ppsSword: v.getUint16(2, true),
        ppsShield: v.getUint16(4, true),
        dropped: v.getUint32(6, true),
      };
    case MESSAGE_TYPE.PONG:
      return p.length < 5 ? null : { type: 'pong', token: v.getUint32(1, true) };
    case MESSAGE_TYPE.LOG:
      return { type: 'log', text: new TextDecoder().decode(p.subarray(1)) };
    default:
      return null;
  }
}

const i16 = (x) => Math.max(-32768, Math.min(32767, Math.round(x)));
export function encodeImu(p) {
  const b = new Uint8Array(IMU_LEN),
    v = new DataView(b.buffer);
  b[0] = MESSAGE_TYPE.IMU;
  b[1] = p.device;
  b[2] = p.flags ?? 2;
  v.setUint16(3, p.seq & 0xffff, true);
  v.setUint32(5, p.tUs >>> 0, true);
  for (let i = 0; i < 4; i++) v.setInt16(9 + i * 2, i16(p.quat[i] * 16384), true);
  for (let i = 0; i < 3; i++) v.setInt16(17 + i * 2, i16(p.gyro[i] * 16), true);
  for (let i = 0; i < 3; i++) v.setInt16(23 + i * 2, i16(p.accel[i] * 1000), true);
  b[29] = p.buttons || 0;
  v.setInt8(30, Math.max(-127, Math.min(127, Math.round((p.joy ? p.joy[0] : 0) * 127))));
  v.setInt8(31, Math.max(-127, Math.min(127, Math.round((p.joy ? p.joy[1] : 0) * 127))));
  b[32] = p.battery ?? 255;
  v.setInt8(33, p.rssi ?? -40);
  return b;
}

const encodeCommandFrame = (type, size, fill) => {
  const b = new Uint8Array(size + 1),
    v = new DataView(b.buffer);
  b[0] = type;
  fill(v);
  return encodeFrame(b);
};
export const COMMANDS = {
  vibrate: (device, strength, ms) =>
    encodeCommandFrame(MESSAGE_TYPE.VIBRATE, 4, (v) => {
      v.setUint8(1, device);
      v.setUint8(2, Math.max(0, Math.min(255, strength | 0)));
      v.setUint16(3, ms, true);
    }),
  tone: (device, hz, ms) =>
    encodeCommandFrame(MESSAGE_TYPE.TONE, 5, (v) => {
      v.setUint8(1, device);
      v.setUint16(2, hz, true);
      v.setUint16(4, ms, true);
    }),
  led: (r, g, b) =>
    encodeCommandFrame(MESSAGE_TYPE.LED, 3, (v) => {
      v.setUint8(1, r);
      v.setUint8(2, g);
      v.setUint8(3, b);
    }),
  screen: (device, mode) =>
    encodeCommandFrame(MESSAGE_TYPE.SCREEN, 2, (v) => {
      v.setUint8(1, device);
      v.setUint8(2, mode);
    }),
  ping: (token) => encodeCommandFrame(MESSAGE_TYPE.PING, 4, (v) => v.setUint32(1, token >>> 0, true)),
};
