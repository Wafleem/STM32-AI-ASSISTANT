import { Hono } from 'hono';
import { cors } from 'hono/cors';

type Bindings = {
  DB: D1Database;
  AI: Ai;
};

interface PinRow {
  pin: string;
  port: string;
  number: number | null;
  lqfp48: number;
  type: string;
  five_tolerant: number;
  reset_state: string;
  functions: string;
  notes: string;
}

interface KnowledgeRow {
  id: string;
  topic: string;
  keywords: string;
  content: string;
}

interface SessionRow {
  session_id: string;
  created_at: number;
  last_activity: number;
  pin_allocations: string;
  metadata: string;
  conversation_history: string;
}

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface PinAllocation {
  [pin: string]: {
    function: string;
    device?: string;
    notes?: string;
  };
}

interface SessionMetadata {
  user_agent?: string;
  [key: string]: any;
}

const app = new Hono<{ Bindings: Bindings }>();

app.use('/*', cors());

// Automatic session cleanup middleware (runs probabilistically)
app.use('/*', async (c, next) => {
  await next();

  // Run cleanup on ~1% of requests to avoid overhead
  if (Math.random() < 0.01) {
    cleanupOldSessions(c.env.DB).catch(err => console.error('Cleanup error:', err));
  }
});

// Session configuration
const SESSION_TIMEOUT = 60 * 60 * 1000; // 1 hour in milliseconds
const CLEANUP_THRESHOLD = 24 * 60 * 60; // 24 hours in seconds

