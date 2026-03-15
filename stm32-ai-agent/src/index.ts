import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Bindings, PinAllocation, ConversationMessage, LLMResponse, ChatMessage, SessionRow, ToolCall } from './types';
import { getOrCreateSession, cleanupOldSessions, parseJSON } from './sessions';
import { performSearch } from './search';
import { buildSystemPrompt, detectSensorQuestion } from './prompts';
import { validateAllocations } from './validation';
import { handleSeedVectors } from './seed-vectors';

const app = new Hono<{ Bindings: Bindings }>();

app.use('/*', cors({
  origin: [
    'https://stm32-assistant.pages.dev',
    'http://localhost:5173',
  ],
}));

// Automatic session cleanup middleware (runs probabilistically)
app.use('/*', async (c, next) => {
  await next();
  if (Math.random() < 0.01) {
    cleanupOldSessions(c.env.DB).catch(err => console.error('Cleanup error:', err));
  }
});

// Health check — verifies DB connectivity
app.get('/api/health', async (c) => {
  const start = Date.now();
  try {
    await c.env.DB.prepare('SELECT 1').first();
    return c.json({
      status: 'ok',
      db: 'connected',
      latency_ms: Date.now() - start,
      version: '1.0.0'
    });
  } catch {
    return c.json({ status: 'error', db: 'unreachable' }, 500);
  }
});

