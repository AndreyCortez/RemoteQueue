# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**RemoteQueue** is a multi-tenant SaaS for managing physical queues via QR codes. Customers scan a QR code to join a queue and receive real-time position updates; operators manage the queue via a B2B dashboard.

## Commands

### Backend (Python/FastAPI)

```bash
# Run all tests
pytest

# Run a specific test file
pytest tests/api/test_queue_management.py

# Run a single test by name
pytest tests/api/test_queue_management.py::test_list_members_empty_queue

# Run with verbose output
pytest -v

# Start the dev server (requires Docker services running)
uvicorn api.main:app --reload --port 8001
```

### Docker (full stack)

```bash
# Start all services (PostgreSQL, Redis, backend, frontend)
docker compose up

# Run only infrastructure (DB + Redis)
docker compose up db redis
```

### Frontend (React/Vite)

```bash
cd frontend

# Install dependencies
npm install

# Start dev server (Vite HMR)
npm run dev

# Type-check + build for production
npm run build

# Lint
npx eslint src/
```

### E2E Tests (Playwright)

```bash
cd e2e
# Playwright tests are not yet configured (scripts.test is a placeholder)
```

## Architecture

### Stack

- **Backend:** Python 3.12 + FastAPI (async REST + WebSockets)
- **Frontend:** React 18 + Vite + TypeScript (SPA, served by Nginx)
- **Database:** PostgreSQL 15 (relational source-of-truth, SQLAlchemy 2.0)
- **Real-time queue:** Redis 7 (sorted sets, O(log N) positioning by join timestamp)
- **Infrastructure:** Docker Compose (unified dev & prod)

### Multi-Tenancy

All tenants are isolated by `tenant_id` embedded in JWT tokens. Every query filters by `tenant_id` — there is no ORM-level row security; isolation is enforced in the routers via the `get_current_tenant` dependency in `api/dependencies/security.py`.

### Data Models (`api/database/models.py`)

```
Tenant (1:N) → B2BUser
Tenant (1:N) → QueueConfig
QueueConfig (1:N) → QueueEntry  ← audit log of all join/remove events
```

Redis key pattern: `tenant:{tenant_id}:queue:{queue_id}` (ZSET, score = join timestamp, member = JSON user data)

### API Routers (`api/routers/`)

| Router | Prefix | Audience |
|--------|--------|----------|
| `auth.py` | `/api/v1/b2b/auth` | B2B operators — login, JWT issuance |
| `queue_management.py` | `/api/v1/b2b/queues` | B2B operators — list/remove/reorder/call members |
| `queue.py` | `/api/v1/queue` | B2C customers — join queue, WebSocket position updates, QR generation |
| `tenant_setup.py` | `/api/v1/setup` | Admin — create tenants and queues |
| `test_seed.py` | `/api/v1/test` | Dev-only — seed test data |

### Frontend Pages (`frontend/src/pages/`)

| Page | Route | Auth |
|------|-------|------|
| `Login.tsx` | `/login` | Public |
| `Dashboard.tsx` | `/dashboard` | B2B (JWT) |
| `QueueManagement.tsx` | `/queue/:id` | B2B (JWT) |
| `B2CJoin.tsx` | `/join/:queueId` | Public |
| `QRDisplay.tsx` | `/qr/:queueId` | Public (kiosk) |
| `StatusDisplay.tsx` | `/status/:queueId` | Public (TV/monitor) |

Auth state is managed in `frontend/src/context/AuthContext.tsx` with JWT stored in `localStorage`. HTTP calls use Axios.

### WebSockets

`api/dependencies/websockets.py` holds the `ConnectionManager` that broadcasts queue-state changes to all connected B2C clients on a given queue. The WebSocket endpoint is `WS /api/v1/queue/{queue_id}/ws`.

### Testing Setup

Tests use **SQLite in-memory** (via SQLAlchemy `StaticPool`) and **FakeRedis** — no external services required. Fixtures are defined in `tests/conftest.py` and auto-reset between tests for isolation.

### MCP Server (`mcp_server/`)

A Model Context Protocol server (FastMCP) exposing project documentation as resources and git/file-analysis tools. Not part of the production stack.
