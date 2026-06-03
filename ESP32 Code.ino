

#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include "addons/TokenHelper.h"
#include "addons/RTDBHelper.h"
#include <TinyGPSPlus.h>
#include <HardwareSerial.h>

// =====================================================================
// ===  WiFi & Firebase Credentials  ===================================
// =====================================================================
#define WIFI_SSID        "Takumj"
#define WIFI_PASSWORD    "Taku52!?"
#define FIREBASE_API_KEY  "AIzaSyBvrQxlx5JB-rDBLMKw-1oAqyxQs-VuhcU"
#define FIREBASE_DB_URL  "https://incubator-6ae5e-default-rtdb.firebaseio.com/"



// =====================================================================
// ===  Pin Definitions  ===============================================
// =====================================================================

// IR Sensors — Active LOW (LOW = parcel detected, beam broken)
#define IR_SENSOR_1     34    // Shelf 1
#define IR_SENSOR_2     35    // Shelf 2
#define IR_SENSOR_3     32    // Shelf 3

// Vibration Sensors — SW-420 digital out (HIGH = vibration)
#define VIB_SENSOR_1    25    // Shelf 1 parcel
#define VIB_SENSOR_2    26    // Shelf 2 parcel
#define VIB_SENSOR_3    27    // Shelf 3 parcel

// Reed Switches — wired to GND, INPUT_PULLUP
// HIGH = magnet absent = container OPEN
// LOW  = magnet present = container CLOSED
#define REED_SENSOR_1    2    // Shelf 1
#define REED_SENSOR_2   15    // Shelf 2
#define REED_SENSOR_3    4    // Shelf 3

// Buzzer — active HIGH
#define BUZZER_PIN      14

// GPS — NEO-6M on UART2
#define GPS_RX_PIN      16
#define GPS_TX_PIN      17

// MPU6050 & LCD share I2C bus: SDA=21, SCL=22 (ESP32 default)

// =====================================================================
// ===  MPU6050 Raw I2C Registers (no library — same as Nyararisai)  ==
// =====================================================================
#define MPU_ADDR        0x68
#define MPU_PWR_MGMT    0x6B
#define MPU_ACCEL_OUT   0x3B
#define MPU_GYRO_OUT    0x43
#define MPU_WHO_AM_I    0x75

// Complementary filter coefficient (same as Nyararisai)
#define COMP_ALPHA      0.96f

// Tilt alarm threshold (degrees)
#define TILT_THRESHOLD  15.0f

// =====================================================================
// ===  Timing Intervals  ==============================================
// =====================================================================
#define FIREBASE_INTERVAL_MS  2000
#define LCD_INTERVAL_MS       1000
#define SERIAL_INTERVAL_MS    1000
#define PAGE_INTERVAL_MS      4000   // LCD page cycle

// =====================================================================
// ===  Hardware Objects  ==============================================
// =====================================================================

// LCD: 20 columns x 4 rows — try 0x3F if screen stays blank
LiquidCrystal_I2C lcd(0x27, 20, 4);

// GPS
TinyGPSPlus    gps;
HardwareSerial gpsSerial(2);   // UART2

// Firebase
FirebaseData   fbdo;
FirebaseAuth   auth;
FirebaseConfig config;

// =====================================================================
// ===  Global State  ==================================================
// =====================================================================

// MPU6050 — raw accel/gyro (same variable names as Nyararisai)
float accelX = 0, accelY = 0, accelZ = 0;
float gyroX  = 0, gyroY  = 0, gyroZ  = 0;
float roll   = 0, pitch  = 0;

// Complementary filter state (same as Nyararisai)
float compRoll  = 0;
float compPitch = 0;
unsigned long lastFilterMs = 0;

// System health flags (same pattern as Nyararisai)
bool mpuOK  = false;
bool wifiOK = false;

// Shelf data
bool parcelPresent[3]  = {false, false, false};
bool vibration[3]      = {false, false, false};
bool containerOpen[3]  = {false, false, false}; // Reed switches

// GPS data
double  gpsLat       = 0.0;
double  gpsLon       = 0.0;
double  gpsAlt       = 0.0;
double  gpsSpeed     = 0.0;
uint8_t gpsSats      = 0;
bool    gpsValid     = false;

