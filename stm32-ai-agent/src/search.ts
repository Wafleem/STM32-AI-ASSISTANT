import { Bindings, PinRow, KnowledgeRow, DevicePatternRow, EmbeddingResponse, VectorMetadata } from './types';

export interface SearchResults {
  pins: PinRow[];
  knowledge: KnowledgeRow[];
  devicePatterns: DevicePatternRow[];
}

// Query expansion: map common terms to DB-friendly aliases
// This ensures vector + LIKE search can find relevant results
// even when the user uses different terminology
const QUERY_ALIASES: Record<string, string[]> = {
  'accelerometer': ['MPU6050', 'GY-521', 'IMU'],
  'gyroscope': ['MPU6050', 'GY-521', 'IMU'],
  'imu': ['MPU6050', 'GY-521', 'accelerometer'],
  'temperature': ['BMP280', 'DHT22', 'DS18B20', 'thermistor'],
  'pressure': ['BMP280', 'BME280'],
  'humidity': ['DHT22', 'BME280', 'DHT11'],
  'display': ['SSD1306', 'OLED', 'ILI9341', 'LCD', 'TFT'],
  'oled': ['SSD1306', 'display', 'I2C'],
  'lcd': ['ILI9341', 'display', 'SPI'],
  'bluetooth': ['HC-05', 'HC-06', 'UART'],
  'wifi': ['ESP8266', 'ESP32', 'UART', 'SPI'],
  'wireless': ['NRF24L01', 'HC-05', 'ESP8266', 'radio'],
  'radio': ['NRF24L01', 'SPI', 'wireless'],
  'gps': ['NEO-6M', 'UART', 'NMEA'],
  'motor': ['servo', 'stepper', 'A4988', 'PWM', 'driver'],
  'servo': ['PWM', 'timer', 'motor'],
  'stepper': ['A4988', 'motor', 'driver'],
  'distance': ['HC-SR04', 'ultrasonic', 'VL53L0X'],
  'ultrasonic': ['HC-SR04', 'distance'],
  'rtc': ['DS3231', 'real-time', 'clock', 'I2C'],
  'clock': ['DS3231', 'RTC', 'oscillator', 'HSE'],
  'sd card': ['SPI', 'storage', 'data logging'],
  'storage': ['SD card', 'flash', 'SPI'],
  'led': ['GPIO', 'output', 'resistor'],
  'button': ['GPIO', 'input', 'pull-up', 'debounce'],
  'relay': ['GPIO', 'output', 'transistor'],
  'potentiometer': ['ADC', 'analog', 'input'],
  'analog': ['ADC', 'potentiometer', 'sensor'],
  'serial': ['UART', 'USART', 'TX', 'RX'],
  'twi': ['I2C', 'SCL', 'SDA'],
  'can bus': ['CAN', 'automotive', 'transceiver'],
  'ethernet': ['W5500', 'ENC28J60', 'SPI', 'network'],
  'current': ['INA219', 'ADC', 'sensor'],
  'voltage': ['ADC', '5V', '3.3V', 'tolerant', 'divider'],
};

// Expand a user query with aliases for better search coverage
function expandQuery(message: string): string[] {
  const lower = message.toLowerCase();
  const expansions: string[] = [];

  for (const [term, aliases] of Object.entries(QUERY_ALIASES)) {
    if (lower.includes(term)) {
      expansions.push(...aliases);
    }
  }

  return [...new Set(expansions)];
}

// Semantic search via Cloudflare Vectorize
async function vectorSearch(
  ai: Ai,
  vectorize: VectorizeIndex,
  db: D1Database,
  message: string
): Promise<SearchResults> {
  const embedding = await ai.run('@cf/baai/bge-base-en-v1.5', { text: [message] }) as EmbeddingResponse;
  const vectorResults = await vectorize.query(embedding.data[0], { topK: 20, returnMetadata: 'all' });

  const knowledgeIds: string[] = [];
  const deviceIds: string[] = [];
  const pinNames: string[] = [];

  for (const match of vectorResults.matches) {
    const meta = match.metadata as VectorMetadata | undefined;
    if (!meta) continue;
    if (meta.table === 'knowledge') knowledgeIds.push(meta.id);
    else if (meta.table === 'device_patterns') deviceIds.push(meta.id);
    else if (meta.table === 'pins') pinNames.push(meta.id);
  }

  const results: SearchResults = { pins: [], knowledge: [], devicePatterns: [] };

  if (knowledgeIds.length > 0) {
    const placeholders = knowledgeIds.map(() => '?').join(',');
    const res = await db.prepare(`SELECT * FROM knowledge WHERE id IN (${placeholders})`)
      .bind(...knowledgeIds).all<KnowledgeRow>();
    results.knowledge = res.results || [];
  }

  if (deviceIds.length > 0) {
    const placeholders = deviceIds.map(() => '?').join(',');
    const res = await db.prepare(`SELECT * FROM device_patterns WHERE id IN (${placeholders})`)
      .bind(...deviceIds).all<DevicePatternRow>();
    results.devicePatterns = res.results || [];
  }

  if (pinNames.length > 0) {
    const placeholders = pinNames.map(() => '?').join(',');
    const res = await db.prepare(`SELECT * FROM pins WHERE pin IN (${placeholders})`)
      .bind(...pinNames).all<PinRow>();
    results.pins = res.results || [];
  }

  return results;
}