// Seed vectors endpoint (one-time, call after deploy to populate Vectorize)
app.post('/api/admin/seed-vectors', handleSeedVectors);

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

  // ========== SECURITY: Input Validation ==========
  if (!message || typeof message !== 'string') {
    return c.json({ error: 'Invalid message format' }, 400);
  }

  if (message.length > 2000) {
    return c.json({ error: 'Message too long. Please keep messages under 2000 characters.' }, 400);
  }

  if (message.trim().length === 0) {
    return c.json({ error: 'Message cannot be empty' }, 400);
  }

  // Detect common prompt injection patterns
  const injectionPatterns = [
    /ignore\s+(all\s+)?(previous|prior|above|your)\s+(instructions?|prompts?|rules?|context)/i,
    /disregard\s+(all\s+)?(previous|prior|above|your|everything)/i,
    /you\s+are\s+now\s+(a|an|not)\b/i,
    /new\s+(system\s+)?(instructions?|role|personality|behavior)\s*:/i,
    /system\s+prompt/i,
    /reveal\s+(your\s+)?(prompt|rules?|internal)/i,
    /show\s+(me\s+)?(your\s+)?(prompt|rules?|system\s+prompt)/i,
    /what\s+(are|is)\s+your\s+(internal\s+)?(instructions?|prompts?|rules?|configuration)/i,
    /---\s*(end|start)\s*(of\s*)?(system|prompt)/i,
    /<\|im_(start|end)\|>/i,
    /\[SYSTEM\]/i,
    /\[\/INST\]/i,
    /\[ASSISTANT\]/i,
    /forget\s+(everything|all|your\s+(instructions?|role|purpose))/i,
    /pretend\s+(to\s+be|you\s+are|that\s+you)/i,
    /roleplay/i,
    /override\s+(your\s+)?(instructions?|rules?|programming)/i,
  ];

  const detectedPattern = injectionPatterns.find(pattern => pattern.test(message));

  if (detectedPattern) {
    console.log('Prompt injection attempt detected:', message.substring(0, 100));
    return c.json({
      response: "I detected an unusual pattern in your message. I'm specifically designed to help with the STM32F103C8T6 microcontroller. Please ask a genuine question about the chip, its pinout, or how to connect devices to it.",
      sessionId: sessionId || null,
      allocations: {}
    });
  }

  // ========== END SECURITY ==========

  // Get or create session
  const session = await getOrCreateSession(c.env.DB, sessionId || null, userAgent);
  const currentAllocations: PinAllocation = parseJSON<PinAllocation>(session.pin_allocations, {});
  const conversationHistory: ConversationMessage[] = parseJSON<ConversationMessage[]>(session.conversation_history, []);

  const isSensorQuestion = detectSensorQuestion(message);

  // Search for relevant pins, knowledge, and device patterns (vector search with LIKE fallback)
  const searchResults = await performSearch(c.env, message);

  // Build system prompt with context and session state
  const systemPrompt = buildSystemPrompt(
    currentAllocations,
    isSensorQuestion,
    searchResults.pins,
    searchResults.knowledge,
    searchResults.devicePatterns
  );

  // Build messages array with conversation history
  const messages: ChatMessage[] = [
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
  // Model name cast needed — @cf/meta/llama-3.1-8b-instruct isn't in Cloudflare's AiModels type yet
  const aiResult = await (c.env.AI.run as Function)('@cf/meta/llama-3.1-8b-instruct', {
    messages,
    max_tokens: 800
  }) as LLMResponse;

  // Extract response text from various possible formats
  let responseText = aiResult?.response || aiResult?.content || aiResult?.message?.content || '';

  if (!responseText && aiResult?.tool_calls && aiResult.tool_calls.length > 0) {
    responseText = "I've allocated the pins for your device. Check the pin allocation sidebar for details.";
  }

  const response = {
    response: responseText,
    tool_calls: aiResult?.tool_calls || []
  };

  // Extract pin allocations from response
  const newAllocations = extractPinAllocations(response, message);
  const updatedAllocations = { ...currentAllocations };

  // Validate proposed allocations against the real pin database
  const { validAllocations, warnings } = await validateAllocations(c.env.DB, newAllocations, currentAllocations);

  if (warnings.length > 0) {
    console.log('Allocation validation warnings:', warnings);
  }

  // Check if this is a reassignment (same device, different pins)
  const newDevices = new Set(Object.values(validAllocations).map(info => info.device).filter(d => d));

  for (const device of newDevices) {
    const oldPins = Object.entries(currentAllocations)
      .filter(([_, info]) => info.device === device)
      .map(([pin, _]) => pin);
    const newPins = Object.entries(validAllocations)
      .filter(([_, info]) => info.device === device)
      .map(([pin, _]) => pin);

    if (oldPins.length > 0 && newPins.length > 0) {
      const pinsChanged = oldPins.some(pin => !newPins.includes(pin)) ||
                          newPins.some(pin => !oldPins.includes(pin));
      if (pinsChanged) {
        for (const [pin, info] of Object.entries(updatedAllocations)) {
          if (info.device === device) {
            delete updatedAllocations[pin];
          }
        }
      }
    }
  }

  // Add validated allocations
  for (const [pin, info] of Object.entries(validAllocations)) {
    const existing = updatedAllocations[pin];
    if (!existing) {
      updatedAllocations[pin] = info;
    } else if (existing.device !== info.device) {
      // I2C bus sharing: combine device names (e.g., "MPU6050, BMP280")
      const existingDevices = existing.device ? existing.device.split(', ') : [];
      const newDevice = info.device || '';
      if (newDevice && !existingDevices.includes(newDevice)) {
        existingDevices.push(newDevice);
        updatedAllocations[pin] = {
          ...existing,
          device: existingDevices.join(', ')
        };
      }
    }
  }

  // Update conversation history
  conversationHistory.push({ role: 'user', content: message });
  conversationHistory.push({ role: 'assistant', content: response.response });
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
  let cleanResponse = (response.response || '')
    .replace(/---PIN_ALLOCATIONS---[\s\S]*?---END_ALLOCATIONS---/g, '')
    .trim();

  // ========== SECURITY: Output Filtering ==========
  const leakagePatterns = [
    /system prompt/i,
    /my instructions/i,
    /i (was|am) (instructed|told|programmed) to/i,
    /critical security instructions/i,
    /highest priority/i,
    /my (internal )?rules/i,
  ];

  const hasLeakage = leakagePatterns.some(pattern => pattern.test(cleanResponse));

  if (hasLeakage) {
    console.log('Potential prompt leakage detected in response');
    cleanResponse = "I'm specifically designed to help with the STM32F103C8T6 microcontroller. I can answer questions about its pinout, peripherals, and how to connect devices to it. What would you like to know?";
  }

  const hardwareTerms = ['i2c', 'spi', 'uart', 'gpio', 'sensor', 'module', 'breakout', 'board',
                          'connect', 'wire', 'interface', 'peripheral', 'device', 'vcc', 'gnd',
                          'scl', 'sda', 'mosi', 'miso', 'tx', 'rx', 'adc', 'pwm', 'timer'];
  const responseContainsHardwareTerm = hardwareTerms.some(term =>
    cleanResponse.toLowerCase().includes(term)
  );

  if (cleanResponse.length > 0 &&
      !cleanResponse.toLowerCase().includes('stm32') &&
      !cleanResponse.toLowerCase().includes('pin') &&
      !cleanResponse.toLowerCase().includes('designed to help') &&
      !responseContainsHardwareTerm &&
      cleanResponse.length > 100) {
    console.log('Suspicious off-topic response detected');
    cleanResponse = "I'm specifically designed to help with the STM32F103C8T6 microcontroller. Please ask me questions about the chip, its pinout, or how to connect devices to it.";
  }
  // ========== END SECURITY ==========

  // Append validation warnings to the response so the user sees them
  if (warnings.length > 0) {
    const warningText = '\n\n⚠️ **Pin Validation:**\n' + warnings.map(w => `- ${w}`).join('\n');
    cleanResponse += warningText;
  }

  return c.json({
    response: cleanResponse,
    sessionId: session.session_id,
    allocations: updatedAllocations,
    sources: {
      pins: searchResults.pins,
      knowledge: searchResults.knowledge
    }
  });
});

