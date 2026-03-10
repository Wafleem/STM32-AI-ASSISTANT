import { Bindings, PinRow, KnowledgeRow, DevicePatternRow } from './types';

export interface SearchResults {
  pins: PinRow[];
  knowledge: KnowledgeRow[];
  devicePatterns: DevicePatternRow[];
}

// Semantic search via Cloudflare Vectorize
async function vectorSearch(
  ai: Ai,
  vectorize: VectorizeIndex,
  db: D1Database,
  message: string
): Promise<SearchResults> {
  const embedding = await ai.run('@cf/baai/bge-base-en-v1.5' as any, { text: [message] }) as any;
  const vectorResults = await vectorize.query(embedding.data[0], { topK: 15, returnMetadata: 'all' });

  const knowledgeIds: string[] = [];
  const deviceIds: string[] = [];
  const pinNames: string[] = [];

  for (const match of vectorResults.matches) {
    const meta = match.metadata as any;
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

// LIKE-based keyword search (fallback)
async function likeSearch(db: D1Database, message: string): Promise<SearchResults> {
  const words = message.split(/\s+/).filter((w: string) => w.length > 2);
  let pinResults: PinRow[] = [];
  let knowledgeResults: KnowledgeRow[] = [];
  let devicePatternResults: DevicePatternRow[] = [];

  for (const word of words.slice(0, 5)) {
    const pins = await db.prepare(
      "SELECT * FROM pins WHERE functions LIKE ? OR pin LIKE ? OR notes LIKE ? LIMIT 3"
    ).bind(`%${word}%`, `%${word}%`, `%${word}%`).all<PinRow>();

    const knowledge = await db.prepare(
      "SELECT * FROM knowledge WHERE keywords LIKE ? OR content LIKE ? OR topic LIKE ? LIMIT 2"
    ).bind(`%${word}%`, `%${word}%`, `%${word}%`).all<KnowledgeRow>();

    const devices = await db.prepare(
      "SELECT * FROM device_patterns WHERE keywords LIKE ? OR device_name LIKE ? LIMIT 2"
    ).bind(`%${word}%`, `%${word}%`).all<DevicePatternRow>();

    if (pins.results) pinResults.push(...pins.results);
    if (knowledge.results) knowledgeResults.push(...knowledge.results);
    if (devices.results) devicePatternResults.push(...devices.results);
  }

  // Remove duplicates
  pinResults = [...new Map(pinResults.map(p => [p.pin, p])).values()].slice(0, 8);
  knowledgeResults = [...new Map(knowledgeResults.map(k => [k.id, k])).values()].slice(0, 5);
  devicePatternResults = [...new Map(devicePatternResults.map(d => [d.id, d])).values()].slice(0, 3);

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

// Main search: tries vector search, falls back to LIKE, always does direct pin lookup
export async function performSearch(env: Bindings, message: string): Promise<SearchResults> {
  const directPins = await directPinLookup(env.DB, message);

  let results: SearchResults;

  try {
    results = await vectorSearch(env.AI, env.VECTORIZE, env.DB, message);
  } catch (err) {
    console.error('Vector search failed, falling back to LIKE:', err);
    results = await likeSearch(env.DB, message);
  }

  // Merge direct pin lookups (dedup)
  if (directPins.length > 0) {
    const existingPinNames = new Set(results.pins.map(p => p.pin));
    for (const pin of directPins) {
      if (!existingPinNames.has(pin.pin)) {
        results.pins.push(pin);
      }
    }
  }

  return results;
}
