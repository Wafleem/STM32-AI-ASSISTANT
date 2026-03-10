import { PinRow, KnowledgeRow, DevicePatternRow } from './types';

export interface SearchResults {
  pins: PinRow[];
  knowledge: KnowledgeRow[];
  devicePatterns: DevicePatternRow[];
}

export async function performSearch(db: D1Database, message: string): Promise<SearchResults> {
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
