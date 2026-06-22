# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**SkinProgress** is a full-stack skin analysis and tracking application with AI-powered insights. It's a monorepo containing:

- **Frontend** (`ui/`): React 19 + TypeScript + Vite + Tailwind CSS v4
- **Backend** (`SkinProgress/`): .NET 9.0 + EF Core + PostgreSQL (via Npgsql)
- **AI Service** (`ai-service/`): Python FastAPI for skin condition analysis
- **Workflows** (`n8n/`): n8n automation and chatbot RAG integration

Core features: evolution dashboard with trend visualization, PDF export, period comparison, AI-powered photo analysis (acne/redness/under-eye bags detection), photo gallery, habits tracking, badge system, chat integration with Qdrant vector search.

---

## Quick Commands

### Frontend (`ui/`)
```bash
npm install              # Install dependencies
npm run dev              # Start Vite dev server (http://localhost:5173)
npm run build            # Production build
npm run lint             # Run ESLint
```

### Backend (`SkinProgress/`)
```bash
dotnet restore           # Restore NuGet packages
dotnet build             # Build solution
dotnet run               # Start backend server (http://localhost:5000)
dotnet test              # Run all tests
dotnet ef migrations add DescriptiveName  # Add migration
dotnet ef database update                 # Apply pending migrations
```

### AI Service (`ai-service/`)
```bash
pip install -r requirements.txt              # Install Python dependencies
uvicorn app:app --host 0.0.0.0 --port 8001  # Start service (run separately — not in docker-compose)
```

### Docker (Infrastructure Only)
The `docker-compose.yml` runs infrastructure services only — the AI service is commented out and run separately.
```bash
docker compose up -d     # Start postgres, redis, qdrant, n8n, ollama, mailpit
docker compose down      # Stop all services
docker compose logs -f   # Stream logs
```

### Quick Development Startup (Windows)
```bash
make start-dev           # Opens 3 terminals for AI, Backend, Frontend
make start-backend       # Start backend only
make start-frontend      # Start frontend only
make start-ai            # Start AI service only
```

---

## Infrastructure

All infrastructure runs via `docker-compose.yml`. The AI analyzer is run separately via uvicorn.

| Container | Image | Port | Role |
|---|---|---|---|
| `skinprogress-db` | `postgres:latest` | `${DB_PORT}:5432` | Primary database (app + n8n share this) |
| `skinprogress-redis` | `redis:7-alpine` | `6379` | Queue / caching for n8n |
| `skinprogress-qdrant` | `qdrant/qdrant:latest` | `6333`, `6334` | Vector store for RAG embeddings |
| `skinprogress-n8n` | `n8nio/n8n:latest` | `5678` | Workflow automation and chatbot |
| `skinprogress-ollama` | `ollama/ollama:latest` | `11434` | Local LLM — `mxbai-embed-large` for embeddings |
| `skinprogress-ollama-init` | `ollama/ollama:latest` | — | One-shot init: pulls `mxbai-embed-large` model |
| `skinprogress-mailpit` | `axllent/mailpit:latest` | `1025` (SMTP), `8025` (UI) | Local SMTP trap for dev emails |

**Note**: n8n connects to the same PostgreSQL instance as the backend (`DB_TYPE=postgresdb`, `DB_POSTGRESDB_HOST=db`). They share the database server but use logically separate tables.

---

## Architecture

### Frontend (`ui/`)

**Routes** (defined in `src/App.tsx`):
- `/login`, `/register`, `/confirm-email`, `/forgot-password`, `/reset-password` — public auth routes
- `/users/:userId` — profile page (protected)
- `/users/:userId/gallery` — photo gallery (protected)
- `/users/:userId/evolution` — evolution dashboard (protected)
- `/dashboard` — redirects to `/users/:userId`

**Structure**:
```
src/
├── pages/           # EvolutionPage, GalleryPage, ProfilePage
├── components/
│   ├── evolution/   # TrendGraph, DateRangeFilter, ExportReportButton, PeriodComparison
│   ├── auth/        # EmailLogin, EmailRegister, ConfirmEmail, ForgotPassword, ResetPassword
│   └── [other]      # SelfieCamera, ChatbotWidget, FaceDetectionOverlay, Face3DModel, Layout
├── services/        # API clients (analyticsApi, authService, photoService, habitsService, faceDetectionService)
├── types/           # TypeScript types (evolution.ts, FaceDetection.ts)
└── App.tsx / main.tsx
```

**Dependencies** (from `package.json`):

