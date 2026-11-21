#include "sampler.h"

#include <M5Unified.h>

#include "commands.h"
#include "mahony.h"
#include "radio.h"
#include "stick.h"

#if HAS_VIBRATION
#include "vibration.h"
#endif
#if HAS_JOYSTICK
#include "joystick.h"
#endif

namespace sampler {

static constexpr uint32_t IMU_PERIOD_US = 5000;
static constexpr uint8_t BMI270_ADDR = 0x68;
static constexpr uint8_t BMI270_ACC_CONF = 0x40;
static constexpr uint8_t BMI270_GYR_CONF = 0x42;

static Mahony s_ahrs(1.0f, 0.02f);
static float s_gyroBias[3] = {0, 0, 0};

static inline int16_t clamp16(float v) {
  if (v > 32767.f) return 32767;
  if (v < -32768.f) return -32768;
  return (int16_t)lrintf(v);
}

static void configureBmi270() {
  // Set the sensor to 400 Hz for fresh samples at 200 Hz. Keep the ranges M5Unified expects.
  M5.In_I2C.writeRegister8(BMI270_ADDR, BMI270_ACC_CONF, 0xAA, 400000);
  M5.In_I2C.writeRegister8(BMI270_ADDR, BMI270_GYR_CONF, 0xAA, 400000);
}

// Calibrate gyro bias and tilt while still, for up to 1 s.
static void calibrateAtRest() {
  float sg[3] = {0, 0, 0}, sa[3] = {0, 0, 0};
  int n = 0;
  uint32_t t0 = millis();
  while (n < 150 && millis() - t0 < 1500) {
    if (M5.Imu.update()) {
      auto d = M5.Imu.getImuData();
      float gm = fabsf(d.gyro.x) + fabsf(d.gyro.y) + fabsf(d.gyro.z);
      if (gm < 15.f) {
        sg[0] += d.gyro.x;
        sg[1] += d.gyro.y;
        sg[2] += d.gyro.z;
        sa[0] += d.accel.x;
        sa[1] += d.accel.y;
        sa[2] += d.accel.z;
        n++;
      }
    }
    delay(5);
  }
  if (n >= 50) {
    for (int i = 0; i < 3; i++) s_gyroBias[i] = sg[i] / n;
    s_ahrs.initFromAccel(sa[0], sa[1], sa[2]);
  } else {
    auto d = M5.Imu.getImuData();
    s_ahrs.initFromAccel(d.accel.x, d.accel.y, d.accel.z);
  }
}

static uint8_t readButtons() {
  uint8_t b = 0;
  if (digitalRead(KEY1_PIN) == LOW) b |= proto::B_KEY1;
  if (digitalRead(KEY2_PIN) == LOW) b |= proto::B_KEY2;
#if HAS_JOYSTICK
  if (joystick::pressed()) b |= proto::B_JOY;
#endif
  return b;
}

static void task(void*) {
  proto::ImuPacket pkt = {};
  pkt.magic = proto::MAGIC;
  pkt.type = proto::T_IMU;
  pkt.device = DEVICE_ID;
  uint16_t seq = 0;
  uint32_t tick = 0;
  uint32_t lastUs = micros();
  uint32_t lastImuOkMs = millis();
  uint32_t nextBatMs = 0;
  uint32_t hzWindowStart = millis();
  uint32_t sentInWindow = 0;
  float gyro[3] = {0, 0, 0}, accel[3] = {0, 0, 1};

  TickType_t wake = xTaskGetTickCount();
  for (;;) {
    const uint32_t nowMs = millis();

    // Handle tone and display commands here so one task owns I2C.
    commands::drain();
#if HAS_VIBRATION
    vibration::poll(nowMs);
#endif

    if (M5.Imu.update()) {
      auto d = M5.Imu.getImuData();
      const uint32_t nowUs = micros();
      float dt = (nowUs - lastUs) * 1e-6f;
      lastUs = nowUs;
      if (dt <= 0.f || dt > 0.05f) dt = IMU_PERIOD_US * 1e-6f;
      gyro[0] = d.gyro.x - s_gyroBias[0];
      gyro[1] = d.gyro.y - s_gyroBias[1];
      gyro[2] = d.gyro.z - s_gyroBias[2];
      accel[0] = d.accel.x;
      accel[1] = d.accel.y;
      accel[2] = d.accel.z;
      constexpr float D2R = 0.01745329252f;
      s_ahrs.update(gyro[0] * D2R, gyro[1] * D2R, gyro[2] * D2R, accel[0], accel[1], accel[2], dt);
      lastImuOkMs = nowMs;
    }
    g.imuOk = M5.Imu.isEnabled() && (nowMs - lastImuOkMs) < 100;

    if ((tick & 1) == 0) {
#if HAS_JOYSTICK
      joystick::poll(nowMs);
      g.joyPresent = joystick::present();
      pkt.joyX = joystick::x();
      pkt.joyY = joystick::y();
#else
      pkt.joyX = 0;
      pkt.joyY = 0;
#endif
      uint8_t flags = 0;
      if (g.joyPresent) flags |= proto::F_JOY_PRESENT;
      if (g.imuOk) flags |= proto::F_IMU_OK;
      if (g.charging) flags |= proto::F_CHARGING;
      pkt.flags = flags;
      pkt.seq = seq++;
      pkt.t_us = micros();
      pkt.quat[0] = clamp16(s_ahrs.w * 16384.f);
      pkt.quat[1] = clamp16(s_ahrs.x * 16384.f);
      pkt.quat[2] = clamp16(s_ahrs.y * 16384.f);
      pkt.quat[3] = clamp16(s_ahrs.z * 16384.f);
      for (int i = 0; i < 3; i++) {
        pkt.gyro[i] = clamp16(gyro[i] * 16.f);
        pkt.accel[i] = clamp16(accel[i] * 1000.f);
      }
      pkt.buttons = readButtons();
      pkt.battery = g.battery;
      if (radio::broadcast(&pkt, sizeof(pkt))) sentInWindow++;
    }

    if ((int32_t)(nowMs - nextBatMs) >= 0) {
      nextBatMs = nowMs + 1000;
      int32_t lvl = M5.Power.getBatteryLevel();
      g.battery = (lvl >= 0 && lvl <= 100) ? (uint8_t)lvl : 255;
      g.charging = M5.Power.isCharging();
    }
    if (nowMs - hzWindowStart >= 1000) {
      g.sendHz = (uint16_t)(sentInWindow * 1000 / (nowMs - hzWindowStart));
      sentInWindow = 0;
      hzWindowStart = nowMs;
    }

    tick++;
    // Skip missed 200 Hz ticks.
    if (xTaskDelayUntil(&wake, pdMS_TO_TICKS(IMU_PERIOD_US / 1000)) == pdFALSE) {
      g.loopOverruns = g.loopOverruns + 1;
      wake = xTaskGetTickCount();
    }
  }
}

void begin() {
  if (M5.Imu.isEnabled()) {
    configureBmi270();
    delay(20);
    calibrateAtRest();
  } else {
    Serial.println("IMU nicht gefunden!");
  }
}

void start() { xTaskCreatePinnedToCore(task, "imu", 6144, nullptr, 5, nullptr, 1); }

}  // namespace sampler