// Timing
unsigned long lastFirebaseMs = 0;
unsigned long lastLcdMs      = 0;
unsigned long lastSerialMs   = 0;
unsigned long lastPageMs     = 0;

// LCD page (0–3)
uint8_t lcdPage = 0;

// =====================================================================
// ===  MPU6050 Raw I2C — init (identical pattern to Nyararisai)  ======
// =====================================================================
bool mpuInit() {
  // Check WHO_AM_I register
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(MPU_WHO_AM_I);
  Wire.endTransmission(false);
  Wire.requestFrom(MPU_ADDR, 1, true);
  uint8_t id = Wire.read();
  if (id != 0x68 && id != 0x72) return false;

  // Wake up — clear sleep bit (same as Nyararisai)
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(MPU_PWR_MGMT);
  Wire.write(0x00);
  Wire.endTransmission(true);
  delay(100);
  return true;
}

// =====================================================================
// ===  MPU6050 Read + Complementary Filter (identical to Nyararisai) =
// =====================================================================
bool readIMU() {
  if (!mpuOK) return false;

  // Burst-read 14 bytes: accel(6) + temp(2) + gyro(6)
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(MPU_ACCEL_OUT);
  Wire.endTransmission(false);
  Wire.requestFrom(MPU_ADDR, 14, true);

  int16_t ax = (Wire.read() << 8) | Wire.read();
  int16_t ay = (Wire.read() << 8) | Wire.read();
  int16_t az = (Wire.read() << 8) | Wire.read();
  Wire.read(); Wire.read();                      // skip temperature
  int16_t gx = (Wire.read() << 8) | Wire.read();
  int16_t gy = (Wire.read() << 8) | Wire.read();
  int16_t gz = (Wire.read() << 8) | Wire.read();

  // Convert to physical units (same scale factors as Nyararisai)
  accelX = ax / 16384.0f;   // ±2g range → 16384 LSB/g
  accelY = ay / 16384.0f;
  accelZ = az / 16384.0f;
  gyroX  = gx / 131.0f;    // ±250°/s  → 131  LSB/°/s
  gyroY  = gy / 131.0f;
  gyroZ  = gz / 131.0f;

  // Accelerometer-derived angles
  float accelRoll  = atan2(accelY, accelZ) * 57.2958f;
  float accelPitch = atan2(-accelX, sqrtf(accelY * accelY + accelZ * accelZ)) * 57.2958f;

  // Complementary filter — integrate gyro + correct with accel
  // (same logic as Nyararisai: COMP_ALPHA = 0.96)
  unsigned long now = millis();
  float dt = (now - lastFilterMs) / 1000.0f;
  lastFilterMs = now;

  if (dt > 0 && dt < 1.0f) {
    compRoll  = COMP_ALPHA * (compRoll  + gyroX * dt) + (1.0f - COMP_ALPHA) * accelRoll;
    compPitch = COMP_ALPHA * (compPitch + gyroY * dt) + (1.0f - COMP_ALPHA) * accelPitch;
  } else {
    // First call or filter reset — seed directly from accel
    compRoll  = accelRoll;
    compPitch = accelPitch;
  }

  roll  = compRoll;
  pitch = compPitch;
  return true;
}

// Derived tilt state (combined roll + pitch magnitude)
float getTiltAngle() {
  return sqrtf(roll * roll + pitch * pitch);
}

bool isVehicleTilted() {
  return (getTiltAngle() > TILT_THRESHOLD);
}

// =====================================================================
// ===  Read IR & Vibration Sensors  ===================================
// =====================================================================
void readShelfSensors() {
  // IR — active LOW (beam broken = parcel present)
  parcelPresent[0] = (digitalRead(IR_SENSOR_1) == LOW);
  parcelPresent[1] = (digitalRead(IR_SENSOR_2) == LOW);
  parcelPresent[2] = (digitalRead(IR_SENSOR_3) == LOW);

  // Vibration — SW-420 active HIGH
  vibration[0] = (digitalRead(VIB_SENSOR_1) == HIGH);
  vibration[1] = (digitalRead(VIB_SENSOR_2) == HIGH);
  vibration[2] = (digitalRead(VIB_SENSOR_3) == HIGH);

  // Reed switches — INPUT_PULLUP: HIGH = magnet absent = container OPEN
  containerOpen[0] = (digitalRead(REED_SENSOR_1) == HIGH);
  containerOpen[1] = (digitalRead(REED_SENSOR_2) == HIGH);
  containerOpen[2] = (digitalRead(REED_SENSOR_3) == HIGH);
}

