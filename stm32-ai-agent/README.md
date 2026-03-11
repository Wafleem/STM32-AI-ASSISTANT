# STM32F103C8T6 AI Assistant

An intelligent chatbot assistant for the STM32F103C8T6 microcontroller (Blue Pill) that helps with pin configuration, device connections, and technical questions. Features AI-powered responses with RAG (Retrieval Augmented Generation), session management, and automatic pin allocation tracking.

## Features

### Core Capabilities
- **AI-Powered Assistance**: Uses Cloudflare Workers AI (Llama 3.1 8B) with RAG for accurate STM32F103C8T6 guidance
- **Pin Allocation Tracking**: Automatically tracks which pins are allocated to which devices across your session
- **Device Pattern Database**: Reference database of 25 common devices/modules with default pin configurations
- **Conversation Memory**: Maintains conversation history for contextual follow-up questions
- **Session Management**: Persistent sessions with localStorage for seamless user experience

### Smart Features
- **Semantic Search (RAG)**: Vector-based search via Cloudflare Vectorize finds relevant knowledge even without exact keyword matches
- **Function Calling**: Structured pin allocation using AI tool calls for reliability
- **Hardware Confirmation**: Asks for clarification before assuming specific breakout boards
- **Informational Question Detection**: Distinguishes between questions and connection requests
- **Conflict Prevention**: Prevents pin reuse and detects incomplete device connections
- **Visual Pin Sidebar**: Real-time display of pin allocations with device info and connection notes

## Architecture

### Backend (Cloudflare Workers)
- **Framework**: Hono v4.11.3
- **Runtime**: Cloudflare Workers (Edge computing)
- **Database**: Cloudflare D1 (SQLite)
- **AI**: Cloudflare Workers AI (@cf/meta/llama-3.1-8b-instruct)

### Frontend (React)
- **Framework**: React 19 with TypeScript
- **Build Tool**: Vite
- **Styling**: Custom CSS with dark theme
- **State Management**: React hooks + localStorage

## Knowledge Database

The core of this project is a hand-curated, datasheet-verified knowledge base stored in Cloudflare D1. Every fact has been cross-referenced against the official STM32F103C8T6 datasheet (DS5319 Rev 20) and reference manual. The database powers the AI's RAG pipeline via **Cloudflare Vectorize** for semantic search — so asking about a "gyroscope" finds MPU6050 results even without an exact keyword match.

**Database totals: 76 knowledge entries | 25 device patterns | 48 pin definitions**

### Knowledge Base (76 entries across 18 topics)

| Topic | Entries | What's Covered |
|---|---|---|
| **Sensors & Modules** | 14 | IMUs (MPU6050, MPU9250, ICM-20948, BNO055...), environmental sensors (BMP280, BME680, DHT22, SHT31...), distance sensors (HC-SR04, VL53L0X, Sharp IR), current sensors (INA219, ACS712), cameras (OV7670, ArduCAM), wireless (NRF24L01, ESP8266, HC-05, LoRa), displays (SSD1306, ILI9341, HD44780), EEPROM/flash storage, RTC modules, motor drivers (L298N, DRV8833, A4988, TMC2209) |
| **GPIO** | 9 | 5V tolerance map, current limits, output patterns (LEDs, relays, MOSFETs), input patterns (buttons, debouncing, interrupts), voltage level shifting, pin remapping (AFIO), JTAG/SWD pin release, one-wire protocols |
| **Timers** | 5 | TIM1-TIM4 channel mappings, PWM generation, input capture, TIM1 advanced features (complementary outputs, dead-time, break input), servo/motor/ESC control |
| **ADC** | 5 | 10 external channels (PA0-PA7, PB0-PB1), 12-bit resolution, clock configuration, analog sensor wiring, DAC alternatives (MCP4725, PWM+RC filter) |
| **I2C** | 4 | I2C1/I2C2 pin assignments, remapping, pull-up resistor sizing, generic connection guide with common device addresses |
| **SPI** | 4 | SPI1/SPI2 pins, 18MHz max clock, remap to JTAG pins, generic connection guide |
| **USART** | 4 | USART1-3 pins, baud rates, TX/RX crossover, 5V level shifting, generic connection guide |
| **Interrupts** | 3 | NVIC priority system, EXTI (external interrupts), practical ISR patterns |
| **Power** | 3 | Supply requirements, low-power modes, external power guide (batteries, motor supplies, regulator budgets) |
| **DMA** | 2 | Channel-to-peripheral assignments, practical usage (ADC+DMA, UART+DMA, SPI+DMA) |
| **CAN** | 2 | PA11/PA12 default, PB8/PB9 remap, transceiver wiring (SN65HVD230, MCP2551), USB conflict |
| **USB** | 2 | PA11 D-/PA12 D+, CDC/HID/MSC classes, Blue Pill pull-up resistor issue, DFU bootloader |
| **Watchdog** | 2 | IWDG and WWDG setup, timeout configuration, practical patterns |
| **Clock** | 2 | HSE/HSI/PLL configuration, 72MHz system clock, bus clock dividers |
| **Development** | 4 | SWD/JTAG programming, ST-Link wiring, project templates (data logger, motor control) |
| **Other** | 6 | Chip overview, memory map, boot modes, bus architecture, pin conflicts, common mistakes |

