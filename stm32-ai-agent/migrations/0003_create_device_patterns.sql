-- Migration: Create device patterns reference database
-- Created: 2025-12-31

CREATE TABLE IF NOT EXISTS device_patterns (
  id TEXT PRIMARY KEY,
  device_name TEXT NOT NULL,
  device_type TEXT NOT NULL,
  interface_type TEXT NOT NULL,
  default_pins TEXT NOT NULL,
  requirements TEXT,
  notes TEXT,
  keywords TEXT
);

CREATE INDEX IF NOT EXISTS idx_device_name ON device_patterns(device_name);
CREATE INDEX IF NOT EXISTS idx_keywords ON device_patterns(keywords);

-- Common I2C devices
INSERT INTO device_patterns (id, device_name, device_type, interface_type, default_pins, requirements, notes, keywords) VALUES
('mpu6050', 'MPU6050', 'Gyroscope/Accelerometer', 'I2C', '{"SCL": "PB6", "SDA": "PB7"}', '4.7k pull-up resistors on SCL and SDA', '3.3V or 5V compatible. I2C address: 0x68 or 0x69. Can remap to PB8/PB9.', 'MPU6050 GY-521 gyro accelerometer motion IMU'),
('bmp280', 'BMP280', 'Pressure/Temperature Sensor', 'I2C', '{"SCL": "PB6", "SDA": "PB7"}', '4.7k pull-up resistors on SCL and SDA', '3.3V compatible. I2C address: 0x76 or 0x77. Also supports SPI.', 'BMP280 pressure temperature barometer sensor'),
('oled-i2c', 'OLED Display (I2C)', 'Display', 'I2C', '{"SCL": "PB6", "SDA": "PB7"}', '4.7k pull-up resistors recommended', 'Common sizes: 0.96", 1.3". I2C address usually 0x3C or 0x3D.', 'OLED SSD1306 display screen I2C'),
('ds3231', 'DS3231', 'RTC', 'I2C', '{"SCL": "PB6", "SDA": "PB7"}', '4.7k pull-up resistors on SCL and SDA', 'I2C address: 0x68. 3.3V compatible.', 'DS3231 RTC real-time clock'),

-- Common SPI devices
('sd-card', 'SD Card', 'Storage', 'SPI', '{"SCK": "PA5", "MISO": "PA6", "MOSI": "PA7", "CS": "PA4"}', 'None', 'Use 3.3V. CS pin can be any GPIO. Fast SPI mode supported.', 'SD card storage SPI microSD'),
('nrf24l01', 'nRF24L01', 'Wireless Transceiver', 'SPI', '{"SCK": "PA5", "MISO": "PA6", "MOSI": "PA7", "CS": "PA4", "CE": "PB0"}', 'None', '3.3V only. CE and CS pins can be any GPIO.', 'nRF24L01 wireless radio transceiver SPI'),

-- Common UART devices
('xbee', 'XBee', 'Wireless Module', 'UART', '{"TX": "PA9", "RX": "PA10"}', 'None', '3.3V logic levels. Connect XBee TX to STM32 RX and vice versa.', 'XBee zigbee wireless UART serial'),
('hc05', 'HC-05', 'Bluetooth Module', 'UART', '{"TX": "PA9", "RX": "PA10"}', 'Voltage divider for RX (5V to 3.3V)', 'Module runs at 5V but TX is 3.3V compatible. RX needs voltage divider.', 'HC-05 HC05 bluetooth serial UART'),
('gps', 'GPS Module', 'GPS Receiver', 'UART', '{"TX": "PA9", "RX": "PA10"}', 'None', 'Most GPS modules are 3.3V compatible. Common: NEO-6M, NEO-7M.', 'GPS NEO-6M NEO-7M location UART serial'),

-- Common GPIO devices
('led', 'LED', 'Output', 'GPIO', '{"LED": "PA1"}', '220-330 ohm current-limiting resistor', 'Any GPIO pin works. Choose 5V-tolerant pins for flexibility.', 'LED light output GPIO'),
('button', 'Button', 'Input', 'GPIO', '{"BUTTON": "PB0"}', '10k pull-up or pull-down resistor', 'Any GPIO pin works. Enable internal pull-up/pull-down in code.', 'button switch input GPIO'),
('relay', 'Relay Module', 'Output', 'GPIO', '{"RELAY": "PB1"}', 'None', 'Most relay modules have optoisolation. Any GPIO works.', 'relay switch output GPIO'),

-- Common Analog devices
('potentiometer', 'Potentiometer', 'Analog Input', 'ADC', '{"ADC": "PA0"}', 'None', 'Use ADC-capable pins: PA0-PA7, PB0-PB1. Not 5V tolerant.', 'potentiometer pot variable resistor analog ADC'),
('ldr', 'LDR (Light Sensor)', 'Analog Input', 'ADC', '{"ADC": "PA0"}', '10k resistor for voltage divider', 'Use ADC pins. Create voltage divider with 10k resistor.', 'LDR photoresistor light sensor analog ADC');