// =====================================================================
// ===  Read GPS  ======================================================
// =====================================================================
void readGPS() {
  unsigned long start = millis();
  while (millis() - start < 200) {
    while (gpsSerial.available()) {
      gps.encode(gpsSerial.read());
    }
  }
  gpsValid = gps.location.isValid();
  gpsLat   = gpsValid              ? gps.location.lat()    : 0.0;
  gpsLon   = gpsValid              ? gps.location.lng()    : 0.0;
  gpsAlt   = gps.altitude.isValid()  ? gps.altitude.meters() : 0.0;
  gpsSpeed = gps.speed.isValid()     ? gps.speed.kmph()      : 0.0;
  gpsSats  = gps.satellites.isValid()? gps.satellites.value(): 0;
}

// =====================================================================
// ===  Send to Firebase  ==============================================
// =====================================================================
void pushToFirebase() {
  if (!Firebase.ready()) return;

  String base = "/cargo_system";

  // ---- Shelves ----
  for (int i = 0; i < 3; i++) {
    String path = base + "/shelves/shelf_" + String(i + 1);
    Firebase.RTDB.setBool  (&fbdo, path + "/parcel_present",  parcelPresent[i]);
    Firebase.RTDB.setBool  (&fbdo, path + "/vibration",       vibration[i]);
    Firebase.RTDB.setBool  (&fbdo, path + "/container_open",  containerOpen[i]);
    Firebase.RTDB.setBool  (&fbdo, path + "/ir_active",       parcelPresent[i]);
    // status: tampered takes priority if container opens while moving
    String shelfStatus = "idle";
    if (vibration[i])                            shelfStatus = "vibration";
    if (containerOpen[i] && gpsSpeed > 2.0)      shelfStatus = "tampered";
    else if (containerOpen[i])                   shelfStatus = "open";
    Firebase.RTDB.setString(&fbdo, path + "/status", shelfStatus);
  }

  // ---- IMU — roll, pitch, raw accel/gyro (same fields as Nyararisai) ----
  String imuPath = base + "/vehicle/imu";
  Firebase.RTDB.setFloat (&fbdo, imuPath + "/roll",        roll);
  Firebase.RTDB.setFloat (&fbdo, imuPath + "/pitch",       pitch);
  Firebase.RTDB.setFloat (&fbdo, imuPath + "/accelX",      accelX);
  Firebase.RTDB.setFloat (&fbdo, imuPath + "/accelY",      accelY);
  Firebase.RTDB.setFloat (&fbdo, imuPath + "/accelZ",      accelZ);
  Firebase.RTDB.setFloat (&fbdo, imuPath + "/gyroX",       gyroX);
  Firebase.RTDB.setFloat (&fbdo, imuPath + "/gyroY",       gyroY);
  Firebase.RTDB.setFloat (&fbdo, imuPath + "/gyroZ",       gyroZ);
  Firebase.RTDB.setFloat (&fbdo, imuPath + "/tilt_angle",  getTiltAngle());
  Firebase.RTDB.setBool  (&fbdo, imuPath + "/tilted",      isVehicleTilted());
  Firebase.RTDB.setString(&fbdo, imuPath + "/orientation",
    isVehicleTilted() ? "TILTED" : "UPRIGHT");

  // ---- GPS ----
  String gpsPath = base + "/vehicle/gps";
  Firebase.RTDB.setDouble(&fbdo, gpsPath + "/latitude",    gpsLat);
  Firebase.RTDB.setDouble(&fbdo, gpsPath + "/longitude",   gpsLon);
  Firebase.RTDB.setDouble(&fbdo, gpsPath + "/altitude_m",  gpsAlt);
  Firebase.RTDB.setDouble(&fbdo, gpsPath + "/speed_kmh",   gpsSpeed);
  Firebase.RTDB.setInt   (&fbdo, gpsPath + "/satellites",  gpsSats);
  Firebase.RTDB.setBool  (&fbdo, gpsPath + "/valid",       gpsValid);

  // ---- System summary ----
  int  occupied          = 0;
  bool anyVib            = false;
  bool anyContainerOpen  = false;
  for (int i = 0; i < 3; i++) {
    if (parcelPresent[i])  occupied++;
    if (vibration[i])      anyVib = true;
    if (containerOpen[i])  anyContainerOpen = true;
  }
  Firebase.RTDB.setInt   (&fbdo, base + "/summary/occupied_shelves",  occupied);
  Firebase.RTDB.setBool  (&fbdo, base + "/summary/any_vibration",     anyVib);
  Firebase.RTDB.setBool  (&fbdo, base + "/summary/any_container_open",anyContainerOpen);
  Firebase.RTDB.setBool  (&fbdo, base + "/summary/vehicle_tilted",    isVehicleTilted());
  Firebase.RTDB.setBool  (&fbdo, base + "/summary/gps_valid",         gpsValid);
  Firebase.RTDB.setString(&fbdo, base + "/last_updated",
    String(millis() / 1000) + "s");

  Serial.println("[Firebase] Data pushed.");
}