### Device Patterns (25 devices with default pin mappings)

Every device includes default pin assignments, wiring requirements, and notes. The AI uses these to automatically allocate pins when you ask to connect a device.

| Device | Type | Interface | Notes |
|---|---|---|---|
| MPU6050 | Gyroscope/Accelerometer | I2C | 0x68/0x69, 6-axis IMU |
| BMP280 | Pressure/Temperature | I2C | 0x76/0x77 |
| SSD1306 OLED | Display | I2C | 0x3C/0x3D, 0.96"/1.3" |
| SSD1306 SPI OLED | Display | SPI | Faster than I2C variant |
| ILI9341 | TFT Display (2.4"+) | SPI | 240x320 color, DMA-capable |
| DS3231 | RTC | I2C | 0x68, +/-2ppm accuracy |
| SD Card | Storage | SPI | SPI1, CS on PA4 |
| nRF24L01 | Wireless Transceiver | SPI | 2.4GHz, 3.3V only |
| HC-05 | Bluetooth | UART | 9600 baud default |
| XBee | Wireless Module | UART | |
| GPS Module | GPS Receiver | UART | 9600 baud |
| INA219 | Current/Power Sensor | I2C | 0x40, 26V max |
| ADS1115 | 16-bit External ADC | I2C | 0x48-0x4B |
| VL53L0X | Time-of-Flight Distance | I2C | 0x29, laser, up to 2m |
| HC-SR04 | Ultrasonic Distance | GPIO | 5V, needs voltage divider on ECHO |
| DHT22 | Temperature/Humidity | GPIO | Single-wire, 10k pull-up |
| WS2812B | Addressable LED Strip | GPIO | 5V, 60mA/LED at full white |
| MCP4725 | DAC | I2C | 0x60, 12-bit (chip has no built-in DAC) |
| PCA9685 | PWM/Servo Driver | I2C | 16 channels, 12-bit |
| A4988 | Stepper Motor Driver | GPIO | STEP+DIR, up to 2A |
| LED | Output | GPIO | 220-330 ohm resistor |
| Button | Input | GPIO | Internal pull-up |
| Relay Module | Output | GPIO | Active low |
| Potentiometer | Analog Input | ADC | |
| LDR | Light Sensor | ADC | Voltage divider |

### Pin Reference (all 48 LQFP48 pins)

Complete pin database parsed from the official datasheet, including:
- All alternate functions per pin (GPIO, timer channels, SPI, I2C, USART, CAN, USB, ADC, JTAG/SWD)
- 5V tolerance flags (PA8-PA15, PB2-PB4, PB6-PB15 are 5V tolerant; PA0-PA7, PB0-PB1, PB5, PC13-PC15 are NOT)
- Remap configurations (which AFIO register bits to set)
- Conflict notes (e.g., PB6/PB7 shared between I2C1 and TIM4)

### Semantic Search (Cloudflare Vectorize)

All 149 database rows are embedded as 768-dimensional vectors using `@cf/baai/bge-base-en-v1.5` and stored in a Cloudflare Vectorize index. This enables semantic search — the AI finds relevant knowledge even when the user's wording doesn't match exact keywords:

| User asks about... | Finds... |
|---|---|
| "gyroscope" | MPU6050, ICM-20948, BMI160 entries |
| "temperature sensor" | BMP280, DHT22, DS18B20, LM35 entries |
| "motor speed control" | PWM guide, L298N, DRV8833, TIM1 advanced features |
| "save data permanently" | EEPROM, SD card, internal flash entries |
| "wireless communication" | NRF24L01, ESP8266, HC-05, LoRa entries |

Falls back to keyword (`LIKE`) search if Vectorize is unavailable.

## Database Schema

<details>
<summary>Click to expand table schemas</summary>

### Sessions Table
```sql
CREATE TABLE sessions (
  session_id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  last_activity INTEGER NOT NULL,
  pin_allocations TEXT DEFAULT '{}',
  metadata TEXT DEFAULT '{}',
  conversation_history TEXT DEFAULT '[]'
);
```

### Pins Table
```sql
CREATE TABLE pins (
  pin TEXT PRIMARY KEY,
  port TEXT NOT NULL,
  number INTEGER,
  lqfp48 INTEGER NOT NULL,
  type TEXT NOT NULL,
  five_tolerant INTEGER NOT NULL,
  reset_state TEXT,
  functions TEXT,
  notes TEXT
);
```

### Knowledge Table
```sql
CREATE TABLE knowledge (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  keywords TEXT NOT NULL,
  content TEXT NOT NULL
);
```

### Device Patterns Table
```sql
CREATE TABLE device_patterns (
  id TEXT PRIMARY KEY,
  device_name TEXT NOT NULL,
  device_type TEXT NOT NULL,
  interface_type TEXT NOT NULL,
  default_pins TEXT NOT NULL,
  requirements TEXT,
  notes TEXT,
  keywords TEXT
);
```

</details>

## Setup

### Prerequisites
- Node.js 18+
- npm or yarn
- Cloudflare account with Workers and D1 access
- Wrangler CLI

### Backend Setup

1. **Install dependencies**
```bash
cd stm32-ai-agent
npm install
```

2. **Configure wrangler.toml**
Update with your D1 database ID and account details.

3. **Run migrations** (apply all files in `migrations/` in order)
```bash
# Local development
for f in ./migrations/0*.sql; do npx wrangler d1 execute stm32-pins-db --local --file="$f"; done

# Production
for f in ./migrations/0*.sql; do npx wrangler d1 execute stm32-pins-db --remote --file="$f"; done
```

4. **Deploy**
```bash
npx wrangler deploy
```

### Frontend Setup

1. **Install dependencies**
```bash
cd ../frontend
npm install
```

2. **Update API endpoint**
Edit `src/App.tsx` to point to your Worker URL if different from:
```
https://stm32-ai-agent.wafleem.workers.dev
```

3. **Build and deploy**
```bash
npm run build
npx wrangler pages deploy dist
```

## API Documentation

### POST /api/chat
Send a message and get AI response with pin allocations.

**Request:**
```json
{
  "message": "How do I connect an MPU6050?",
  "sessionId": "optional-session-id"
}
```

**Response:**
```json
{
  "response": "The MPU6050 is an I2C gyroscope/accelerometer...",
  "sessionId": "abc123...",
  "allocations": {
    "PB6": {
      "function": "SCL",
      "device": "MPU6050",
      "notes": "4.7k pull-up needed"
    },
    "PB7": {
      "function": "SDA",
      "device": "MPU6050",
      "notes": "4.7k pull-up needed"
    }
  },
  "sources": {
    "pins": [...],
    "knowledge": [...]
  }
}
```

### GET /api/session/:sessionId
Retrieve session data.

**Response:**
```json
{
  "sessionId": "abc123...",
  "createdAt": 1234567890,
  "lastActivity": 1234567890,
  "allocations": {...},
  "metadata": {...}
}
```

### DELETE /api/session/:sessionId/allocations/:pin
Remove a specific pin allocation.

**Response:**
```json
{
  "sessionId": "abc123...",
  "allocations": {...}
}
```

### DELETE /api/session/:sessionId/allocations
Clear all pin allocations for a session.

### DELETE /api/session/:sessionId
Delete entire session.

### GET /api/pins
Get all pins from reference database.

### GET /api/pins/:pin
Get specific pin information.

### GET /api/knowledge
Get all knowledge base entries.

### GET /api/knowledge/:topic
Get knowledge by topic.

## How It Works

### 1. RAG (Retrieval Augmented Generation)
When you ask a question, the system:
- Extracts keywords from your message
- Searches three databases in parallel:
  - **Pins database**: Pin-specific information
  - **Knowledge database**: General STM32 knowledge
  - **Device patterns database**: Common device connection patterns
- Injects relevant results into the AI's context
- AI generates response with accurate, grounded information

### 2. Function Calling for Pin Allocation
The AI uses a structured `allocate_pins` tool to register connections:

```typescript
allocate_pins({
  allocations: [
    {
      pin: "PB6",
      function: "SCL",
      device: "MPU6050",
      notes: "4.7k pull-up needed"
    }
  ]
})
```

**3-Tier Priority System:**
1. **Tool calls** (most reliable)
2. **Structured text blocks** (fallback)
3. **Regex parsing** (conservative fallback)

### 3. Session Management
- Sessions auto-created on first message
- Stored in D1 database with 1-hour timeout
- Automatic cleanup of old sessions
- Conversation history limited to last 100 messages (50 exchanges)
- AI sees last 30 messages for context

### 4. Smart Question Detection
Distinguishes between:
- **Informational questions**: "Which pins are 5V tolerant?" → No allocation
- **Connection requests**: "Connect an MPU6050" → Allocates pins

### 5. Hardware Confirmation Flow
1. User asks: "How do I connect an MPU6050?"
2. AI asks: "Are you using a GY-521 breakout board or different module?"
3. User confirms: "Yes, GY-521"
4. AI provides specific instructions and allocates pins

## Usage Examples

### Connecting a Sensor
```
User: How do I connect an MPU6050?
AI: The MPU6050 is an I2C gyroscope/accelerometer.
    Are you using a GY-521 breakout board or different module?

User: Yes, GY-521
AI: Great! For the GY-521 breakout board:
    - Connect VCC to 3.3V
    - Connect GND to GND
    - Connect SCL to PB6
    - Connect SDA to PB7
    - Add 4.7k pull-up resistors on SCL and SDA lines

    [Pins automatically allocated in sidebar]
```

### Checking Pin Capabilities
```
User: Which pins are 5V tolerant?
AI: The following pins are 5V tolerant:
    - PA8-PA15
    - PB2-PB4
    - PB6-PB15

    NOT 5V tolerant: PA0-PA7, PB0-PB1 (ADC pins)

    [No pins allocated - informational question]
```

### Follow-up Questions
```
User: What pins can I use for I2C?
AI: You can use I2C1 on PB6 (SCL) and PB7 (SDA)...

User: Can I use different pins?
AI: Yes, I2C1 can be remapped to PB8/PB9...
    [Remembers previous context about I2C]
```

## Development

### Local Development (Backend)
```bash
cd stm32-ai-agent
npx wrangler dev
```

### Local Development (Frontend)
```bash
cd frontend
npm run dev
```

### Type Checking
```bash
npx tsc --noEmit
```

### Database Operations
```bash
# List databases
npx wrangler d1 list

# Query database
npx wrangler d1 execute stm32-pins-db --command="SELECT * FROM sessions LIMIT 5"

# Backup database
npx wrangler d1 export stm32-pins-db --output=backup.sql
```

## Configuration

### Session Settings (src/sessions.ts)
```typescript
const CLEANUP_THRESHOLD = 24 * 60 * 60 * 1000; // 24 hours
```

### Message Limits
- **Stored per session**: 100 messages (50 exchanges)
- **Sent to AI**: 30 messages (15 exchanges)
- **AI max tokens**: 800 per response

### RAG Search Limits
- **Pin results**: 8 pins max
- **Knowledge results**: 5 entries max
- **Device patterns**: 3 devices max

## Project Structure

```
stm32-ai-agent/
├── stm32-ai-agent/              # Backend (Cloudflare Worker)
│   ├── src/
│   │   ├── index.ts             # Routes + wiring (entry point)
│   │   ├── types.ts             # Shared TypeScript interfaces (Bindings, PinRow, etc.)
│   │   ├── sessions.ts          # Session creation, cleanup, parseJSON helper
│   │   ├── search.ts            # RAG search (LIKE queries across pins/knowledge/devices)
│   │   └── prompts.ts           # System prompt builder, sensor question detection
│   ├── migrations/              # D1 database migrations (6 migrations)
│   ├── wrangler.jsonc           # Worker configuration (D1, AI bindings)
│   └── package.json
│
└── frontend/                    # React frontend
    ├── src/
    │   ├── App.tsx              # Main chat component
    │   ├── App.css              # Styling (dark theme)
    │   └── main.tsx             # Entry point
    └── package.json
```

### Backend Module Responsibilities

| Module | What it does |
|---|---|
| `index.ts` | Hono app setup, all route handlers, pin allocation extraction, response security filtering |
| `types.ts` | TypeScript interfaces shared across modules: `Bindings`, `PinRow`, `KnowledgeRow`, `DevicePatternRow`, `SessionRow`, `PinAllocation`, etc. |
| `sessions.ts` | `getOrCreateSession()` — finds existing or creates new session; `cleanupOldSessions()` — deletes sessions older than 24h; `parseJSON()` — safe JSON parse with fallback |
| `search.ts` | `performSearch()` — splits user message into words, runs `LIKE '%word%'` queries against `pins`, `knowledge`, and `device_patterns` tables, deduplicates and caps results |
| `prompts.ts` | `buildSystemPrompt()` — assembles the full system prompt from security rules, chip facts, current allocations, sensor instructions, and RAG results; `detectSensorQuestion()` — determines if the message is a connection request vs informational |

## Deployment

### Backend Deployment
```bash
cd stm32-ai-agent
npx wrangler deploy
```

The Worker will be deployed to: `https://stm32-ai-agent.wafleem.workers.dev`

### Frontend Deployment
```bash
cd frontend
npm run build
npx wrangler pages deploy dist
```

## Troubleshooting

### Session not persisting
- Check localStorage is enabled in browser
- Verify session ID is being saved to `stm32_session_id`

### Pin allocations not appearing
- Ensure AI is calling `allocate_pins` tool or using structured format
- Check browser console for API errors
- Verify backend deployment is successful

### AI not remembering context
- Check conversation history in database
- Verify last 30 messages are being sent to AI
- Session may have timed out (1 hour limit)

### Database errors
- Ensure migrations are applied to both local and remote D1 databases
- Check D1 database binding in wrangler.toml
- Verify database ID matches your Cloudflare account

## Contributing

This project was built with assistance from Claude Sonnet 4.5. To contribute:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - feel free to use and modify for your projects.

## Acknowledgments

- Built with Cloudflare Workers, D1, and Workers AI
- Frontend built with React 19 and Vite
- STM32F103C8T6 reference data compiled from official datasheets
- Implemented with assistance from Claude Sonnet 4.5
