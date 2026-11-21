#include "mahony.h"
#include <math.h>

static constexpr float ACC_MIN_G = 0.85f;
static constexpr float ACC_MAX_G = 1.15f;
static constexpr float INTEGRAL_LIMIT = 0.1f;

void Mahony::initFromAccel(float ax, float ay, float az) {
  float n = sqrtf(ax * ax + ay * ay + az * az);
  if (n < 1e-6f) {
    w = 1;
    x = y = z = 0;
    return;
  }
  ax /= n;
  ay /= n;
  az /= n;
  // Align measured up with world +Z.
  float d = az;
  float cx = ay, cy = -ax, cz = 0;
  float qw = 1 + d;
  if (qw < 1e-6f) {  // Upside down: turn 180° about X.
    w = 0;
    x = 1;
    y = 0;
    z = 0;
  } else {
    float m = sqrtf(qw * qw + cx * cx + cy * cy + cz * cz);
    w = qw / m;
    x = cx / m;
    y = cy / m;
    z = cz / m;
  }
  ix_ = iy_ = iz_ = 0;
}

void Mahony::update(float gx, float gy, float gz, float ax, float ay, float az, float dt) {
  float n = sqrtf(ax * ax + ay * ay + az * az);
  lastUsedAccel = (n > ACC_MIN_G && n < ACC_MAX_G);
  if (lastUsedAccel) {
    ax /= n;
    ay /= n;
    az /= n;
    float vx = 2 * (x * z - w * y);
    float vy = 2 * (w * x + y * z);
    float vz = w * w - x * x - y * y + z * z;
    float ex = ay * vz - az * vy;
    float ey = az * vx - ax * vz;
    float ez = ax * vy - ay * vx;
    if (ki_ > 0) {
      ix_ += ki_ * ex * dt;
      iy_ += ki_ * ey * dt;
      iz_ += ki_ * ez * dt;
      if (ix_ > INTEGRAL_LIMIT)
        ix_ = INTEGRAL_LIMIT;
      else if (ix_ < -INTEGRAL_LIMIT)
        ix_ = -INTEGRAL_LIMIT;
      if (iy_ > INTEGRAL_LIMIT)
        iy_ = INTEGRAL_LIMIT;
      else if (iy_ < -INTEGRAL_LIMIT)
        iy_ = -INTEGRAL_LIMIT;
      if (iz_ > INTEGRAL_LIMIT)
        iz_ = INTEGRAL_LIMIT;
      else if (iz_ < -INTEGRAL_LIMIT)
        iz_ = -INTEGRAL_LIMIT;
    }
    gx += kp_ * ex + ix_;
    gy += kp_ * ey + iy_;
    gz += kp_ * ez + iz_;
  } else {
    gx += ix_;
    gy += iy_;
    gz += iz_;
  }
  // q' = 0.5 * q * (0, gyro)
  float hdt = 0.5f * dt;
  float qw = w, qx = x, qy = y, qz = z;
  w += (-qx * gx - qy * gy - qz * gz) * hdt;
  x += (qw * gx + qy * gz - qz * gy) * hdt;
  y += (qw * gy - qx * gz + qz * gx) * hdt;
  z += (qw * gz + qx * gy - qy * gx) * hdt;
  float m = sqrtf(w * w + x * x + y * y + z * z);
  if (m < 1e-9f) {
    w = 1;
    x = y = z = 0;
    return;
  }
  w /= m;
  x /= m;
  y /= m;
  z /= m;
}
