-- Power supply wiring
INSERT OR REPLACE INTO knowledge (id, topic, keywords, content)
VALUES (
  'power_supply',
  'power',
  '["power","VDD","VDDA","VSS","decoupling","capacitor","3.3V","regulator","AMS1117","LDO","voltage"]',
  'STM32F103C8T6 power wiring: VDD pins (pins 1, 24, 36, 48) connect to 3.3V. VSS pins (pins 23, 35, 47) connect to GND. VDDA (pin 9) to 3.3V, VSSA (pin 8) to GND. Place 100nF ceramic decoupling capacitor as close as possible to EACH VDD/VSS pair. VDDA needs both 1uF and 100nF capacitors. If powering from 5V (USB or battery), use a 3.3V LDO regulator (AMS1117-3.3 is common). Add a 10uF bulk capacitor on the 3.3V rail. Operating range is 2.0-3.6V, typical 3.3V. Never apply 5V directly to VDD — it will damage the chip.'
);

-- Reset circuit
INSERT OR REPLACE INTO knowledge (id, topic, keywords, content)
VALUES (
  'reset_circuit',
  'reset',
  '["reset","NRST","button","circuit","pull-up","startup"]',
  'STM32F103C8T6 reset circuit: NRST pin (pin 7) has an internal pull-up but the datasheet recommends an external 10k pull-up resistor to 3.3V and a 100nF capacitor to GND for noise filtering. Optional: add a tactile push button between NRST and GND for manual reset. The chip resets when NRST is pulled low. After reset, the chip starts executing from the address defined by BOOT0/BOOT1 pin state.'
);

-- Boot mode selection
INSERT OR REPLACE INTO knowledge (id, topic, keywords, content)
VALUES (
  'boot_modes',
  'boot',
  '["boot","BOOT0","BOOT1","bootloader","DFU","mode","jumper","header","flash","system memory","SRAM"]',
  'STM32F103C8T6 boot modes are selected by BOOT0 (pin 44) and BOOT1 (pin 20) at reset. BOOT0=0, BOOT1=x: boot from Flash (normal operation). BOOT0=1, BOOT1=0: boot from System Memory (built-in UART bootloader). BOOT0=1, BOOT1=1: boot from SRAM (for debugging). To use the bootloader: add a 2-pin header or jumper on BOOT0. Connect one side to BOOT0, other to 3.3V. A 10k pull-down resistor on BOOT0 ensures it defaults to Flash boot. To enter bootloader: place jumper (BOOT0=high), press reset, then remove jumper after programming.'
);

-- UART bootloader programming
INSERT OR REPLACE INTO knowledge (id, topic, keywords, content)
VALUES (
  'uart_bootloader',
  'programming',
  '["UART","bootloader","serial","program","flash","STM32CubeProgrammer","stm32flash","USART1","FTDI","USB-to-serial"]',
  'The STM32F103C8T6 system memory contains a factory-programmed UART bootloader on USART1 (PA9=TX, PA10=RX). To use it: set BOOT0=1, BOOT1=0, reset the chip. Connect a USB-to-serial adapter (FTDI, CP2102, CH340): adapter TX to PA10 (STM32 RX), adapter RX to PA9 (STM32 TX), share GND. Program with STM32CubeProgrammer or stm32flash. Important: the STM32F103 system bootloader does NOT support USB DFU natively — only USART1. For USB DFU, you must first flash a custom bootloader (like STM32duino bootloader) via ST-Link or UART.'
);

-- USB DFU bootloader
INSERT OR REPLACE INTO knowledge (id, topic, keywords, content)
VALUES (
  'usb_dfu',
  'programming',
  '["USB","DFU","bootloader","STM32duino","maple","firmware","upload","program"]',
  'USB DFU on STM32F103C8T6 requires a custom bootloader — the factory system bootloader only supports UART, not USB. The STM32duino/Maple bootloader is the most common. To set up: (1) Flash the bootloader binary via ST-Link or UART first. (2) The bootloader occupies the first 8KB of Flash (0x08000000-0x08001FFF). (3) Your application must be compiled with offset 0x08002000. (4) After flashing, the chip enumerates as a DFU device on USB when BOOT0 jumper is set or a magic sequence is sent. (5) Use dfu-util or STM32CubeProgrammer to upload firmware over USB. Note: this uses 8KB of your 64KB Flash for the bootloader.'
);

-- ST-Link programming
INSERT OR REPLACE INTO knowledge (id, topic, keywords, content)
VALUES (
  'stlink_programming',
  'programming',
  '["ST-Link","SWD","SWDIO","SWCLK","debug","program","flash","JTAG","probe","V2","V3"]',
  'ST-Link uses SWD (Serial Wire Debug) to program and debug the STM32F103C8T6. Wiring: ST-Link SWDIO to PA13 (pin 34), ST-Link SWCLK to PA14 (pin 37), ST-Link GND to STM32 GND. Optionally connect ST-Link 3.3V to power the board. PA13 and PA14 are dedicated SWD pins — they default to SWD mode on reset. You can reclaim them as GPIO in CubeMX but you will lose SWD access until next reset with BOOT0=1. A 4-pin header (3.3V, SWDIO, SWCLK, GND) is the standard debug connector. ST-Link V2 clones work fine. No boot jumper needed — ST-Link can program directly.'
);