// =====================================================================
// ===  LCD — 4 rotating pages (20x4)  =================================
// =====================================================================
void updateLCD() {
  // Advance page every PAGE_INTERVAL_MS
  if (millis() - lastPageMs > PAGE_INTERVAL_MS) {
    lcdPage = (lcdPage + 1) % 4;
    lastPageMs = millis();
    lcd.clear();
  }

  switch (lcdPage) {

    // ── Page 0: System header ─────────────────────────────────────────
    case 0:
      lcd.setCursor(0, 0); lcd.print("CARGO TRACK SYSTEM  ");
      lcd.setCursor(0, 1); lcd.print("T. Tivavone         ");
      lcd.setCursor(0, 2);
      lcd.print(wifiOK ? "WiFi : Connected    " : "WiFi : Offline      ");
      lcd.setCursor(0, 3);
      lcd.print("MPU  : ");
      lcd.print(mpuOK ? "OK          " : "FAILED      ");
      break;

    // ── Page 1: Shelf / parcel status ─────────────────────────────────
    case 1:
      lcd.setCursor(0, 0); lcd.print("--- SHELF STATUS ---");
      for (int i = 0; i < 3; i++) {
        lcd.setCursor(0, i + 1);
        char sLine[21];
        // Format: "S1:PARCEL VIB OPEN  "
        snprintf(sLine, sizeof(sLine), "S%d:%-6s %s %s  ",
          i + 1,
          parcelPresent[i]  ? "PARCEL" : "EMPTY",
          vibration[i]      ? "VIB"    : "   ",
          containerOpen[i]  ? "OPN"    : "   ");
        lcd.print(sLine);
      }
      break;

    // ── Page 2: IMU (roll / pitch / tilt) — same display style as Nyararisai
    case 2: {
      lcd.setCursor(0, 0); lcd.print("--- VEHICLE IMU  ---");
      char buf[21];
      snprintf(buf, sizeof(buf), "Roll : %7.2f deg   ", roll);
      lcd.setCursor(0, 1); lcd.print(buf);
      snprintf(buf, sizeof(buf), "Pitch: %7.2f deg   ", pitch);
      lcd.setCursor(0, 2); lcd.print(buf);
      lcd.setCursor(0, 3);
      lcd.print(isVehicleTilted() ? "Status: TILTED      " : "Status: UPRIGHT     ");
      break;
    }

    // ── Page 3: GPS ───────────────────────────────────────────────────
    case 3:
      lcd.setCursor(0, 0); lcd.print("---   GPS DATA   ---");
      if (gpsValid) {
        char buf[21];
        snprintf(buf, sizeof(buf), "Lat:%10.5f     ", gpsLat);
        lcd.setCursor(0, 1); lcd.print(buf);
        snprintf(buf, sizeof(buf), "Lon:%10.5f     ", gpsLon);
        lcd.setCursor(0, 2); lcd.print(buf);
        snprintf(buf, sizeof(buf), "Spd:%5.1fkm Sat:%2d  ", gpsSpeed, gpsSats);
        lcd.setCursor(0, 3); lcd.print(buf);
      } else {
        lcd.setCursor(0, 1); lcd.print("Acquiring signal... ");
        char buf[21];
        snprintf(buf, sizeof(buf), "Satellites: %2d      ", gpsSats);
        lcd.setCursor(0, 2); lcd.print(buf);
        lcd.setCursor(0, 3); lcd.print("                    ");
      }
      break;
  }
}

