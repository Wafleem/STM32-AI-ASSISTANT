# STM32 AI Agent

An AI-powered wiring assistant for the STM32F103C8T6 (Blue Pill). Ask it to connect a sensor, motor driver, or display — it returns a validated pin assignment, wiring steps, and HAL code snippet.

**Why this exists:** In hardware, bad wiring doesn't throw an error — it fries chips and creates bugs you chase with a multimeter. This tool gives engineers a faster path from "I need to add a CAN transceiver" to a working configuration, backed by verified data.

**Key features:**
- **RAG with semantic search** — vectorized knowledge base matches queries by meaning, not just keywords
- **Live pin allocation tracking** — prevents conflicts across devices in the same session
- **Verified knowledge base** — every wiring pattern and pin mapping sourced from datasheets
- **Llama 3.3 70B** on Cloudflare Workers AI for high-quality reasoning at zero cost

## Project Structure

```
stm32-ai-agent/
├── frontend/                  # React + Vite frontend application
│   ├── src/
│   │   ├── App.tsx            # Main chat UI component
│   │   ├── App.css            # Styling (dark theme)
│   │   └── main.tsx           # Entry point
│   ├── public/
│   └── package.json
├── stm32-ai-agent/            # Cloudflare Workers backend (Hono)
│   ├── src/
│   │   ├── index.ts           # Routes + wiring
│   │   ├── types.ts           # Shared TypeScript interfaces
│   │   ├── sessions.ts        # Session creation, cleanup, JSON helpers
│   │   ├── search.ts          # RAG search (semantic + LIKE fallback)
│   │   ├── seed-vectors.ts    # Vector embedding seeder
│   │   ├── validation.ts      # Input validation for API boundaries
│   │   └── prompts.ts         # System prompt builder
│   ├── migrations/            # D1 database migrations
│   │   ├── 0001_create_sessions.sql
│   │   ├── 0002_add_conversation_history.sql
│   │   └── 0003_create_device_patterns.sql
│   ├── test/
│   ├── wrangler.jsonc         # Worker configuration (D1, AI bindings)
│   └── package.json
├── package.json               # Root package.json with workspace scripts
└── README.md
```

## Getting Started

### Prerequisites

- Node.js (v18 or later recommended)
- npm

### Installation

Install dependencies for all packages:

```bash
npm run install:all
```

Or install individually:

```bash
# Root dependencies
npm install

# Frontend dependencies
cd frontend && npm install

# Backend dependencies
cd stm32-ai-agent && npm install
```

## Development

### Run Both Frontend and Backend

```bash
npm run dev
```

Note: This requires the `concurrently` package. If not installed, run:
```bash
npm install -D concurrently
```

### Run Frontend Only

```bash
npm run dev:frontend
```

The frontend will be available at `http://localhost:5173` (or the port Vite assigns).

### Run Backend Only

```bash
npm run dev:backend
```

The backend will run locally using Wrangler.

## Building

### Build Frontend

```bash
npm run build:frontend
```

### Deploy Backend

```bash
npm run build:backend
```

This will deploy the Cloudflare Worker.

## Testing

### Backend Tests

```bash
npm run test:backend
```

## Tech Stack

### Frontend
- React 19
- Vite
- TypeScript
- ESLint

### Backend
- Hono (Web framework)
- Cloudflare Workers
- Vitest (Testing)
- TypeScript
- Cloudflare D1 + Vectorize (structured data + semantic search)
- Workers AI (Llama 3.3 70B)

## License

ISC
