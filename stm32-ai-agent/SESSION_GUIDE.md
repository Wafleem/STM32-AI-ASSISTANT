# Session Management System

The STM32 AI Agent now includes session management to track pin allocations across multiple chat interactions. This allows the system to remember which pins you've assigned to different purposes within a single session.

## How It Works

### Automatic Session Creation

When you make your first `/api/chat` request without a `sessionId`, the system automatically creates a new session and returns the `sessionId` in the response.

### Pin Tracking

As you ask questions and the AI suggests pin assignments, the system automatically:
- Detects pins mentioned in responses (e.g., PA0, PB6, PC13)
- Stores them in your session's allocation table
- Includes current allocations in future prompts so the AI can avoid suggesting already-used pins

### Session Lifetime

- Sessions expire after 1 hour of inactivity
- Expired sessions are automatically cleaned up
- You can manually delete sessions at any time

## API Endpoints

### Chat with Session Tracking

```http
POST /api/chat
Content-Type: application/json

{
  "message": "How do I connect an I2C sensor?",
  "sessionId": "abc123..." // optional, omit for new session
}
```

**Response:**
```json
{
  "response": "To connect an I2C sensor, use PB6 for SCL and PB7 for SDA...",
  "sessionId": "abc123...",
  "allocations": {
    "PB6": "SCL",
    "PB7": "SDA"
  },
  "sources": {
    "pins": [...],
    "knowledge": [...]
  }
}
```

### Get Session Details

```http
GET /api/session/:sessionId
```

**Response:**
```json
{
  "sessionId": "abc123...",
  "createdAt": 1735667123456,
  "lastActivity": 1735667234567,
  "allocations": {
    "PB6": "I2C1_SCL",
    "PB7": "I2C1_SDA",
    "PA0": "ADC_Temperature"
  },
  "metadata": {
    "user_agent": "Mozilla/5.0..."
  }
}
```

### Update Pin Allocations Manually

```http
PUT /api/session/:sessionId/allocations
Content-Type: application/json

{
  "allocations": {
    "PA0": "ADC_Temperature",
    "PA1": "ADC_Voltage"
  }
}
```

### Clear All Pin Allocations

```http
DELETE /api/session/:sessionId/allocations
```

Resets pin allocations to empty `{}` while keeping the session active.

### Delete Entire Session

```http
DELETE /api/session/:sessionId
```

Permanently removes the session and all its data.

### Manual Cleanup

```http
POST /api/sessions/cleanup
```

Manually triggers cleanup of expired sessions (runs automatically on ~1% of requests).

## Usage Examples

### Frontend Integration

```javascript
// Initialize session
let sessionId = localStorage.getItem('stm32_session_id');

async function chat(message) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      sessionId
    })
  });

  const data = await response.json();

  // Store session ID for next request
  sessionId = data.sessionId;
  localStorage.setItem('stm32_session_id', sessionId);

  console.log('AI Response:', data.response);
  console.log('Current Allocations:', data.allocations);
}

// First message - creates new session
await chat('How do I use I2C?');

// Second message - uses existing session, AI knows PB6/PB7 are allocated
await chat('I also need SPI, which pins should I use?');

// View current allocations
async function viewAllocations() {
  const response = await fetch(`/api/session/${sessionId}`);
  const data = await response.json();
  console.log('All allocations:', data.allocations);
}
```

### cURL Examples

```bash
# Start new session
curl -X POST https://your-worker.workers.dev/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "How do I connect an MPU6050 sensor?"}'

# Continue with existing session
curl -X POST https://your-worker.workers.dev/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "I also need UART for GPS", "sessionId": "abc123..."}'

# Check allocations
curl https://your-worker.workers.dev/api/session/abc123...

# Clear allocations
curl -X DELETE https://your-worker.workers.dev/api/session/abc123.../allocations
```

## Database Schema

```sql
CREATE TABLE sessions (
  session_id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  last_activity INTEGER NOT NULL,
  pin_allocations TEXT DEFAULT '{}',  -- JSON object
  metadata TEXT DEFAULT '{}'          -- JSON object
);

CREATE INDEX idx_last_activity ON sessions(last_activity);
```

## Configuration

Edit `src/index.ts` to adjust:

```typescript
const SESSION_TIMEOUT = 60 * 60 * 1000; // 1 hour in milliseconds
const CLEANUP_THRESHOLD = 24 * 60 * 60; // 24 hours in seconds
```

## Benefits

1. **Context Awareness**: AI remembers previous pin assignments
2. **Conflict Avoidance**: Won't suggest already-allocated pins
3. **Project Planning**: Build up pin configuration gradually
4. **Multiple Projects**: Use different sessions for different projects

## Privacy & Data

- Sessions are identified by random 32-character hexadecimal IDs
- No user authentication required
- Sessions automatically expire after inactivity
- All data stored in your Cloudflare D1 database
- No third-party tracking
