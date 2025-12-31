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

const app = new Hono<{ Bindings: Bindings }>();

app.use('/*', cors());

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
  const { message } = await c.req.json();
  
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
  
  // Build system prompt with context
  let systemPrompt = `You are an expert assistant for the STM32F103C8T6 microcontroller (Blue Pill board). 
You have deep knowledge of this chip's pinout, peripherals, clock configuration, and common use cases.

IMPORTANT GUIDELINES:
- Give accurate, helpful answers about the STM32F103C8T6
- If you reference specific pins or features, be precise
- Mention pin conflicts when relevant (e.g., I2C2 shares pins with USART3)
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

  // Add sensor-specific instructions if detected
  if (isSensorQuestion) {
    systemPrompt += `
SENSOR CONNECTION INSTRUCTIONS:
The user is asking about connecting a sensor or module. Please:
1. Identify what interface the sensor uses (I2C, SPI, UART, Analog, or Digital)
2. Provide specific pin connections for STM32F103C8T6
3. Mention voltage compatibility (3.3V vs 5V)
4. Note any pull-up resistors needed
5. Give the typical I2C address if applicable

If you don't recognize the sensor, make your best guess based on the name/number pattern:
- Sensors with "MPU", "BMP", "BME", "SSD", "ADS", "PCF", "DS3231" are usually I2C
- Sensors with "MAX", "MCP", "W5500", "SD" are usually SPI
- Sensors with "GPS", "HC-05", "HC-06", "ESP" are usually UART
- Sensors with "DHT", "HC-SR04" are digital GPIO
- Sensors with "LDR", "NTC", "potentiometer" are analog

Format your response as:
**[Sensor Name]**
- Interface: [I2C/SPI/UART/Analog/Digital]
- Connections:
  - VCC → 3.3V
  - GND → GND
  - [Other pins...]
- Notes: [Any important notes]
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
  
  // Call Workers AI
  const response = await c.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message }
    ],
    max_tokens: 800
  }) as { response: string };
  
  return c.json({
    response: response.response,
    sources: {
      pins: pinResults.results,
      knowledge: knowledgeResults.results
    }
  });
});

export default app;