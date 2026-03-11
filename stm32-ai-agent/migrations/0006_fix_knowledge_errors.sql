-- Migration: Fix verified errors in knowledge chunks
-- 1. PB5 missing from NOT-5V-tolerant list in voltage_compatibility
-- 2. PB5 incorrectly included in 5V-tolerant range in onewire_generic_connection
-- 3. Wrong chip model for DAC availability in dac_alternatives

-- Fix 1: voltage_compatibility - add PB5 to the NOT 5V tolerant list
UPDATE knowledge SET content = 'Voltage compatibility guide for STM32F103C8T6: The chip runs at 3.3V logic. 5V tolerant pins (can safely receive 5V input): PA8-PA15, PB2-PB4, PB6-PB15. NOT 5V tolerant (damage risk above 3.3V): PA0-PA7, PB0-PB1, PB5, PC13-PC15. For 5V devices on non-tolerant pins: use a voltage divider (e.g., 1k + 2k resistors) or a bidirectional level shifter module. For I2C with 5V devices: pull-ups to 3.3V work since I2C is open-drain. For SPI/UART with 5V devices: level shifter recommended on MISO/RX lines. Most 5V devices accept 3.3V as logic HIGH, so STM32 output pins usually work without level shifting.'
WHERE id = 'voltage_compatibility';

-- Fix 2: onewire_generic_connection - exclude PB5 from 5V-tolerant range
UPDATE knowledge SET content = 'Generic one-wire and digital sensor connection guide for STM32F103C8T6: Some sensors use proprietary single-wire protocols (not I2C/SPI/UART). DS18B20 temperature sensor: uses Dallas 1-Wire protocol, needs a 4.7k pull-up resistor on the data line, any GPIO pin works (commonly PA0 or PB0). Multiple DS18B20 can share one data pin. DHT11/DHT22 humidity+temperature: uses custom single-wire protocol, needs a 10k pull-up on data pin, any GPIO works. HC-SR04 ultrasonic: uses TRIG (any GPIO output) and ECHO (any GPIO input, must be 5V tolerant — use PA8-PA15, PB2-PB4, or PB6-PB15, but NOT PB5). WS2812B/NeoPixel LEDs: need a data pin with precise timing, use a timer output pin like PA0 or PA8.'
WHERE id = 'onewire_generic_connection';

-- Fix 3: dac_alternatives - correct which chips have DAC
UPDATE knowledge SET content = 'DAC alternatives for STM32F103C8T6: This chip does NOT have a built-in DAC (only high-density STM32F103RC/RD/RE and connectivity-line STM32F105/F107 have one). Alternatives: PWM + RC filter: generate PWM on a timer pin, filter with an RC low-pass (e.g., 10k + 100nF for ~160Hz cutoff). Gives a pseudo-analog output good enough for LED dimming, simple audio, or slow control signals. Higher PWM frequency = smoother output. External DAC: MCP4725 (12-bit, I2C, 0x60-0x63) — single channel, easy to use, connect to PB6/PB7. MCP4728 (4-channel, I2C). MCP4922 (12-bit, dual, SPI). For audio: use I2S or SPI DAC like PCM5102 or MAX98357. R-2R resistor ladder: connect 8 GPIO pins through a resistor network for a quick 8-bit DAC (lower quality but no extra chip needed).'
WHERE id = 'dac_alternatives';