| Package | Version | Purpose |
|---|---|---|
| `react` | ^19.2.0 | UI framework |
| `react-dom` | ^19.2.0 | DOM rendering |
| `react-router-dom` | ^7.13.0 | Client-side routing |
| `axios` | ^1.14.0 | HTTP client with Bearer auth |
| `recharts` | ^2.15.4 | Trend graphs (line/bar charts) |
| `three` | ^0.184.0 | 3D face model visualization |
| `html2pdf.js` | ^0.10.1 | PDF export |
| `@tensorflow/tfjs` | ^4.22.0 | Client-side ML runtime |
| `@vladmandic/face-api` | ^1.7.15 | Face detection (landmarks, bounds) |
| `@react-oauth/google` | ^0.12.1 | Google OAuth flow |
| `tailwindcss` | ^4.1.18 | Utility CSS (v4) |
| `vite` | ^7.2.4 | Dev server and bundler |
| `typescript` | ~5.9.3 | Type safety (strict mode) |

---

### Backend (`SkinProgress/`)

**Structure**:
```
SkinProgress/
├── Controllers/     # AuthController, EvolutionDashboardController, PhotoController, HabitsController, UsersController
├── Services/
│   ├── *.cs         # Business logic implementations
│   └── Interfaces/  # Service contracts (IXxxService)
├── Models/
│   ├── DTOs/        # API response/request shapes (never expose entities directly)
│   ├── Entities/    # EF Core entities
│   └── [other]      # Constants, enums
├── Data/            # AppDbContext
├── Migrations/      # EF Core schema migrations
└── Program.cs       # DI registration, middleware, JWT, CORS
```

**NuGet Packages** (from `SkinProgress.csproj`):

| Package | Version | Purpose |
|---|---|---|
| `Npgsql.EntityFrameworkCore.PostgreSQL` | 9.0.4 | EF Core provider for PostgreSQL |
| `Microsoft.EntityFrameworkCore.Design/Tools` | 9.0.11 | EF Core CLI tooling |
| `Microsoft.AspNetCore.Authentication.JwtBearer` | 9.0.11 | JWT middleware |
| `Microsoft.IdentityModel.JsonWebTokens` | 8.15.0 | JWT token validation |
| `System.IdentityModel.Tokens.Jwt` | 8.15.0 | JWT token creation |
| `BCrypt.Net-Next` | 4.0.3 | Password hashing |
| `Google.Apis.Auth` | 1.68.0 | Google OAuth token validation |
| `MetadataExtractor` | 2.8.1 | EXIF data extraction from photos |
| `SixLabors.ImageSharp` | 3.0.0 | Image compression/processing |
| `Swashbuckle.AspNetCore` | 7.2.0 | Swagger/OpenAPI at `/swagger` |
| `Microsoft.AspNetCore.OpenApi` | 9.0.11 | OpenAPI support |

**Registered Services** (from `Program.cs`):

| Interface | Implementation | Lifetime | Purpose |
|---|---|---|---|
| `IEncryptionService` | `EncryptionService` | Singleton | AES-256-GCM field encryption |
| `IAuthService` | `AuthService` | Scoped | Auth orchestration |
| `IPasswordHashingService` | `PasswordHashingService` | Scoped | BCrypt hashing |
| `IJwtTokenService` | `JwtTokenService` | Scoped | JWT creation/validation |
| `IRateLimitService` | `RateLimitService` | Scoped | In-memory rate limiting |
| `IEmailService` | `EmailService` | Scoped | SMTP email dispatch |
| `IEmailConfirmationService` | `EmailConfirmationService` | Scoped | Email confirmation flow |
| `IPasswordResetService` | `PasswordResetService` | Scoped | Password reset flow |
| `IRegistrationService` | `RegistrationService` | Scoped | New user registration |
| `ILoginService` | `LoginService` | Scoped | Login flow |
| `IFileService` | `FileService` | Scoped | File storage |
| `IEvolutionAnalyticsService` | `EvolutionAnalyticsService` | Scoped | Trend analytics, period deltas |
| `IOllamaEmbeddingService` | `OllamaEmbeddingService` | HttpClient | Text → vector embeddings via Ollama |
| `IQdrantService` | `QdrantService` | HttpClient | Vector search / RAG queries |
| `ImageCompressionService` | — | Scoped | Image resize/compression |
| `ExifExtractorService` | — | Scoped | EXIF metadata extraction |
| `StorageQuotaService` | — | Scoped | Per-user storage quota enforcement |
| `PhotoService` | — | Scoped | Photo upload orchestration |

**Database Entities** (`Models/Entities/`):

