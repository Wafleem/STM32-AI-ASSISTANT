-- LED wiring knowledge
INSERT OR REPLACE INTO knowledge (id, topic, keywords, content)
VALUES (
  'led_wiring',
  'GPIO',
  '["LED","blink","GPIO","output","resistor","current","limiting"]',
  'To blink an LED on the STM32F103C8T6: connect the LED anode through a 220-330 ohm current-limiting resistor to a GPIO pin (PA1 is a good default choice), and the cathode to GND. Configure the pin as GPIO_Output in CubeMX. In your while(1) loop, use HAL_GPIO_TogglePin(GPIOA, GPIO_PIN_1) and HAL_Delay(500) for a 1Hz blink. The onboard LED on Blue Pill boards is on PC13 (active low — LED lights when pin is LOW).'
);

-- LED device pattern
INSERT OR REPLACE INTO device_patterns (id, device_name, device_type, interface_type, default_pins, requirements, notes, keywords)
VALUES (
  'led',
  'LED',
  'Indicator',
  'GPIO',
  '{"GPIO_OUTPUT": "PA1"}',
  '220-330 ohm current-limiting resistor in series',
  'Connect LED anode through resistor to PA1, cathode to GND. Configure PA1 as GPIO_Output in CubeMX. Use HAL_GPIO_TogglePin(GPIOA, GPIO_PIN_1) with HAL_Delay to blink. Blue Pill onboard LED is on PC13 (active low).',
  'LED blink light indicator GPIO output resistor'
);