// ========== Pin allocation extraction ==========
interface ParsedAIResponse {
  response: string;
  tool_calls: ToolCall[];
}

// Normalize pin strings: "PA 0" → "PA0", "p b 6" → "PB6", "Pa5" → "PA5"
function normalizePin(raw: string): string | null {
  const cleaned = raw.toUpperCase().replace(/[\s_-]/g, '');
  const match = cleaned.match(/^(P[A-E])(\d{1,2})$/);
  return match ? `${match[1]}${match[2]}` : null;
}

function extractPinAllocations(aiResponse: ParsedAIResponse, userMsg: string): PinAllocation {
  const allocations: PinAllocation = {};

  // Guard: informational questions should NEVER create allocations,
  // even if the LLM mistakenly includes a PIN_ALLOCATIONS block
  const informationalPatterns = [
    /which pins|what pins|list.*pins/i,
    /can i use|could i use/i,
    /are.*5v tolerant|5v.*tolerant/i,
    /available|options/i,
    /does (this|the|it) (chip|board|stm32) (have|support)/i,
    /how many/i,
    /tell me about/i,
    /what (is|are) the/i,
  ];

  const isInformational = informationalPatterns.some(pattern => pattern.test(userMsg));
  if (isInformational) {
    return allocations;
  }

  // PRIORITY 1: Check for tool calls (most reliable)
  if (aiResponse.tool_calls && Array.isArray(aiResponse.tool_calls)) {
    for (const toolCall of aiResponse.tool_calls) {
      if (toolCall.name === 'allocate_pins') {
        try {
          const args = typeof toolCall.arguments === 'string'
            ? JSON.parse(toolCall.arguments)
            : toolCall.arguments;

          let allocationsList = args.allocations;
          if (typeof allocationsList === 'string') {
            allocationsList = JSON.parse(allocationsList);
          }

          if (allocationsList && Array.isArray(allocationsList)) {
            for (const allocation of allocationsList) {
              const pin = normalizePin(allocation.pin);
              if (!pin) continue;
              allocations[pin] = {
                function: allocation.function,
                device: allocation.device,
                notes: allocation.notes
              };
            }
          }
        } catch (e) {
          console.error('Failed to parse tool call arguments:', e);
        }
      }
    }

    if (Object.keys(allocations).length > 0) {
      return allocations;
    }
  }

  // PRIORITY 2: Try to extract structured allocation block from text
  const text = aiResponse.response || '';

  // Handle \r\n, optional whitespace around delimiters, and slight variations
  const structuredMatch = text.match(
    /---\s*PIN_ALLOCATIONS\s*---\s*[\r\n]+([\s\S]*?)[\r\n]+\s*---\s*END_ALLOCATIONS\s*---/
  );

  if (structuredMatch) {
    const allocationBlock = structuredMatch[1];
    const lines = allocationBlock.split(/\r?\n/).filter((line: string) => line.trim());

    for (const line of lines) {
      // Accept both pipe and comma as field separators
      const pinMatch = line.match(/PIN:\s*(P\s*[A-E]\s*\d{1,2})/i);
      const functionMatch = line.match(/FUNCTION:\s*([^|,]+)/i);
      const deviceMatch = line.match(/DEVICE:\s*([^|,]+)/i);
      const notesMatch = line.match(/NOTES:\s*(.+)/i);

      if (pinMatch) {
        const pin = normalizePin(pinMatch[1]);
        if (!pin) continue;
        allocations[pin] = {
          function: functionMatch ? functionMatch[1].trim() : 'GPIO',
          device: deviceMatch ? deviceMatch[1].trim() : undefined,
          notes: notesMatch ? notesMatch[1].trim() : undefined
        };
      }
    }

    if (Object.keys(allocations).length > 0) {
      return allocations;
    }
  }

  // Fallback: Only allocate if we have strong evidence of device connection
  const devicePattern = /\b([A-Z]{2,}[-]?\d{2,}[A-Z]?\d*|LED|Button|Switch|Motor|Relay)\b/gi;
  const devices = userMsg.match(devicePattern);

  if (!devices || devices.length === 0) {
    return allocations;
  }

  // Match various connection verbs: connect, wire, hook up, attach, use, assign
  const connectionPattern = /(?:connect|wire|hook\s*up|attach|use|assign)\s+(?:the\s+)?([A-Z]{2,}[-]?\d{2,}[A-Z]?\d*|LED|sensor|module)\s+(?:to|on|at)\s+(?:pin\s+)?(P\s*[A-E]\s*\d{1,2})/gi;
  const matches = text.matchAll(connectionPattern);

  for (const match of matches) {
    const device = match[1];
    const pin = normalizePin(match[2]);
    if (!pin) continue;

    if (!allocations[pin]) {
      allocations[pin] = {
        function: 'GPIO',
        device: device,
        notes: undefined
      };
    }
  }

  return allocations;
}

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
    allocations: parseJSON<PinAllocation>(session.pin_allocations, {}),
    metadata: parseJSON(session.metadata, {})
  });
});

