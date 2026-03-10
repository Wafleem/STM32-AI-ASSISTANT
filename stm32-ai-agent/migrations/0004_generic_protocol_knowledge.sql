-- Migration: Add generic protocol connection guides and broader device knowledge
-- These chunks help the AI give useful advice for parts not explicitly in device_patterns

INSERT OR IGNORE INTO knowledge (id, topic, keywords, content) VALUES

-- Generic I2C connection guide
('i2c_generic_connection', 'I2C', 'i2c connect wire sensor module any unknown generic how to hookup setup',
'Generic I2C device connection guide for STM32F103C8T6: Any I2C device needs just 4 wires: VCC (check if 3.3V or 5V), GND, SDA (data), SCL (clock). Use I2C1 by default: PB6 (SCL) and PB7 (SDA). Can remap to PB8/PB9. I2C2 is PB10 (SCL) and PB11 (SDA) but conflicts with USART3. Pull-up resistors (4.7k typical) are required on SDA and SCL unless the breakout board includes them. Most Chinese breakout modules include pull-ups. Multiple I2C devices can share the same bus if they have different addresses. Common I2C addresses: 0x68 (MPU6050, DS3231), 0x76/0x77 (BMP280/BME280), 0x3C/0x3D (OLED SSD1306), 0x48-0x4F (ADS1115), 0x20-0x27 (PCF8574). Scan for devices using an I2C scanner sketch.'),

-- Generic SPI connection guide
('spi_generic_connection', 'SPI', 'spi connect wire sensor module any unknown generic how to hookup setup',
'Generic SPI device connection guide for STM32F103C8T6: Any SPI device needs 4+ wires: VCC, GND, SCK (clock), MOSI (data to device), MISO (data from device), and CS/SS (chip select, one per device). Use SPI1 by default: PA5 (SCK), PA6 (MISO), PA7 (MOSI), PA4 (CS). SPI2: PB13 (SCK), PB14 (MISO), PB15 (MOSI), PB12 (CS). CS pin can be any GPIO. Multiple SPI devices share SCK/MOSI/MISO but each needs its own CS pin. SPI is faster than I2C (up to 18Mbit/s on SPI1) but uses more pins. Some devices are SPI-only (SD cards, most TFT displays, NRF24L01). SPI modes (CPOL/CPHA) must match the device datasheet. Most devices use Mode 0 (CPOL=0, CPHA=0).'),

-- Generic UART connection guide
('uart_generic_connection', 'USART', 'uart usart serial connect wire module any unknown generic how to hookup setup tx rx',
'Generic UART/serial device connection guide for STM32F103C8T6: Any UART device needs 3-4 wires: VCC, GND, TX, RX. CRITICAL: Cross TX/RX lines — STM32 TX connects to device RX, STM32 RX connects to device TX. Use USART1 by default: PA9 (TX), PA10 (RX). USART2: PA2 (TX), PA3 (RX). USART3: PB10 (TX), PB11 (RX) but conflicts with I2C2. Common baud rate: 9600 for GPS and Bluetooth, 115200 for debug and ESP modules. IMPORTANT: STM32F103C8T6 runs at 3.3V logic. If the UART device uses 5V logic, you need a voltage divider on the STM32 RX pin (two resistors, e.g., 1k and 2k) or a level shifter. The TX pin is usually fine since 3.3V is read as HIGH by most 5V devices.'),

-- Generic analog sensor guide
('analog_generic_connection', 'ADC', 'analog sensor adc connect wire any unknown generic potentiometer thermistor ldr voltage',
'Generic analog sensor connection guide for STM32F103C8T6: Analog sensors output a variable voltage that the ADC reads. ADC-capable pins: PA0-PA7 (channels 0-7), PB0-PB1 (channels 8-9). IMPORTANT: These pins are NOT 5V tolerant — max input voltage is 3.3V. ADC resolution is 12-bit (0-4095 maps to 0-3.3V). Most analog sensors need a voltage divider or are wired as part of one. Common patterns: thermistor/LDR with fixed resistor forming a divider, potentiometer wiper to ADC pin, analog output sensors directly to ADC. For 5V analog sensors, use a resistor divider to bring the output below 3.3V. Two ADC peripherals (ADC1, ADC2) can run simultaneously for faster sampling.'),