// Utility: Generate secure random session ID
function generateSessionId(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

// Utility: Get or create session
async function getOrCreateSession(db: D1Database, sessionId: string | null, userAgent?: string): Promise<SessionRow> {
  const now = Date.now();

  if (sessionId) {
    const existing = await db.prepare('SELECT * FROM sessions WHERE session_id = ?').bind(sessionId).first<SessionRow>();
    if (existing) {
      await db.prepare('UPDATE sessions SET last_activity = ? WHERE session_id = ?').bind(now, sessionId).run();
      return { ...existing, last_activity: now };
    }
  }

  const newSessionId = generateSessionId();
  const metadata = JSON.stringify({ user_agent: userAgent });

  await db.prepare(
    'INSERT INTO sessions (session_id, created_at, last_activity, pin_allocations, metadata, conversation_history) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(newSessionId, now, now, '{}', metadata, '[]').run();

  return {
    session_id: newSessionId,
    created_at: now,
    last_activity: now,
    pin_allocations: '{}',
    metadata,
    conversation_history: '[]'
  };
}

// Utility: Cleanup old sessions
async function cleanupOldSessions(db: D1Database): Promise<void> {
  const cutoff = Date.now() - SESSION_TIMEOUT;
  await db.prepare('DELETE FROM sessions WHERE last_activity < ?').bind(cutoff).run();
}

// Get all pins
app.get('/api/pins', async (c) => {
  const result = await c.env.DB.prepare('SELECT * FROM pins').all();
  return c.json(result.results);
});

// Get single pin
app.get('/api/pins/:pin', async (c) => {
  const pin = c.req.param('pin').toUpperCase();
  const result = await c.env.DB.prepare('SELECT * FROM pins WHERE pin = ?').bind(pin).first();
  if (!result) return c.json({ error: 'Pin not found' }, 404);
  return c.json(result);
});

// Search pins by function
app.get('/api/search/pins', async (c) => {
  const q = c.req.query('q') || '';
  const result = await c.env.DB.prepare(
    "SELECT * FROM pins WHERE functions LIKE ? OR pin LIKE ? OR notes LIKE ?"
  ).bind(`%${q}%`, `%${q}%`, `%${q}%`).all();
  return c.json(result.results);
});

// Search knowledge base
app.get('/api/search/knowledge', async (c) => {
  const q = c.req.query('q') || '';
  const result = await c.env.DB.prepare(
    "SELECT * FROM knowledge WHERE keywords LIKE ? OR content LIKE ? OR topic LIKE ?"
  ).bind(`%${q}%`, `%${q}%`, `%${q}%`).all();
  return c.json(result.results);
});

// Get knowledge by topic
app.get('/api/knowledge/:topic', async (c) => {
  const topic = c.req.param('topic');
  const result = await c.env.DB.prepare('SELECT * FROM knowledge WHERE topic = ?').bind(topic).all();
  return c.json(result.results);
});

// AI Chat endpoint
app.post('/api/chat', async (c) => {
  const { message, sessionId } = await c.req.json();
  const userAgent = c.req.header('User-Agent');

  // Get or create session
  const session = await getOrCreateSession(c.env.DB, sessionId || null, userAgent);
  const currentAllocations: PinAllocation = JSON.parse(session.pin_allocations);
  const conversationHistory: ConversationMessage[] = JSON.parse(session.conversation_history || '[]');
  
  // Detect if user is asking about a sensor/module
  const sensorKeywords = ['sensor', 'module', 'connect', 'wire', 'hook up', 'interface', 'use with'];
  const isSensorQuestion = sensorKeywords.some(kw => message.toLowerCase().includes(kw)) ||
    /[A-Z]{2,}[-]?\d{2,}/.test(message); // Matches patterns like MPU6050, BME280, HC-SR04
  
  // Search for relevant pins (broader search)
  const words = message.split(/\s+/).filter((w: string) => w.length > 2);
  let pinResults = { results: [] as PinRow[] };
  let knowledgeResults = { results: [] as KnowledgeRow[] };
  
  for (const word of words.slice(0, 5)) {
    const pins = await c.env.DB.prepare(
      "SELECT * FROM pins WHERE functions LIKE ? OR pin LIKE ? OR notes LIKE ? LIMIT 3"
    ).bind(`%${word}%`, `%${word}%`, `%${word}%`).all<PinRow>();
    
    const knowledge = await c.env.DB.prepare(
      "SELECT * FROM knowledge WHERE keywords LIKE ? OR content LIKE ? OR topic LIKE ? LIMIT 2"
    ).bind(`%${word}%`, `%${word}%`, `%${word}%`).all<KnowledgeRow>();
    
    if (pins.results) pinResults.results.push(...pins.results);
    if (knowledge.results) knowledgeResults.results.push(...knowledge.results);
  }
  
  // Remove duplicates
  pinResults.results = [...new Map(pinResults.results.map(p => [p.pin, p])).values()].slice(0, 8);
  knowledgeResults.results = [...new Map(knowledgeResults.results.map(k => [k.id, k])).values()].slice(0, 5);
  
  // Build system prompt with context and session state
  let systemPrompt = `You are an expert assistant for the STM32F103C8T6 microcontroller (Blue Pill board).
You have deep knowledge of this chip's pinout, peripherals, clock configuration, and common use cases.

IMPORTANT GUIDELINES:
- Give accurate, helpful answers about the STM32F103C8T6
- If you reference specific pins or features, be precise
- Mention pin conflicts when relevant (e.g., I2C2 shares pins with USART3)
- When suggesting pins, check if they're already allocated in this session
- If you're unsure about something, say so
- Keep answers concise but complete

KEY FACTS ABOUT STM32F103C8T6:
- 64KB Flash, 20KB SRAM, 72MHz max clock speed
- 48-pin LQFP package
- Peripherals: 2x SPI, 2x I2C, 3x USART, USB, CAN, 2x ADC, 4 timers
- Operating voltage: 2.0V to 3.6V (3.3V typical)
- I2C1: PB6 (SCL), PB7 (SDA) - can remap to PB8/PB9
- I2C2: PB10 (SCL), PB11 (SDA) - shares pins with USART3!
- USART1: PA9 (TX), PA10 (RX) - can remap to PB6/PB7
- USART2: PA2 (TX), PA3 (RX)
- USART3: PB10 (TX), PB11 (RX) - shares pins with I2C2!
- SPI1: PA5 (SCK), PA6 (MISO), PA7 (MOSI), PA4 (NSS)
- SPI2: PB13 (SCK), PB14 (MISO), PB15 (MOSI), PB12 (NSS)
- USB: PA11 (D-), PA12 (D+) - shares with CAN
- ADC pins: PA0-PA7, PB0-PB1 (channels 0-9)
- 5V tolerant pins: PA8-PA15, PB2-PB4, PB6-PB15 (NOT PA0-PA7, PB0-PB1)

COMMON INTERFACE PINS FOR SENSORS:
- I2C sensors (MPU6050, BMP280, OLED, etc): Use I2C1 - PB6 (SCL), PB7 (SDA), need 4.7K pull-ups
- SPI sensors (SD card, displays, etc): Use SPI1 - PA5 (SCK), PA6 (MISO), PA7 (MOSI), PA4 (CS)
- UART devices (GPS, Bluetooth, etc): Use USART1 - PA9 (TX), PA10 (RX)
- Analog sensors: PA0-PA7 (ADC channels 0-7)
- OneWire (DS18B20, etc): Any GPIO, commonly PA0 or PB0
`;

  // Add current session allocations
  if (Object.keys(currentAllocations).length > 0) {
    // Group allocations by device to detect incomplete setups
    const deviceGroups: { [device: string]: string[] } = {};
    for (const [pin, info] of Object.entries(currentAllocations)) {
      if (info.device) {
        if (!deviceGroups[info.device]) deviceGroups[info.device] = [];
        deviceGroups[info.device].push(`${pin} (${info.function})`);
      }
    }

    systemPrompt += `\nCURRENT PIN ALLOCATIONS IN THIS SESSION:\n`;

    // Show grouped by device for better context
    for (const [device, pins] of Object.entries(deviceGroups)) {
      systemPrompt += `\n${device}:\n`;
      for (const pinInfo of pins) {
        systemPrompt += `  - ${pinInfo}\n`;
      }
    }

    // Show ungrouped pins (no device)
    const ungroupedPins = Object.entries(currentAllocations).filter(([_, info]) => !info.device);
    if (ungroupedPins.length > 0) {
      systemPrompt += `\nOther pins:\n`;
      for (const [pin, info] of ungroupedPins) {
        systemPrompt += `  - ${pin}: ${info.function}\n`;
      }
    }

    systemPrompt += `\nIMPORTANT RULES:
1. DO NOT reuse these pins for NEW devices
2. If a device appears incomplete (e.g., I2C with only SCL or only SDA), ALERT the user and offer to complete or reassign it
3. If the user asks to MOVE or CHANGE a pin assignment, you CAN reassign by suggesting new pins
4. When reassigning, output the NEW pin allocations (the old ones will be automatically removed when you suggest new ones for the same device)
5. Example incomplete: "MPU6050 only has SCL (PB6) allocated. Did you want to complete the I2C connection with SDA, or remove this allocation?"\n`;
  }

  // Add sensor-specific instructions if detected
  if (isSensorQuestion) {
    systemPrompt += `
SENSOR CONNECTION INSTRUCTIONS:
The user is asking about connecting a sensor or module. Please:

CRITICAL - Two-Step Process for Hardware Confirmation:

STEP 1 - First Time User Asks About a Sensor:
- ASK which specific hardware/breakout board they have
- DO NOT give board-specific advice yet
- DO NOT mention specific breakout board features (like "GY-521 has a built-in regulator")
- Give ONLY generic information about the sensor chip itself
- Example: "Are you using a GY-521 breakout board, bare MPU6050 chip, or a different module?"

STEP 2 - After User Confirms Their Hardware:
- ONLY NOW provide specific connection instructions
- Use the exact hardware they confirmed
- If they didn't confirm, ask again - don't assume

Then provide:
1. Identify what interface the sensor uses (I2C, SPI, UART, Analog, or Digital)
2. Provide specific pin connections for STM32F103C8T6
3. Mention voltage compatibility (3.3V vs 5V)
4. Note any pull-up resistors needed
5. Give the typical I2C address if applicable

CRITICAL: At the END of your response, include a pin allocation summary in this EXACT format:
---PIN_ALLOCATIONS---
PIN: <pin> | FUNCTION: <function> | DEVICE: <device> | NOTES: <notes>
PIN: <pin> | FUNCTION: <function> | DEVICE: <device> | NOTES: <notes>
---END_ALLOCATIONS---

Example:
PIN: PB6 | FUNCTION: SCL | DEVICE: MPU6050 | NOTES: 4.7k pull-up needed
PIN: PB7 | FUNCTION: SDA | DEVICE: MPU6050 | NOTES: 4.7k pull-up needed
PIN: PA1 | FUNCTION: GPIO | DEVICE: LED | NOTES: 220-330 ohm resistor

Only include pins that are being actively used for connections.
Use the device name the USER mentioned, not technical variants.
Only output the PIN_ALLOCATIONS block after the user has confirmed their hardware setup.
`;
  }

  // Add database results as additional context
  if (pinResults.results && pinResults.results.length > 0) {
    systemPrompt += "\nRELEVANT PIN DATA FROM DATABASE:\n";
    for (const pin of pinResults.results) {
      systemPrompt += `- ${pin.pin} (LQFP48 pin ${pin.lqfp48}): ${pin.notes}\n`;
    }
  }
  
  if (knowledgeResults.results && knowledgeResults.results.length > 0) {
    systemPrompt += "\nRELEVANT KNOWLEDGE FROM DATABASE:\n";
    for (const k of knowledgeResults.results) {
      systemPrompt += `- ${k.content}\n`;
    }
  }

  systemPrompt += "\nAnswer the user's question:";

  // Build messages array with conversation history
  const messages: any[] = [
    { role: 'system', content: systemPrompt }
  ];

  // Add conversation history (send last 30 messages = 15 exchanges to stay within token limits)
  const recentHistory = conversationHistory.slice(-30);
  for (const msg of recentHistory) {
    messages.push({ role: msg.role, content: msg.content });
  }

  // Add current user message
  messages.push({ role: 'user', content: message });

  // Call Workers AI
  const response = await c.env.AI.run('@cf/meta/llama-3.1-8b-instruct' as any, {
    messages,
    max_tokens: 800
  }) as { response: string };

  // Extract pin allocations from response - try structured format first
  const extractPinAllocations = (text: string, userMsg: string): PinAllocation => {
    const allocations: PinAllocation = {};

    // Try to extract structured allocation block first
    const structuredMatch = text.match(/---PIN_ALLOCATIONS---\n([\s\S]*?)\n---END_ALLOCATIONS---/);

    if (structuredMatch) {
      const allocationBlock = structuredMatch[1];
      const lines = allocationBlock.split('\n').filter(line => line.trim());

      for (const line of lines) {
        // Parse: PIN: PB6 | FUNCTION: SCL | DEVICE: MPU6050 | NOTES: 4.7k pull-up
        const pinMatch = line.match(/PIN:\s*([A-Z]{2}\d{1,2})/i);
        const functionMatch = line.match(/FUNCTION:\s*([^|]+)/i);
        const deviceMatch = line.match(/DEVICE:\s*([^|]+)/i);
        const notesMatch = line.match(/NOTES:\s*(.+)/i);

        if (pinMatch) {
          const pin = pinMatch[1].toUpperCase();
          allocations[pin] = {
            function: functionMatch ? functionMatch[1].trim() : 'GPIO',
            device: deviceMatch ? deviceMatch[1].trim() : undefined,
            notes: notesMatch ? notesMatch[1].trim() : undefined
          };
        }
      }

      return allocations;
    }

    // Fallback: Extract from prose if structured format not found
    // Extract devices from user message
    const userDevicePattern = /\b([A-Z]{2,}[-]?\d{2,}[A-Z]?\d*|LED|Button|Switch|Motor|Relay|sensor|module)\b/gi;
    const userDevices = [...new Set((userMsg.match(userDevicePattern) || []).map(d => d.toUpperCase()))];

    // Find all pin mentions in response
    const pinPattern = /\b(P[A-C]\d{1,2})\b/g;
    const pins = [...new Set(text.match(pinPattern) || [])];

    for (const pin of pins) {
      if (allocations[pin]) continue; // Skip if already processed

      // Get context around the pin
      const pinIndex = text.indexOf(pin);
      const contextBefore = text.substring(Math.max(0, pinIndex - 100), pinIndex);
      const contextAfter = text.substring(pinIndex, Math.min(text.length, pinIndex + 150));
      const fullContext = contextBefore + contextAfter;

      // Skip if mentioned negatively (avoid, disable, etc.)
      if (/avoid|disable|not use|don't use|instead|alternatively/i.test(fullContext)) {
        continue;
      }

      // Look for positive connection context
      const hasConnectionContext = /connect|wire|use|attach|→|->|to|for/i.test(fullContext);

      if (hasConnectionContext) {
        // Extract function from context
        const functionMatch = fullContext.match(/\b(SDA|SCL|TX|RX|MOSI|MISO|SCK|CS|NSS|GPIO|PWM|ADC|USART|UART|I2C|SPI)\b/i);

        // Try to find device name near this pin
        let deviceName = userDevices[0] || '';
        const deviceMatch = fullContext.match(/\b([A-Z]{2,}[-]?\d{2,}[A-Z]?\d*|LED|sensor|module)\b/i);
        if (deviceMatch) {
          deviceName = deviceMatch[0];
        }

        allocations[pin] = {
          function: functionMatch ? functionMatch[0].toUpperCase() : 'GPIO',
          device: deviceName || undefined,
          notes: undefined
        };
      }
    }

    return allocations;
  };

  // Get new allocations from response
  const newAllocations = extractPinAllocations(response.response, message);
  const updatedAllocations = { ...currentAllocations };

  // Check if this is a reassignment (same device, different pins)
  const newDevices = new Set(Object.values(newAllocations).map(info => info.device).filter(d => d));

  for (const device of newDevices) {
    // If device already exists in allocations, this is likely a reassignment
    const hasExisting = Object.values(currentAllocations).some(info => info.device === device);

    if (hasExisting) {
      // Remove old allocations for this device
      for (const [pin, info] of Object.entries(updatedAllocations)) {
        if (info.device === device) {
          delete updatedAllocations[pin];
        }
      }
    }
  }

  // Add new allocations
  for (const [pin, info] of Object.entries(newAllocations)) {
    updatedAllocations[pin] = info;
  }

  // Update conversation history
  conversationHistory.push({ role: 'user', content: message });
  conversationHistory.push({ role: 'assistant', content: response.response });

  // Keep only last 100 messages in history (50 exchanges max per session)
  // This allows full session context while preventing unlimited growth
  const trimmedHistory = conversationHistory.slice(-100);

  // Update session with new allocations and conversation history
  await c.env.DB.prepare(
    'UPDATE sessions SET pin_allocations = ?, conversation_history = ?, last_activity = ? WHERE session_id = ?'
  ).bind(
    JSON.stringify(updatedAllocations),
    JSON.stringify(trimmedHistory),
    Date.now(),
    session.session_id
  ).run();

  // Remove structured allocation block from user-visible response
  const cleanResponse = response.response.replace(/---PIN_ALLOCATIONS---[\s\S]*?---END_ALLOCATIONS---/g, '').trim();

  return c.json({
    response: cleanResponse,
    sessionId: session.session_id,
    allocations: updatedAllocations,
    sources: {
      pins: pinResults.results,
      knowledge: knowledgeResults.results
    }
  });
});

// Get session allocations
app.get('/api/session/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId');
  const session = await c.env.DB.prepare('SELECT * FROM sessions WHERE session_id = ?').bind(sessionId).first<SessionRow>();

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  return c.json({
    sessionId: session.session_id,
    createdAt: session.created_at,
    lastActivity: session.last_activity,
    allocations: JSON.parse(session.pin_allocations),
    metadata: JSON.parse(session.metadata)
  });
});