// Update session allocations manually
app.put('/api/session/:sessionId/allocations', async (c) => {
  const sessionId = c.req.param('sessionId');
  const { allocations } = await c.req.json();

  if (!allocations || typeof allocations !== 'object' || Array.isArray(allocations)) {
    return c.json({ error: 'allocations must be an object' }, 400);
  }

  const PIN_FORMAT = /^P[A-C]\d{1,2}$/;
  for (const [pin, info] of Object.entries(allocations)) {
    if (!PIN_FORMAT.test(pin)) {
      return c.json({ error: `Invalid pin format: "${pin}". Expected PA0, PB6, etc.` }, 400);
    }
    const val = info as Record<string, unknown>;
    if (!val || typeof val !== 'object' || typeof val.function !== 'string') {
      return c.json({ error: `Allocation for ${pin} must include a "function" string` }, 400);
    }
    if (val.device !== undefined && typeof val.device !== 'string') {
      return c.json({ error: `"device" for ${pin} must be a string` }, 400);
    }
    if (val.notes !== undefined && typeof val.notes !== 'string') {
      return c.json({ error: `"notes" for ${pin} must be a string` }, 400);
    }
  }

  const session = await c.env.DB.prepare('SELECT * FROM sessions WHERE session_id = ?').bind(sessionId).first();

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

  if (!/^P[A-E]\d{1,2}$/.test(pin)) {
    return c.json({ error: 'Invalid pin format. Expected format: PA0, PB6, etc.' }, 400);
  }

  const session = await c.env.DB.prepare('SELECT * FROM sessions WHERE session_id = ?').bind(sessionId).first<SessionRow>();

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const allocations = parseJSON<PinAllocation>(session.pin_allocations, {});
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

  const session = await c.env.DB.prepare('SELECT * FROM sessions WHERE session_id = ?').bind(sessionId).first();

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
