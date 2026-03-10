import { SessionRow } from './types';

const CLEANUP_THRESHOLD = 24 * 60 * 60 * 1000; // 24 hours

function generateSessionId(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function parseJSON<T>(str: string, fallback: T): T {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

export async function getOrCreateSession(db: D1Database, sessionId: string | null, userAgent?: string): Promise<SessionRow> {
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

export async function cleanupOldSessions(db: D1Database): Promise<void> {
  const cutoff = Date.now() - CLEANUP_THRESHOLD;
  await db.prepare('DELETE FROM sessions WHERE last_activity < ?').bind(cutoff).run();
}
