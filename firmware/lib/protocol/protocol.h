// Packed little-endian packets. See docs/PROTOKOLL.md.
#pragma once
#include <stdint.h>
#include <stddef.h>

namespace proto {

constexpr uint8_t FW_VERSION = 1;

constexpr uint8_t MAGIC = 0xA7;
constexpr uint8_t WIFI_CHANNEL = 1;
constexpr uint32_t SERIAL_BAUD = 921600;

constexpr uint8_t DEV_ALL = 0;
constexpr uint8_t DEV_SWORD = 1;
constexpr uint8_t DEV_SHIELD = 2;

// Radio and serial share type IDs.
constexpr uint8_t T_IMU = 0x01;
constexpr uint8_t T_STATUS = 0x02;
constexpr uint8_t T_PONG = 0x03;
constexpr uint8_t T_LOG = 0x04;
constexpr uint8_t T_VIBRATE = 0x10;
constexpr uint8_t T_TONE = 0x11;
constexpr uint8_t T_LED = 0x12;
constexpr uint8_t T_SCREEN = 0x13;
constexpr uint8_t T_PING = 0x14;
constexpr uint8_t T_BEACON = 0x20;

constexpr uint8_t F_JOY_PRESENT = 1 << 0;
constexpr uint8_t F_IMU_OK = 1 << 1;
constexpr uint8_t F_CHARGING = 1 << 2;

constexpr uint8_t B_KEY1 = 1 << 0;
constexpr uint8_t B_KEY2 = 1 << 1;
constexpr uint8_t B_JOY = 1 << 2;

constexpr uint8_t SCREEN_OFF = 0;
constexpr uint8_t SCREEN_STATUS = 1;
constexpr uint8_t SCREEN_CALIBRATE = 2;

#pragma pack(push, 1)

// Stick to Atom, 34 bytes.
struct ImuPacket {
  uint8_t magic;
  uint8_t type;
  uint8_t device;
  uint8_t flags;
  uint16_t seq;
  uint32_t t_us;
  int16_t quat[4];   // w, x, y, z scaled by 16384
  int16_t gyro[3];   // degrees/s scaled by 16
  int16_t accel[3];  // milli-g
  uint8_t buttons;
  int8_t joyX;
  int8_t joyY;
  uint8_t battery;
};
static_assert(sizeof(ImuPacket) == 34, "ImuPacket muss 34 Byte haben");
static_assert(offsetof(ImuPacket, quat) == 10, "quat-Offset");
static_assert(offsetof(ImuPacket, gyro) == 18, "gyro-Offset");
static_assert(offsetof(ImuPacket, accel) == 24, "accel-Offset");
static_assert(offsetof(ImuPacket, battery) == 33, "battery-Offset");

struct CmdHeader {
  uint8_t magic;
  uint8_t type;
  uint8_t device;
};

struct CmdVibrate {
  CmdHeader h;
  uint8_t strength;
  uint16_t ms;
};
static_assert(sizeof(CmdVibrate) == 6, "CmdVibrate");

struct CmdTone {
  CmdHeader h;
  uint16_t hz;
  uint16_t ms;
};
static_assert(sizeof(CmdTone) == 7, "CmdTone");

struct CmdScreen {
  CmdHeader h;
  uint8_t mode;
};
static_assert(sizeof(CmdScreen) == 4, "CmdScreen");

// Broadcast twice a second. pps counts IMU packets received per stick.
struct Beacon {
  CmdHeader h;
  uint16_t ppsSword;
  uint16_t ppsShield;
};
static_assert(sizeof(Beacon) == 7, "Beacon");

// Atom to browser, before CRC and COBS.
struct SerialImu {
  uint8_t bytes[sizeof(ImuPacket) - 1];
  int8_t rssi;
};
static_assert(sizeof(SerialImu) == 34, "SerialImu");

struct SerialStatus {
  uint8_t type;
  uint8_t fwVersion;
  uint16_t ppsSword;
  uint16_t ppsShield;
  uint32_t dropped;
};
static_assert(sizeof(SerialStatus) == 10, "SerialStatus");

struct SerialPong {
  uint8_t type;
  uint32_t token;
};
static_assert(sizeof(SerialPong) == 5, "SerialPong");

#pragma pack(pop)

// Payload size includes the type byte.
constexpr size_t SER_LEN_VIBRATE = 5;
constexpr size_t SER_LEN_TONE = 6;
constexpr size_t SER_LEN_LED = 4;
constexpr size_t SER_LEN_SCREEN = 3;
constexpr size_t SER_LEN_PING = 5;

constexpr size_t LOG_MAX = 64;

}  // namespace proto