// Update session allocations manually
app.put('/api/session/:sessionId/allocations', async (c) => {
  const sessionId = c.req.param('sessionId');
  const { allocations } = await c.req.json();

  const session = await c.env.DB.prepare('SELECT * FROM sessions WHERE session_id = ?').bind(sessionId).first<SessionRow>();

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  await c.env.DB.prepare(
    'UPDATE sessions SET pin_allocations = ?, last_activity = ? WHERE session_id = ?'
  ).bind(JSON.stringify(allocations), Date.now(), sessionId).run();

  return c.json({
    sessionId,
    allocations
  });
});

// Remove specific pin allocation
app.delete('/api/session/:sessionId/allocations/:pin', async (c) => {
  const sessionId = c.req.param('sessionId');
  const pin = c.req.param('pin').toUpperCase();

  const session = await c.env.DB.prepare('SELECT * FROM sessions WHERE session_id = ?').bind(sessionId).first<SessionRow>();

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const allocations = JSON.parse(session.pin_allocations);
  delete allocations[pin];

  await c.env.DB.prepare(
    'UPDATE sessions SET pin_allocations = ?, last_activity = ? WHERE session_id = ?'
  ).bind(JSON.stringify(allocations), Date.now(), sessionId).run();

  return c.json({
    sessionId,
    pin,
    allocations
  });
});

// Clear all session allocations
app.delete('/api/session/:sessionId/allocations', async (c) => {
  const sessionId = c.req.param('sessionId');

  const session = await c.env.DB.prepare('SELECT * FROM sessions WHERE session_id = ?').bind(sessionId).first<SessionRow>();

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  await c.env.DB.prepare(
    'UPDATE sessions SET pin_allocations = ?, last_activity = ? WHERE session_id = ?'
  ).bind('{}', Date.now(), sessionId).run();

  return c.json({
    sessionId,
    allocations: {}
  });
});

// Delete entire session
app.delete('/api/session/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId');

  await c.env.DB.prepare('DELETE FROM sessions WHERE session_id = ?').bind(sessionId).run();

  return c.json({ success: true });
});

// Cleanup endpoint (can be called periodically)
app.post('/api/sessions/cleanup', async (c) => {
  await cleanupOldSessions(c.env.DB);
  return c.json({ success: true, message: 'Old sessions cleaned up' });
});

export default app;