-- Generic one-wire / digital sensor guide
('onewire_generic_connection', 'GPIO', 'onewire 1wire digital sensor dht ds18b20 temperature humidity connect wire generic',
'Generic one-wire and digital sensor connection guide for STM32F103C8T6: Some sensors use proprietary single-wire protocols (not I2C/SPI/UART). DS18B20 temperature sensor: uses Dallas 1-Wire protocol, needs a 4.7k pull-up resistor on the data line, any GPIO pin works (commonly PA0 or PB0). Multiple DS18B20 can share one data pin. DHT11/DHT22 humidity+temperature: uses custom single-wire protocol, needs a 10k pull-up on data pin, any GPIO works. HC-SR04 ultrasonic: uses TRIG (any GPIO output) and ECHO (any GPIO input, must be 5V tolerant — use PA8-PA15 or PB2-PB15). WS2812B/NeoPixel LEDs: need a data pin with precise timing, use a timer output pin like PA0 or PA8.'),

-- PWM / motor / servo guide
('pwm_generic_connection', 'Timer', 'pwm motor servo esc fan speed control led dimming connect wire generic',
'Generic PWM output guide for STM32F103C8T6: PWM is used for servo control, motor speed (via ESC or H-bridge), LED dimming, and fan speed. PWM-capable pins are on timer channels: TIM1 (PA8-PA11), TIM2 (PA0-PA3), TIM3 (PA6-PA7, PB0-PB1), TIM4 (PB6-PB9). Servos need 50Hz PWM with 1-2ms pulse width — connect signal wire to any timer pin, VCC to 5V (external supply for multiple servos), GND to common ground. DC motors need an H-bridge driver (L298N, DRV8833, TB6612) — connect PWM to enable pin, direction pins to any GPIO. ESCs accept standard servo PWM signals. IMPORTANT: never drive motors directly from GPIO pins — max GPIO current is 25mA.'),

-- Level shifting and voltage compatibility
('voltage_compatibility', 'GPIO', 'voltage level shifting 5v 3.3v tolerant compatible logic converter',
'Voltage compatibility guide for STM32F103C8T6: The chip runs at 3.3V logic. 5V tolerant pins (can safely receive 5V input): PA8-PA15, PB2-PB4, PB6-PB15. NOT 5V tolerant (damage risk above 3.3V): PA0-PA7, PB0-PB1, PC13-PC15. For 5V devices on non-tolerant pins: use a voltage divider (e.g., 1k + 2k resistors) or a bidirectional level shifter module. For I2C with 5V devices: pull-ups to 3.3V work since I2C is open-drain. For SPI/UART with 5V devices: level shifter recommended on MISO/RX lines. Most 5V devices accept 3.3V as logic HIGH, so STM32 output pins usually work without level shifting.'),

-- Common IMU/motion sensors (broader than just MPU6050)
('imu_sensors_general', 'Sensors', 'imu accelerometer gyroscope magnetometer motion mpu6050 mpu9250 lsm6ds3 bmi160 icm20948 adxl345 lis3dh bno055',
'IMU and motion sensors compatible with STM32F103C8T6: Most IMUs use I2C or SPI. Common models: MPU6050 (6-axis, I2C 0x68/0x69), MPU9250 (9-axis, I2C/SPI), ICM-20948 (9-axis, I2C/SPI, successor to MPU9250), LSM6DS3 (6-axis, I2C 0x6A/0x6B or SPI), BMI160 (6-axis, I2C 0x68/0x69 or SPI), ADXL345 (3-axis accel, I2C 0x53 or SPI), LIS3DH (3-axis accel, I2C 0x18/0x19 or SPI), BNO055 (9-axis with sensor fusion, I2C 0x28/0x29). All can connect via I2C1 (PB6 SCL, PB7 SDA) with pull-ups. For SPI connection, use SPI1 (PA5 SCK, PA6 MISO, PA7 MOSI) plus a CS pin. Most breakout boards are 3.3V compatible and include pull-ups.'),

