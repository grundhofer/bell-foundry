// Mahony filter (2008). q maps sensor to world (+Z up). Browser recenter corrects yaw drift.
#pragma once

class Mahony {
 public:
  // kp corrects tilt. ki corrects gyro bias.
  Mahony(float kp = 1.0f, float ki = 0.02f) : kp_(kp), ki_(ki) {}

  void initFromAccel(float ax, float ay, float az);

  // Gyro in rad/s, acceleration in g, dt in seconds. Use acceleration near 1 g.
  void update(float gx, float gy, float gz, float ax, float ay, float az, float dt);

  float w = 1, x = 0, y = 0, z = 0;
  bool lastUsedAccel = false;

 private:
  float kp_, ki_;
  float ix_ = 0, iy_ = 0, iz_ = 0;
};
