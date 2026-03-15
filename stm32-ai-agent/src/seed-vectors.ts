import { Context } from 'hono';
import { Bindings, KnowledgeRow, DevicePatternRow, PinRow, EmbeddingResponse } from './types';

export async function handleSeedVectors(c: Context<{ Bindings: Bindings }>) {
  const db = c.env.DB;
  const ai = c.env.AI;
  const vectorize = c.env.VECTORIZE;

  // Gather all rows from D1
  const knowledge = await db.prepare('SELECT * FROM knowledge').all<KnowledgeRow>();
  const devices = await db.prepare('SELECT * FROM device_patterns').all<DevicePatternRow>();
  const pins = await db.prepare('SELECT * FROM pins').all<PinRow>();

  // Build text representation + metadata for each row
  const texts: string[] = [];
  const ids: string[] = [];
  const metadatas: Record<string, string>[] = [];

  for (const row of (knowledge.results || [])) {
    texts.push(`${row.topic}: ${row.content}`);
    ids.push(`knowledge_${row.id}`);
    metadatas.push({ table: 'knowledge', id: row.id });
  }

  for (const row of (devices.results || [])) {
    texts.push(`${row.device_name} ${row.device_type} ${row.interface_type} ${row.keywords || ''} ${row.notes || ''}`);
    ids.push(`device_${row.id}`);
    metadatas.push({ table: 'device_patterns', id: row.id });
  }

  for (const row of (pins.results || [])) {
    texts.push(`${row.pin} ${row.type} ${row.functions} ${row.notes || ''}`);
    ids.push(`pin_${row.pin}`);
    metadatas.push({ table: 'pins', id: row.pin });
  }

  // Embed in batches of 50 and upsert to Vectorize
  let totalUpserted = 0;
  const batchSize = 50;

  for (let i = 0; i < texts.length; i += batchSize) {
    const batchTexts = texts.slice(i, i + batchSize);
    const batchIds = ids.slice(i, i + batchSize);
    const batchMeta = metadatas.slice(i, i + batchSize);

    const embeddingResult = await ai.run('@cf/baai/bge-base-en-v1.5', { text: batchTexts }) as EmbeddingResponse;

    const vectors = embeddingResult.data.map((embedding: number[], idx: number) => ({
      id: batchIds[idx],
      values: embedding,
      metadata: batchMeta[idx]
    }));

    await vectorize.upsert(vectors);
    totalUpserted += vectors.length;
  }

  return c.json({
    success: true,
    total: texts.length,
    upserted: totalUpserted,
    breakdown: {
      knowledge: (knowledge.results || []).length,
      device_patterns: (devices.results || []).length,
      pins: (pins.results || []).length
    }
  });
}