// =====================================================================
// ===  Serial Debug  ==================================================
// =====================================================================
void printSerialDebug() {
  Serial.println("============================================");
  Serial.println("  CARGO TRACKING SYSTEM — T. Tivavone");
  Serial.println("============================================");
  for (int i = 0; i < 3; i++) {
    Serial.printf("  Shelf %d : %-8s  Vib: %-3s  Container: %s\n",
      i + 1,
      parcelPresent[i]  ? "PARCEL" : "EMPTY",
      vibration[i]      ? "YES"    : "NO",
      containerOpen[i]  ? "OPEN"   : "CLOSED");
  }
  Serial.printf("  Roll : %.2f  Pitch : %.2f\n", roll, pitch);
  Serial.printf("  AccelX:%.3f  AccelY:%.3f  AccelZ:%.3f\n",
    accelX, accelY, accelZ);
  Serial.printf("  GyroX :%.2f  GyroY :%.2f  GyroZ :%.2f\n",
    gyroX, gyroY, gyroZ);
  Serial.printf("  Tilt  : %.1f deg — %s\n",
    getTiltAngle(), isVehicleTilted() ? "TILTED" : "UPRIGHT");
  if (gpsValid) {
    Serial.printf("  GPS   : Lat=%.6f  Lon=%.6f\n", gpsLat, gpsLon);
    Serial.printf("          Spd=%.1f km/h  Alt=%.1fm  Sats=%d\n",
      gpsSpeed, gpsAlt, gpsSats);
  } else {
    Serial.printf("  GPS   : Acquiring... (%d sats)\n", gpsSats);
  }
  Serial.println("============================================\n");
}

// =====================================================================
// ===  Buzzer Alert  ==================================================
// =====================================================================
void updateBuzzer() {
  bool tiltAlert     = isVehicleTilted();
  bool tamperAlert   = false;
  bool vibAlert      = false;

  for (int i = 0; i < 3; i++) {
    if (vibration[i])                          vibAlert    = true;
    if (containerOpen[i] && gpsSpeed > 2.0)    tamperAlert = true;
  }

  bool anyAlert = tiltAlert || tamperAlert || vibAlert;
  digitalWrite(BUZZER_PIN, anyAlert ? HIGH : LOW);
}

// =====================================================================
// ===  WiFi Connect  ==================================================
// =====================================================================
void connectWiFi() {
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  lcd.clear();
  lcd.setCursor(0, 0); lcd.print("CARGO TRACK SYSTEM  ");
  lcd.setCursor(0, 1); lcd.print("T. Tivavone         ");
  lcd.setCursor(0, 2); lcd.print("WiFi Connecting...  ");

  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 20) {
    delay(500);
    tries++;
  }
  wifiOK = (WiFi.status() == WL_CONNECTED);

  lcd.setCursor(0, 2);
  lcd.print(wifiOK ? "WiFi: Connected     " : "WiFi: FAILED        ");
  if (wifiOK) {
    lcd.setCursor(0, 3);
    lcd.print(WiFi.localIP().toString());
  }
  delay(1500);
}

