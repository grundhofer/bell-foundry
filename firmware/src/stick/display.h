// The stick's screen: role, radio, send rate, battery, IMU/joystick; or a big "KALIBRIEREN" on request.
#pragma once

namespace display {
// Rotation, brightness and the start message ("still halten").
void begin();
// Full status screen.
void showStatus();
// Follows the screen mode the browser asked for; refreshes the status. Call about 4 times a second.
void update();
}  // namespace display