-- USB hardware circuit
INSERT OR REPLACE INTO knowledge (id, topic, keywords, content)
VALUES (
  'usb_circuit',
  'USB',
  '["USB","circuit","D+","D-","pull-up","resistor","ESD","protection","USBLC6","TVS","connector","wiring"]',
  'STM32F103C8T6 USB hardware circuit: PA12 (USB D+, pin 33), PA11 (USB D-, pin 32). Required: 1.5k ohm pull-up resistor from D+ (PA12) to 3.3V — this signals full-speed USB device to the host. Recommended: 22 ohm series resistors on both D+ and D- lines (close to MCU) for impedance matching. ESD protection: place a USBLC6-2SC6 (or equivalent TVS diode array) on D+/D- as close to the USB connector as possible. The USBLC6-2SC6 clamps ESD to safe levels without affecting signal integrity. USB and CAN share PA11/PA12 — cannot use both simultaneously. Blue Pill boards often have an incorrect 10k pull-up instead of 1.5k — replace R10 with 1.5k for reliable enumeration.'
);

-- Crystal/HSE setup
INSERT OR REPLACE INTO knowledge (id, topic, keywords, content)
VALUES (
  'crystal_hse',
  'clock',
  '["crystal","oscillator","HSE","8MHz","clock","external","capacitor","load","startup"]',
  'STM32F103C8T6 external crystal (HSE): 8MHz crystal between OSC_IN (pin 5) and OSC_OUT (pin 6). Load capacitors: typically 20pF on each pin to GND (check crystal datasheet — formula: CL = (C1*C2)/(C1+C2) + Cstray). The 8MHz HSE feeds the PLL which multiplies to 72MHz (x9). Without an external crystal, the internal 8MHz HSI oscillator can be used but is less accurate (not suitable for USB which requires +/-0.25% accuracy). Blue Pill boards include an 8MHz crystal. For custom boards, place the crystal and caps as close to pins 5/6 as possible with short traces and a ground pour underneath.'
);

-- Minimum viable circuit
INSERT OR REPLACE INTO knowledge (id, topic, keywords, content)
VALUES (
  'minimum_circuit',
  'general',
  '["minimum","circuit","schematic","bare","chip","custom","board","PCB","wiring","essential","setup","alive"]',
  'Minimum circuit to get STM32F103C8T6 running: (1) Power: 3.3V to all VDD/VDDA pins, GND to all VSS/VSSA pins, 100nF cap on each VDD-VSS pair, 1uF+100nF on VDDA. (2) Reset: 10k pull-up + 100nF cap on NRST. (3) Boot: 10k pull-down on BOOT0 (with jumper header to 3.3V for bootloader access). (4) Clock: 8MHz crystal + 2x 20pF caps on OSC_IN/OSC_OUT (optional if using HSI). (5) Debug: 4-pin SWD header (3.3V, SWDIO=PA13, SWCLK=PA14, GND). (6) Optional USB: 1.5k pull-up on D+ (PA12), 22 ohm series resistors, USBLC6 ESD protection. This is everything needed for a working custom board.'
);

-- SWD debug header device pattern
INSERT OR REPLACE INTO device_patterns (id, device_name, device_type, interface_type, default_pins, requirements, notes, keywords)
VALUES (
  'stlink-swd',
  'ST-Link V2 (SWD)',
  'Programmer/Debugger',
  'SWD',
  '{"SWDIO": "PA13", "SWCLK": "PA14"}',
  'ST-Link V2 or V3 programmer, 4-pin header recommended',
  'Connect ST-Link SWDIO to PA13, SWCLK to PA14, GND to GND. Can optionally supply 3.3V from ST-Link. No BOOT0 jumper needed for programming. PA13/PA14 default to SWD after reset. Works with STM32CubeProgrammer, OpenOCD, and pyOCD.',
  'ST-Link SWD SWDIO SWCLK debug program flash probe V2 V3 JTAG programmer'
);

-- USB connector device pattern
INSERT OR REPLACE INTO device_patterns (id, device_name, device_type, interface_type, default_pins, requirements, notes, keywords)
VALUES (
  'usb-connector',
  'USB Connector (Micro-B/Type-C)',
  'Connector',
  'USB',
  '{"USB_DP": "PA12", "USB_DM": "PA11"}',
  '1.5k pull-up resistor on D+ to 3.3V, 22 ohm series resistors on D+/D- recommended, USBLC6-2SC6 ESD protection recommended',
  'PA12 is USB D+ (needs 1.5k pull-up to 3.3V for full-speed enumeration). PA11 is USB D-. Place ESD protection (USBLC6-2SC6) close to connector. Blue Pill R10 is often wrong value (10k) — replace with 1.5k. Shares pins with CAN. For USB DFU programming, a custom bootloader must be flashed first via ST-Link or UART.',
  'USB connector micro type-C D+ D- pull-up ESD protection USBLC6 enumeration DFU'
);
