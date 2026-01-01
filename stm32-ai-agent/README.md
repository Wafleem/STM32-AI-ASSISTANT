# STM32F103C8T6 AI Assistant

An intelligent chatbot assistant for the STM32F103C8T6 microcontroller (Blue Pill) that helps with pin configuration, device connections, and technical questions. Features AI-powered responses with RAG (Retrieval Augmented Generation), session management, and automatic pin allocation tracking.

## Features

### Core Capabilities
- **AI-Powered Assistance**: Uses Cloudflare Workers AI (Llama 3.1 8B) with RAG for accurate STM32F103C8T6 guidance
- **Pin Allocation Tracking**: Automatically tracks which pins are allocated to which devices across your session
- **Device Pattern Database**: Reference database of 15+ common devices with default pin configurations
- **Conversation Memory**: Maintains conversation history for contextual follow-up questions
- **Session Management**: Persistent sessions with localStorage for seamless user experience

### Smart Features
- **RAG-Enhanced Responses**: Searches pin database, knowledge base, and device patterns for accurate information
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

## Database Schema

### Sessions Table
Stores user sessions with pin allocations and conversation history.

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
Reference data for all STM32F103C8T6 pins.

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
Curated knowledge base about STM32F103C8T6 features.

```sql
CREATE TABLE knowledge (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  keywords TEXT NOT NULL,
  content TEXT NOT NULL
);
```

### Device Patterns Table
Reference patterns for common devices and sensors.

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

**Included Devices**: MPU6050, BMP280, OLED (I2C), DS3231 RTC, SD Card, nRF24L01, XBee, HC-05 Bluetooth, GPS, LED, Button, Relay, Potentiometer, LDR

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

3. **Run migrations**
```bash
npx wrangler d1 execute stm32-pins-db --local --file=./migrations/0001_create_sessions.sql
npx wrangler d1 execute stm32-pins-db --local --file=./migrations/0002_add_conversation_history.sql
npx wrangler d1 execute stm32-pins-db --local --file=./migrations/0003_create_device_patterns.sql

# For production
npx wrangler d1 execute stm32-pins-db --remote --file=./migrations/0001_create_sessions.sql
npx wrangler d1 execute stm32-pins-db --remote --file=./migrations/0002_add_conversation_history.sql
npx wrangler d1 execute stm32-pins-db --remote --file=./migrations/0003_create_device_patterns.sql
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

### Session Settings (src/index.ts)
```typescript
const SESSION_TIMEOUT = 60 * 60 * 1000; // 1 hour
const CLEANUP_THRESHOLD = 24 * 60 * 60; // 24 hours
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
├── stm32-ai-agent/          # Backend (Cloudflare Worker)
│   ├── src/
│   │   └── index.ts         # Main worker code
│   ├── migrations/          # Database migrations
│   │   ├── 0001_create_sessions.sql
│   │   ├── 0002_add_conversation_history.sql
│   │   └── 0003_create_device_patterns.sql
│   ├── wrangler.toml        # Worker configuration
│   └── package.json
│
└── frontend/                # React frontend
    ├── src/
    │   ├── App.tsx          # Main component
    │   ├── App.css          # Styling
    │   └── main.tsx         # Entry point
    └── package.json
```

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