-- Common environmental sensors
('environmental_sensors_general', 'Sensors', 'temperature humidity pressure barometer bmp280 bme280 bme680 dht11 dht22 sht31 si7021 htu21d aht20 lm35 tmp36',
'Environmental sensors compatible with STM32F103C8T6: Temperature/pressure I2C: BMP280 (0x76/0x77), BME280 (adds humidity, 0x76/0x77), BME680 (adds gas, 0x76/0x77), MS5611 (0x77). Temperature/humidity I2C: SHT31 (0x44/0x45), SI7021/HTU21D (0x40), AHT20 (0x38). Digital single-wire: DHT11 (basic, any GPIO + 10k pull-up), DHT22/AM2302 (better accuracy, same wiring). Analog: LM35/TMP36 (voltage output to ADC pin, NOT 5V tolerant pins), thermistors (need voltage divider with known resistor). All I2C sensors connect to PB6/PB7 with pull-ups. Multiple I2C sensors with different addresses can share the same bus.'),

-- Common wireless/radio modules
('wireless_modules_general', 'Sensors', 'wireless radio wifi bluetooth ble lora nrf24l01 esp8266 esp32 hc05 hc06 rfm95 rfm69 sx1276 cc1101 xbee zigbee',
'Wireless modules compatible with STM32F103C8T6: SPI radio: NRF24L01 (2.4GHz, SPI1 + CE + CS pins, 3.3V only), RFM69/RFM95/SX1276 LoRa (SPI + CS + RST + DIO0 pins), CC1101 (sub-GHz, SPI). UART modules: HC-05/HC-06 Bluetooth Classic (USART1 PA9/PA10, 9600 baud default), HM-10 BLE (UART, 9600 baud), ESP8266 WiFi (UART 115200 baud, needs 3.3V power — NOT from STM32 3.3V pin, use separate regulator), GPS NEO-6M/7M/8M (UART 9600 baud). SPI modules need 3.3V — NRF24L01 is especially sensitive to clean power (add 10uF capacitor near VCC). For ESP8266: TX/RX crossover, CH_PD to 3.3V, GPIO0 high for normal mode.'),

-- Common display modules
('display_modules_general', 'Sensors', 'display oled lcd tft screen ssd1306 st7735 ili9341 hd44780 nokia 5110 pcd8544 max7219 seven segment',
'Display modules compatible with STM32F103C8T6: I2C OLED: SSD1306 0.96"/1.3" (I2C 0x3C/0x3D, PB6/PB7, very common). SPI OLED: SSD1306 SPI variant (faster, uses SPI1 + DC + CS + RST pins). SPI TFT: ST7735 1.8" (SPI1 + DC + CS + RST), ILI9341 2.4"+ (SPI1, fast with DMA). Parallel LCD: HD44780 16x2 (needs 6+ GPIO pins, consider I2C adapter PCF8574 to use just 2 pins). SPI LED matrix: MAX7219 (SPI1 + CS, chainable). Nokia 5110/PCD8544 (SPI + DC + CS + RST). For SPI displays, use SPI1 (PA5/PA6/PA7) for maximum speed. DC (data/command) and RST can be any GPIO.'),

-- Power supply and external power guidance
('external_power_guide', 'Power', 'power supply battery voltage regulator current draw motor servo multiple devices external',
'Power guide for STM32F103C8T6 projects: The Blue Pill board has a 3.3V regulator (usually AMS1117, max ~800mA). The STM32 itself draws ~50mA. Budget: ~300mA from the 3.3V pin for sensors. For higher power needs: servos and motors MUST use external 5V/6V supply with common GND to STM32. NRF24L01 needs clean 3.3V — add a 10uF capacitor or dedicated regulator. ESP8266 draws up to 300mA peaks — use a separate 3.3V regulator. WS2812B LEDs draw ~60mA each at full white — always use external 5V supply. Multiple I2C/SPI sensors typically draw <50mA total. USB provides 5V/500mA to the board. When using battery power, connect to the 5V pin (goes through the regulator) or directly to 3.3V pin if using a 3.3V regulated source.');
