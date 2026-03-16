-- CAN bus knowledge entries
INSERT OR REPLACE INTO knowledge (id, topic, keywords, content)
VALUES (
  'can_bus_overview',
  'CAN',
  '["CAN","CAN bus","bxCAN","controller area network","automotive","vehicle","transceiver"]',
  'The STM32F103C8T6 has a built-in bxCAN controller (Basic Extended CAN) supporting CAN 2.0A and 2.0B. Pins: PA11 (CAN_RX), PA12 (CAN_TX). Requires an external CAN transceiver (MCP2551 or SN65HVD230) between the MCU and the CAN bus. The transceiver converts 3.3V logic to differential CANH/CANL signals. The bus needs 120 ohm termination resistors at each end. CAN and USB share PA11/PA12 — they cannot be used simultaneously.'
);

INSERT OR REPLACE INTO knowledge (id, topic, keywords, content)
VALUES (
  'can_motor_control',
  'CAN',
  '["CAN","motor","actuator","command","robotics","servo","drive","controller","velocity","position","torque"]',
  'CAN-controlled motors (common in robotics and automotive) receive commands as CAN frames. Typical protocol: send a CAN message with a specific arbitration ID (e.g. 0x200) and a data payload encoding the desired position, velocity, or torque. Common CAN motor controllers include ODrive, VESC, Cytron, RoboteQ, and industrial servo drives. Most use 1 Mbps CAN bus speed. To send a motor command from the STM32: configure CAN in CubeMX (1 Mbps, normal mode), then use HAL_CAN_AddTxMessage with the motor ID and command bytes. To receive feedback: set up a CAN RX filter for the motor status ID and use HAL_CAN_GetRxMessage.'
);

INSERT OR REPLACE INTO knowledge (id, topic, keywords, content)
VALUES (
  'can_frame_format',
  'CAN',
  '["CAN","frame","message","arbitration","ID","data","payload","standard","extended"]',
  'A CAN frame has an arbitration ID (11-bit standard or 29-bit extended) and 0-8 bytes of data. Lower IDs have higher priority on the bus. Motor commands typically use standard 11-bit IDs. Example: sending velocity command 0x01F4 (500) to motor at ID 0x200 — the 8-byte payload might be [0x00, 0x00, 0x01, 0xF4, 0x00, 0x00, 0x00, 0x00] depending on the motor protocol. Always check the motor controller datasheet for the exact frame format.'
);

-- CAN motor device pattern
INSERT OR REPLACE INTO device_patterns (id, device_name, device_type, interface_type, default_pins, requirements, notes, keywords)
VALUES (
  'can-motor',
  'CAN Motor Controller',
  'Motor/Actuator',
  'CAN',
  '{"CAN_RX": "PA11", "CAN_TX": "PA12"}',
  'External CAN transceiver (MCP2551 or SN65HVD230), 120 ohm termination resistor at each bus end, common ground between all nodes',
  'Connect STM32 PA11/PA12 to transceiver RXD/TXD pins. Transceiver CANH/CANL connect to motor controller CANH/CANL. Configure CAN in CubeMX: prescaler for 1 Mbps (APB1=36MHz, prescaler=4, BS1=6, BS2=2), normal mode. Use HAL_CAN_AddTxMessage to send position/velocity/torque commands. Cannot use USB simultaneously.',
  'CAN motor actuator servo drive robotics ODrive VESC controller command velocity position torque automotive'
);

-- CAN transceiver device pattern
INSERT OR REPLACE INTO device_patterns (id, device_name, device_type, interface_type, default_pins, requirements, notes, keywords)
VALUES (
  'can-transceiver',
  'CAN Transceiver (MCP2551/SN65HVD230)',
  'Interface IC',
  'CAN',
  '{"CAN_RX": "PA11", "CAN_TX": "PA12"}',
  '120 ohm termination resistor between CANH and CANL at each end of the bus',
  'Wiring: STM32 PA12 (CAN_TX) to transceiver TXD, STM32 PA11 (CAN_RX) to transceiver RXD. Transceiver VCC to 3.3V (SN65HVD230) or 5V (MCP2551). CANH and CANL go to the CAN bus. The SN65HVD230 is 3.3V native and preferred for STM32. Cannot use USB simultaneously as they share PA11/PA12.',
  'CAN transceiver MCP2551 SN65HVD230 bus driver interface automotive'
);
