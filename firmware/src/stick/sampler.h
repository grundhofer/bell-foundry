// The 200 Hz task: reads the IMU, fuses the attitude (Mahony), runs queued commands, and sends an IMU packet every
// second tick (100 Hz). It is the only task that talks I2C after setup.
#pragma once

namespace sampler {
// Sets up the BMI270 and calibrates gyro bias and tilt while the stick lies still (up to 1.5 s).
void begin();
// Starts the task on core 1.
void start();
}  // namespace sampler