// =====================================================================
// ===  setup()  =======================================================
// =====================================================================
void setup() {
  Serial.begin(115200);
  delay(300);

  // ── I2C for LCD + MPU6050
  Wire.begin(21, 22);

  // ── LCD
  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcd.setCursor(0, 0); lcd.print("CARGO TRACK SYSTEM  ");
  lcd.setCursor(0, 1); lcd.print("By: T. Tivavone     ");
  lcd.setCursor(0, 2); lcd.print("Booting...          ");
  delay(1500);

  // ── Sensor pins
  pinMode(IR_SENSOR_1,  INPUT);
  pinMode(IR_SENSOR_2,  INPUT);
  pinMode(IR_SENSOR_3,  INPUT);
  pinMode(VIB_SENSOR_1, INPUT);
  pinMode(VIB_SENSOR_2, INPUT);
  pinMode(VIB_SENSOR_3, INPUT);
  // Reed switches — pulled high internally; LOW = closed (magnet), HIGH = open
  pinMode(REED_SENSOR_1, INPUT_PULLUP);
  pinMode(REED_SENSOR_2, INPUT_PULLUP);
  pinMode(REED_SENSOR_3, INPUT_PULLUP);
  // Buzzer
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  // ── MPU6050 raw I2C init (same as Nyararisai)
  mpuOK = mpuInit();
  lastFilterMs = millis();   // seed filter timer before first read

  lcd.setCursor(0, 2);
  lcd.print(mpuOK ? "MPU6050 : OK        " : "MPU6050 : FAILED    ");
  if (!mpuOK) {
    Serial.println("[MPU6050] Init FAILED — check wiring / I2C address.");
  } else {
    Serial.println("[MPU6050] Init OK.");
  }
  delay(800);

  // ── GPS UART2
  gpsSerial.begin(9600, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
  Serial.println("[GPS] NEO-6M started on UART2.");
  lcd.setCursor(0, 2); lcd.print("GPS: Initialised    ");
  delay(600);

  // ── WiFi
  connectWiFi();

  // ── Firebase (same init style as Nyararisai: anonymous sign-up)
  if (wifiOK) {
    config.api_key      = FIREBASE_API_KEY;
    config.database_url = FIREBASE_DB_URL;
    config.token_status_callback = tokenStatusCallback;
    Firebase.signUp(&config, &auth, "", "");
    Firebase.begin(&config, &auth);
    Firebase.reconnectWiFi(true);
    fbdo.setResponseSize(4096);
    Serial.println("[Firebase] Initialised.");
  }

  lcd.clear();
  lcd.setCursor(0, 0); lcd.print("CARGO TRACK SYSTEM  ");
  lcd.setCursor(0, 1); lcd.print("T. Tivavone         ");
  lcd.setCursor(0, 2); lcd.print(wifiOK ? "WiFi : OK           " : "WiFi : OFFLINE      ");
  lcd.setCursor(0, 3); lcd.print(mpuOK  ? "MPU  : OK           " : "MPU  : FAILED       ");
  delay(1500);

  lastFirebaseMs = millis();
  lastLcdMs      = millis();
  lastSerialMs   = millis();
  lastPageMs     = millis();

  Serial.println("[SYSTEM] Boot complete.");
}

// =====================================================================
// ===  loop()  =========================================================
// =====================================================================
void loop() {
  unsigned long now = millis();

  // ── WiFi watchdog (same as Nyararisai)
  wifiOK = (WiFi.status() == WL_CONNECTED);
  if (!wifiOK) WiFi.reconnect();

  // ── Read all sensors every loop tick
  readIMU();           // MPU6050 raw I2C + complementary filter
  readShelfSensors();  // IR + vibration + reed switches
  readGPS();           // NEO-6M
  updateBuzzer();      // pin 14 — ON when tilt / tamper / vibration alert

  // ── Firebase push every FIREBASE_INTERVAL_MS
  if (now - lastFirebaseMs >= FIREBASE_INTERVAL_MS) {
    lastFirebaseMs = now;
    pushToFirebase();
  }

  // ── LCD refresh every LCD_INTERVAL_MS
  if (now - lastLcdMs >= LCD_INTERVAL_MS) {
    lastLcdMs = now;
    updateLCD();
  }

  // ── Serial debug every SERIAL_INTERVAL_MS
  if (now - lastSerialMs >= SERIAL_INTERVAL_MS) {
    lastSerialMs = now;
    printSerialDebug();
  }
}
