export type Bindings = {
  DB: D1Database;
  AI: Ai;
};

export interface PinRow {
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

export interface KnowledgeRow {
  id: string;
  topic: string;
  keywords: string;
  content: string;
}

export interface DevicePatternRow {
  id: string;
  device_name: string;
  device_type: string;
  interface_type: string;
  default_pins: string;
  requirements: string;
  notes: string;
  keywords: string;
}

export interface SessionRow {
  session_id: string;
  created_at: number;
  last_activity: number;
  pin_allocations: string;
  metadata: string;
  conversation_history: string;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface PinAllocation {
  [pin: string]: {
    function: string;
    device?: string;
    notes?: string;
  };
}

export interface SessionMetadata {
  user_agent?: string;
  [key: string]: any;
}