| Entity | Purpose |
|---|---|
| `User` | Auth, profile, preferences |
| `UserPreferences` | User settings |
| `Photo` / `SelfieCapture` / `PhotoMetadata` | Image storage, capture angle, EXIF |
| `AnalysisResult` | AI scores: acne/redness/bags (0–10) |
| `SkinTrend` | Computed trend data |
| `HabitDefinition` / `HabitCompletion` / `HabitStreak` | Habit tracking |
| `Badge` / `UserBadge` | Achievement system |
| `Mission` / `UserMission` | Goal/mission tracking |
| `ChatMessage` / `ChatSession` | Conversation history |
| `AuditLog` | GDPR compliance logging |
| `GdprRequest` | GDPR data requests |
| `PasswordResetToken` | Password reset lifecycle |
| `UserEmailConfirmationToken` | Email confirmation lifecycle |
| `AuthToken` | Auth token storage |
| `AsyncJob` | Background job tracking |
| `GeneratedReport` | Exported PDF reports |
| `Notification` / `NotificationPreferences` | Push/in-app notifications |
| `Ingredient` / `Product` | Skincare product catalogue |

---

### AI Service (`ai-service/`)

Python FastAPI microservice — run locally via uvicorn (not in docker-compose by default).

**Endpoint**: `POST /analyze-set` — multipart form with files `front`, `left`, `right` (+ optional `user_id`, `date`)
Returns: JSON with overall scores, per-angle predictions, optional heatmap data URLs.

**Python Dependencies** (`requirements.txt`):

| Package | Purpose |
|---|---|
| `fastapi` | API framework |
| `uvicorn[standard]` | ASGI server |
| `mediapipe` | Face detection and landmarks |
| `transformers` + `huggingface_hub` | CLIP zero-shot classification |
| `ultralytics` | YOLO acne detection |
| `opencv-python` | Image processing |
| `pillow` | Image I/O |
| `numpy` | Numerical ops |
| `python-multipart` | Multipart form parsing |

**Scoring backends** (set via `MODEL_BACKEND` env var):
- `acne_severity` (default): fine-tuned acne model + CLIP for redness/bags
- `clip`: CLIP zero-shot for all conditions

**Key env vars** (`.env`):
- `MODEL_BACKEND` — `acne_severity` or `clip`
- `HEATMAP_ENABLED` — `0` or `1`
- `HEATMAP_BACKEND` — `uniform_face`, `yolo_acne`, `local_regions`, or `patch`
- `ACNE_DETECT_CONF` — YOLO confidence threshold (default 0.35)

---

### n8n / RAG Layer (`n8n/`)

- n8n workflows receive events from the backend (selfie_taken, selfie_analyzed, recommendations_given)
- Events are embedded via Ollama (`mxbai-embed-large`) and stored in Qdrant
- Chatbot queries retrieve relevant context from Qdrant (RAG), then generate responses via Ollama
- Workflow definitions live in `n8n/SkinProgress RAG.json`

---

## Authentication & Authorization

**JWT-based**:
- Frontend sends `Authorization: Bearer {token}` on all protected requests
- Backend validates via `JwtTokenService`; `UserId` extracted via `User.FindFirst("sub")`
- CORS is wide-open in dev (`AllowAnyOrigin`) — tighten in production

**Supported flows**:
1. **Google OAuth** — frontend sends auth code; backend validates via `Google.Apis.Auth`
2. **Email/Password** — registration → email confirmation → login; password reset via token
3. **Rate limiting** — `RateLimitService` uses `IMemoryCache` to throttle auth endpoints

**Protected controllers**: `EvolutionDashboardController`, `PhotoController`, `HabitsController`, `UsersController`

---

## Configuration Files

**Frontend** (`ui/`):
- `.env.local` — `VITE_GOOGLE_CLIENT_ID`, `VITE_API_BASE_URL`
- `vite.config.ts` — dev server, build output, plugin config
- `tsconfig.json` — strict TypeScript, target ES2020
- `eslint.config.js` — linting rules

**Backend** (`SkinProgress/`):
- `appsettings.json` — defaults (PostgreSQL connection, JWT, Qdrant, Ollama, AI service URL)
- `appsettings.Local.json` (git-ignored) — local overrides with real secrets
- `appsettings.Development.json` — dev JWT secret, Mailpit SMTP (port 1025), base URL

**Connection string format** (PostgreSQL, not SQL Server):
```json
"ConnectionStrings": {
  "DefaultConnection": "Host=localhost;Port=5432;Database=skinprogressdb;Username=admin;Password=..."
}
```

**AI Service** (`ai-service/`):
- `.env` — model backend, heatmap config, detection thresholds

**Project-wide**:
- `docker-compose.yml` — infrastructure services
- `Makefile` — common start commands
- `.env` — shared env vars for docker-compose (POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB, DB_PORT, QDRANT_API_KEY)

---

## Development Workflow

### Adding a Feature

