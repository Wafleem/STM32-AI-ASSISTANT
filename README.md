# STM32 AI Agent

Full-stack application for STM32 AI assistance with a React frontend and Cloudflare Workers backend.

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
│   │   ├── search.ts          # RAG search (LIKE queries across 3 tables)
│   │   └── prompts.ts         # System prompt builder, sensor detection
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
- SQL (Database with datasheet and reference manual info)

## License

ISC
