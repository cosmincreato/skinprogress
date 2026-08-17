# SkinProgress

A full-stack skin analysis and tracking app. Users take daily selfies (front/left/right), an ML pipeline scores acne, redness, and under-eye bags per photo, and an evolution dashboard turns those scores into trend graphs, period comparisons, and exportable PDF reports. A habit tracker, badge system, and a RAG-backed skincare chatbot round out the product.

## Architecture

```
ui/            React 19 + TypeScript + Vite — dashboard, gallery, habit tracking, chat widget
SkinProgress/  .NET 9.0 + EF Core + PostgreSQL — auth, photo storage, analytics, GDPR/audit logging
ai-service/    Python FastAPI — face detection + acne/redness/bags scoring, heatmap generation
n8n/           Workflow automation — embeds analysis events into Qdrant, powers the chatbot's RAG retrieval
```

The backend calls the AI service over HTTP for photo analysis, persists results in Postgres, and computes trend/comparison analytics on top of that history. The frontend talks to the backend via a JWT-authenticated REST API. n8n listens for analysis events, embeds them with Ollama, and stores them in Qdrant for the chatbot to retrieve.

## Tech stack

| Layer | Stack |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, Recharts, Three.js, TensorFlow.js + face-api |
| Backend | .NET 9.0, EF Core, PostgreSQL (Npgsql), JWT auth, BCrypt, Google OAuth |
| AI service | FastAPI, MediaPipe, a fine-tuned acne classifier, CLIP (zero-shot fallback), OpenCV |
| Infra | Docker Compose (Postgres, Redis, Qdrant, n8n, Ollama, Mailpit) |

## Getting started

### Prerequisites
- .NET 9.0 SDK, Node.js 18+, Python 3.12+ (or `uv`)
- Docker (for Postgres, Qdrant, n8n, etc.)

### 1. Infrastructure

```bash
docker compose up -d
```

### 2. Backend

```bash
cd SkinProgress/SkinProgress
dotnet restore
dotnet ef database update
dotnet run   # http://localhost:5000
```

Copy connection strings, JWT secret, and Google OAuth client ID into `appsettings.Local.json` (gitignored) — placeholders live in `appsettings.json`.

### 3. AI service

```bash
cd ai-service
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8001
```

### 4. Frontend

```bash
cd ui
npm install
npm run dev   # http://localhost:5173
```

On Windows, `make start-dev` opens all three in separate terminals.

## Testing

```bash
cd SkinProgress && dotnet test
cd ai-service && pytest
```

## Key features

- **Evolution dashboard** - trend graphs over configurable date ranges, period-over-period comparison, PDF export
- **Photo analysis** - per-angle acne/redness/bags scoring with optional heatmap overlays
- **Habit tracking** - streaks, badges, missions tied to daily skincare routines
- **Chatbot** - RAG-backed skincare Q&A over the user's own analysis history via Qdrant + Ollama
- **GDPR tooling** - audit logging and data export/deletion requests