1. **Backend first** (API contract):
   - Add Entity to `Models/Entities/`
   - Create Migration: `dotnet ef migrations add DescriptiveName`
   - Implement Service with interface in `Services/Interfaces/`
   - Register in `Program.cs`
   - Add Controller endpoint with `[Authorize]`

2. **Frontend**:
   - Add types in `src/types/` if needed
   - Extend or create API client in `src/services/`
   - Build components in `src/components/`
   - Wire up page in `src/pages/` or extend existing

3. **AI Service** (photo analysis only):
   - Update `app.py` endpoint logic
   - Test locally with sample images

### Testing

**Backend** (MSTest):
- Test files: `SkinProgress.Tests/[Feature]Tests.cs`
- Run: `dotnet test` or `dotnet test --filter "ClassName"`
- Active test suites: `EvolutionAnalyticsServiceTests`, `EncryptionServicePropertyTests`, `ActivityEventTests`, `OllamaEmbeddingServiceTests`

**Frontend**:
- No test framework configured yet; Jest recommended when added

**Integration**:
- Backend on `localhost:5000`, frontend on `localhost:5173`
- Use real PostgreSQL (run `docker compose up -d db` for just the DB)

---

## Code Style & Conventions

**C# Backend**:
- PascalCase classes/methods, camelCase parameters (Microsoft conventions)
- SOLID — all services injected via `IServiceCollection`
- Async/await for all I/O
- EF Core LINQ (avoid raw SQL)
- Always use DTOs in API responses — never expose entities directly

**TypeScript/React Frontend**:
- Strict TypeScript (`any` is banned)
- PascalCase components, camelCase functions/variables
- Functional components + hooks (React 19)

**Database**:
- All schema changes via EF Core migrations — never modify the database directly
- Indexes on `(UserId, Timestamp)` for range queries
- Foreign keys for referential integrity

---

## Common Patterns

### API Request with Auth
```typescript
const response = await axios.get('/api/evolution/dashboard', {
  params: { startDate: '2026-03-01', endDate: '2026-04-02' },
  headers: { Authorization: `Bearer ${token}` }
});
```

```csharp
[HttpGet]
[Authorize]
public async Task<ActionResult<SkinEvolutionDashboardDto>> GetDashboard(
    [FromQuery] DateTime startDate,
    [FromQuery] DateTime endDate)
{
    var userId = User.FindFirst("sub")?.Value;
    var result = await _analyticsService.GetDashboardAsync(userId, startDate, endDate);
    return Ok(result);
}
```

### Service Pattern
```csharp
// Interface in Services/Interfaces/
public interface IEvolutionAnalyticsService
{
    Task<SkinEvolutionDashboardDto> GetDashboardAsync(string userId, DateTime start, DateTime end);
}

// Implementation in Services/
public class EvolutionAnalyticsService : IEvolutionAnalyticsService
{
    private readonly AppDbContext _context;
    public EvolutionAnalyticsService(AppDbContext context) => _context = context;

    public async Task<SkinEvolutionDashboardDto> GetDashboardAsync(string userId, DateTime start, DateTime end)
    {
        var results = await _context.AnalysisResults
            .Where(r => r.UserId == userId && r.AnalysisDate >= start && r.AnalysisDate <= end)
            .ToListAsync();
        return new SkinEvolutionDashboardDto { ... };
    }
}

// Registration in Program.cs
builder.Services.AddScoped<IEvolutionAnalyticsService, EvolutionAnalyticsService>();
```

---

## Troubleshooting

**Database**:
- Wrong connection: Check `appsettings.Local.json` — must use PostgreSQL format (`Host=...;Port=5432;...`)
- DB not running: `docker compose up -d db`
- Migrations pending: `dotnet ef database update`

**Backend**:
- Build fails: `dotnet clean && dotnet restore`
- 401: Token expired or missing — re-login
- 404: Route missing from controller or controller not registered
- CORS: `Program.cs` uses `AllowAll` in dev — if errors appear, verify frontend origin

**Frontend**:
- Blank page: Check browser console; run `npm run build` to catch TypeScript errors
- Styles missing: Restart `npm run dev` (Tailwind v4 uses PostCSS watch)
- Auth loop: Check `authService` token storage and `/login` redirect logic

**AI Service**:
- Models not loaded: First run downloads from HuggingFace; set `HF_HOME` to a persistent path
- Slow first response: Model loading is cached after first call; `PRELOAD_MODELS=1` loads on startup

---

## References

- [Main README](README.md) — feature overview, setup, API endpoints
- [Specs Directory](specs/001-evolution-dashboard/) — detailed feature documentation
- [docker-compose.yml](docker-compose.yml) — authoritative infrastructure definition
- [Program.cs](SkinProgress/SkinProgress/Program.cs) — authoritative DI and middleware config

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