// LIKE-based keyword search (fallback or supplement)
async function likeSearch(db: D1Database, searchTerms: string[]): Promise<SearchResults> {
  let pinResults: PinRow[] = [];
  let knowledgeResults: KnowledgeRow[] = [];
  let devicePatternResults: DevicePatternRow[] = [];

  for (const word of searchTerms.slice(0, 8)) {
    const pins = await db.prepare(
      "SELECT * FROM pins WHERE functions LIKE ? OR pin LIKE ? OR notes LIKE ? LIMIT 3"
    ).bind(`%${word}%`, `%${word}%`, `%${word}%`).all<PinRow>();

    const knowledge = await db.prepare(
      "SELECT * FROM knowledge WHERE keywords LIKE ? OR content LIKE ? OR topic LIKE ? LIMIT 3"
    ).bind(`%${word}%`, `%${word}%`, `%${word}%`).all<KnowledgeRow>();

    const devices = await db.prepare(
      "SELECT * FROM device_patterns WHERE keywords LIKE ? OR device_name LIKE ? OR interface_type LIKE ? LIMIT 3"
    ).bind(`%${word}%`, `%${word}%`, `%${word}%`).all<DevicePatternRow>();

    if (pins.results) pinResults.push(...pins.results);
    if (knowledge.results) knowledgeResults.push(...knowledge.results);
    if (devices.results) devicePatternResults.push(...devices.results);
  }

  // Remove duplicates
  pinResults = [...new Map(pinResults.map(p => [p.pin, p])).values()].slice(0, 8);
  knowledgeResults = [...new Map(knowledgeResults.map(k => [k.id, k])).values()].slice(0, 8);
  devicePatternResults = [...new Map(devicePatternResults.map(d => [d.id, d])).values()].slice(0, 5);

  return { pins: pinResults, knowledge: knowledgeResults, devicePatterns: devicePatternResults };
}

// Direct pin lookup for explicit pin references like PA0, PB6
async function directPinLookup(db: D1Database, message: string): Promise<PinRow[]> {
  const pinPattern = /P[A-E]\d{1,2}/g;
  const pinMatches = message.toUpperCase().match(pinPattern);
  if (!pinMatches) return [];

  const uniquePins = [...new Set(pinMatches)];
  if (uniquePins.length === 0) return [];

  const placeholders = uniquePins.map(() => '?').join(',');
  const res = await db.prepare(`SELECT * FROM pins WHERE pin IN (${placeholders})`)
    .bind(...uniquePins).all<PinRow>();
  return res.results || [];
}

// Merge search results, deduplicating by ID/pin
function mergeResults(base: SearchResults, extra: SearchResults): SearchResults {
  const existingPins = new Set(base.pins.map(p => p.pin));
  const existingKnowledge = new Set(base.knowledge.map(k => k.id));
  const existingDevices = new Set(base.devicePatterns.map(d => d.id));

  for (const pin of extra.pins) {
    if (!existingPins.has(pin.pin)) {
      base.pins.push(pin);
      existingPins.add(pin.pin);
    }
  }
  for (const k of extra.knowledge) {
    if (!existingKnowledge.has(k.id)) {
      base.knowledge.push(k);
      existingKnowledge.add(k.id);
    }
  }
  for (const d of extra.devicePatterns) {
    if (!existingDevices.has(d.id)) {
      base.devicePatterns.push(d);
      existingDevices.add(d.id);
    }
  }

  return base;
}

// Main search: vector search + query expansion + LIKE supplement + direct pin lookup
export async function performSearch(env: Bindings, message: string): Promise<SearchResults> {
  const directPins = await directPinLookup(env.DB, message);

  let results: SearchResults;

  try {
    results = await vectorSearch(env.AI, env.VECTORIZE, env.DB, message);
  } catch (err) {
    console.error('Vector search failed, falling back to LIKE:', err);
    const words = message.split(/\s+/).filter((w: string) => w.length > 2);
    results = await likeSearch(env.DB, words);
  }

  // Query expansion: search for aliases of terms the user mentioned
  const expansions = expandQuery(message);
  if (expansions.length > 0) {
    const expandedResults = await likeSearch(env.DB, expansions);
    results = mergeResults(results, expandedResults);
  }

  // Supplement: if vector search returned few device patterns or knowledge,
  // do a targeted LIKE search to fill the gaps
  if (results.devicePatterns.length < 2 || results.knowledge.length < 3) {
    const words = message.split(/\s+/).filter((w: string) => w.length > 2);
    const supplement = await likeSearch(env.DB, words);
    results = mergeResults(results, supplement);
  }

  // Merge direct pin lookups
  if (directPins.length > 0) {
    const existingPinNames = new Set(results.pins.map(p => p.pin));
    for (const pin of directPins) {
      if (!existingPinNames.has(pin.pin)) {
        results.pins.push(pin);
      }
    }
  }

  // Cap results to avoid bloating the system prompt
  results.pins = results.pins.slice(0, 10);
  results.knowledge = results.knowledge.slice(0, 10);
  results.devicePatterns = results.devicePatterns.slice(0, 5);

  return results;
}
