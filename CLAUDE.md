# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**SkinProgress** is a full-stack skin analysis and tracking application with AI-powered insights. It's a monorepo containing:

- **Frontend** (`ui/`): React 19 + TypeScript + Vite + Tailwind CSS
- **Backend** (`SkinProgress/`): .NET 9.0 + Entity Framework Core + SQL Server
- **AI Service** (`ai-service/`): Python FastAPI for skin condition analysis
- **Workflows** (`n8n/`): n8n automation and chatbot integration

Core features: evolution dashboard with trend visualization, PDF export, period comparison, AI-powered photo analysis (acne/redness/under-eye bags detection), photo gallery, habits tracking, badge system, chat integration with Qdrant vector search.

## Quick Commands

### Frontend (`ui/`)
```bash
npm install              # Install dependencies
npm run dev              # Start Vite dev server (http://localhost:5173)
npm run build            # Production build
npm run lint             # Run ESLint
npm test                 # Run Jest tests (when configured)
```

### Backend (`SkinProgress/`)
```bash
dotnet restore           # Restore NuGet packages
dotnet build             # Build solution
dotnet build -c Release  # Release build
dotnet run               # Start backend server (http://localhost:5000)
dotnet test              # Run all tests
dotnet ef database update # Apply pending migrations
```

### AI Service (`ai-service/`)
```bash
pip install -r requirements.txt              # Install Python dependencies
uvicorn app:app --host 0.0.0.0 --port 8001  # Start service
# Or use Docker: docker compose up ai-analyzer
```

### Docker (Full Stack)
```bash
docker compose build     # Build all services
docker compose up -d     # Start all services in background
docker compose down      # Stop all services
docker compose logs -f   # Stream logs
```

### Quick Development Startup (Windows)
Use the Makefile:
```bash
make start-dev           # Opens 3 terminals for AI, Backend, Frontend
make start-backend       # Start backend only
make start-frontend      # Start frontend only
make start-ai            # Start AI service only
```

## Architecture

### Frontend (`ui/`)

**Structure**:
```
src/
├── pages/                  # Route-level components (EvolutionPage, GalleryPage, ProfilePage, etc.)
├── components/
│   ├── evolution/         # Evolution dashboard components (TrendGraph, DateRangeFilter, ExportReportButton, PeriodComparison)
│   ├── auth/              # Auth components (EmailLogin, EmailRegister, ConfirmEmail, ForgotPassword, ResetPassword)
│   └── [other]            # SelfieCamera, ChatbotWidget, FaceDetectionOverlay, Face3DModel, Layout
├── services/              # API clients and business logic (analyticsApi, authService, photoService, habitsService, faceDetectionService)
├── types/                 # TypeScript types (evolution.ts, FaceDetection.ts)
└── App.tsx / main.tsx    # Entry point with routing
```

**Key Technologies**:
- **React Router v7** for routing (`/evolution`, `/gallery`, `/profile`, etc.)
- **Recharts** for interactive trend graphs (line, bar charts for metrics over time)
- **Tailwind CSS v4** for styling
- **TypeScript ~5.9** for type safety
- **Three.js** for 3D face model visualization
- **html2pdf.js** for PDF export
- **TensorFlow.js + Face-API** for client-side face detection (coordinates, landmarks)
- **Axios** for HTTP requests with JWT bearer token auth

**Authentication Flow**: Google OAuth or email-based (JWT tokens stored, sent as Bearer header in all API requests).

### Backend (`SkinProgress/`)

**Structure**:
```
SkinProgress/
├── Controllers/           # API endpoints (AuthController, EvolutionDashboardController, PhotoController, HabitsController)
├── Services/
│   ├── [Service].cs       # Business logic (EvolutionAnalyticsService, PhotoService, AuthService, EmailService, etc.)
│   └── Interfaces/        # Service contracts
├── Models/
│   ├── DTOs/              # Data transfer objects (SkinEvolutionDashboardDto, PeriodComparisonDto, AnalysisResultDto, etc.)
│   ├── Entities/          # Database entities (User, Photo, AnalysisResult, AuditLog, Badge, HabitDefinition, etc.)
│   └── [other]            # Constants, enums
├── Data/                  # DbContext (AppDbContext)
├── Migrations/            # EF Core migrations for schema versioning
└── Program.cs             # Dependency injection, middleware setup, JWT config
```

**Key Technologies**:
- **.NET 9.0** with async/await patterns
- **Entity Framework Core 9.0+** for ORM (migrations, LINQ queries, change tracking)
- **SQL Server** (LocalDB or containerized)
- **JWT Bearer Authentication** via `IdentityModel.Tokens`
- **Swagger/OpenAPI** for API documentation (available at `/swagger`)
- **Qdrant Client** for vector similarity search (habit recommendations, content discovery)

**Database Design**:
- `User` - authentication, profile, preferences
- `Photo` / `SelfieCapture` - image metadata, capture orientation
- `AnalysisResult` - AI analysis scores (acne, redness, bags severity 0-10)
- `HabitDefinition` / `HabitCompletion` / `HabitStreak` - habit tracking
- `Badge` / `UserBadge` - achievement system
- `ChatMessage` / `ChatSession` - conversation history
- `AuditLog` - GDPR compliance logging
- `PasswordResetToken` / `UserEmailConfirmationToken` - auth token lifecycle
- Indexed on `(UserId, Timestamp)` for efficient time-range queries

**Key Services**:
- `EvolutionAnalyticsService` - calculates trend percentages, zone averages, period deltas
- `PhotoService` - image storage, compression, EXIF extraction
- `AuthService` - JWT generation, password hashing (bcrypt), OAuth token validation
- `EmailService` - confirmation emails, password reset
- `JwtTokenService` - token creation/validation with expiry
- `QdrantService` - vector search for habit/product recommendations

### AI Service (`ai-service/`)

**Python FastAPI microservice** for analyzing a 3-photo selfie set (front, left, right angles).

**Key Features**:
- **Face detection** via MediaPipe (landmarks, face bounds expansion)
- **Condition scoring** (acne, redness, bags) with two backends:
  - `acne_severity` (default): fine-tuned acne model + CLIP for redness/bags
  - `clip`: CLIP zero-shot for all conditions
- **Heatmap generation** (optional, slower) highlighting problem areas using YOLO acne detection or LAB color analysis
- **Configurable via environment variables** (model backend, heatmap style, detection thresholds)

**Endpoint**:
- `POST /analyze-set` - accepts multipart form (files: front, left, right; optional: user_id, date)
- Returns JSON with overall scores, per-angle predictions, heatmap data URLs

**Configurations** in `.env`:
- `MODEL_BACKEND` - `acne_severity` or `clip`
- `HEATMAP_ENABLED` - `0` or `1`
- `HEATMAP_BACKEND` - `uniform_face`, `yolo_acne`, `local_regions`, or `patch`
- `ACNE_DETECT_CONF` - YOLO confidence threshold (default 0.35)

## Authentication & Authorization

**JWT-based authentication**:
- Frontend sends JWT in `Authorization: Bearer {token}` header
- Backend validates token signature and expiry via `JwtTokenService`
- Token includes `UserId` claim; extracted in controllers via `User.FindFirst("sub")`

**Supported auth flows**:
1. **Google OAuth** - frontend exchanges auth code for token via backend, backend validates with Google
2. **Email/Password** - registration, login, password reset with confirmation emails
3. **Token Refresh** - tokens expire; frontend handles refresh on 401 responses (mechanism: refresh token rotation or request new token)

**Protected Routes**:
- Evolution dashboard endpoints require JWT bearer token
- Photo operations require auth
- Habit and badge endpoints require auth

## Configuration Files

**Frontend** (`ui/`):
- `.env` or `.env.local` - `VITE_GOOGLE_CLIENT_ID`, `VITE_API_BASE_URL`
- `vite.config.ts` - dev server proxy, build output, plugin config
- `tsconfig.json` - compiler options (target ES2020, strict mode)
- `eslint.config.js` - linting rules
- `tailwind.config.ts` - CSS color/spacing customization
- `postcss.config.cjs` - Tailwind CSS processing

**Backend** (`SkinProgress/`):
- `appsettings.json` - database connection, logging, JWT secret
- `appsettings.Local.json` (git-ignored) - local overrides (SQL Server connection, AI service URL, email credentials)
- `appsettings.Development.json` - dev-specific settings

**AI Service** (`ai-service/`):
- `.env` - model IDs, heatmap settings, detection thresholds
- `requirements.txt` - Python dependencies

**Project-wide**:
- `docker-compose.yml` - service definitions (frontend, backend, AI, SQL Server, n8n, Qdrant)
- `Makefile` - common start commands
- `DESCRIPTION_LICENSE.md` - feature licensing

## Development Workflow

### Adding a Feature

1. **Backend first** (API contract):
   - Add Entity to `Models/Entities/`
   - Create Migration: `dotnet ef migrations add DescriptiveName`
   - Implement Service in `Services/` with interface in `Services/Interfaces/`
   - Add Controller endpoint
   - Add integration tests in `SkinProgress.Tests/`

2. **Frontend** (UI implementation):
   - Create types in `src/types/` if needed
   - Create API client in `src/services/` or extend existing
   - Implement components in `src/components/`
   - Add page in `src/pages/` or reuse existing
   - Add ESLint/TypeScript validation pass

3. **AI Service** (if analyzing photos):
   - Update `app.py` endpoint logic
   - Test with sample images locally

### Testing

**Backend**:
- Unit tests: `SkinProgress.Tests/[Feature]Tests.cs` using MSTest
- Run: `dotnet test` or `dotnet test --filter "ClassName"`
- Coverage: `dotnet test /p:CollectCoverage=true` (generates `coverage/` report)
- Current coverage: EvolutionAnalyticsService (11 tests), EvolutionDashboardController (11 integration tests)

**Frontend**:
- Jest tests framework (not yet fully set up; components exist in codebase)
- Run: `npm test` (when configured)
- Snapshot tests for components recommended

**Integration**:
- Start backend on `localhost:5000`, frontend on `localhost:5173`
- Test with real database (not mocks)
- E2E tests: `npm run test:e2e` (when available)

## Code Style & Conventions

**C# Backend**:
- Microsoft C# Coding Conventions (PascalCase classes/methods, camelCase parameters)
- SOLID principles (Dependency Injection via `IServiceCollection`)
- Async/await for I/O operations
- Entity Framework LINQ for queries (avoid raw SQL unless necessary)
- DTOs for API responses (separate from entities to avoid exposure of sensitive fields)

**TypeScript/React Frontend**:
- ESLint + Prettier for formatting
- PascalCase component names
- camelCase for functions/variables
- Type-safe (strict TypeScript, avoid `any`)
- Functional components with hooks (React 19)
- Custom hooks for reusable logic

**Database**:
- SQL Server conventions (PascalCase table/column names)
- Migrations for all schema changes (never modify database directly)
- Foreign keys for referential integrity
- Indexes on frequently queried columns (`UserId`, `Timestamp`)

## Common Patterns

### API Request with Auth
```typescript
// Frontend
const response = await axios.get('/api/evolution/dashboard', {
  params: { startDate: '2026-03-01', endDate: '2026-04-02' },
  headers: { Authorization: `Bearer ${token}` }
});
```

```csharp
// Backend controller
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

### Entity & Migration
```csharp
// Entity
public class AnalysisResult
{
    public int Id { get; set; }
    public string UserId { get; set; }
    public DateTime AnalysisDate { get; set; }
    public decimal AcneSeverity { get; set; }
    public User User { get; set; } // FK
}

// Migration
modelBuilder.Entity<AnalysisResult>()
    .HasIndex(a => new { a.UserId, a.AnalysisDate })
    .IsUnique(false);
```

### Service Pattern
```csharp
// Interface
public interface IEvolutionAnalyticsService
{
    Task<SkinEvolutionDashboardDto> GetDashboardAsync(string userId, DateTime start, DateTime end);
}

// Implementation
public class EvolutionAnalyticsService : IEvolutionAnalyticsService
{
    private readonly AppDbContext _context;
    public EvolutionAnalyticsService(AppDbContext context) => _context = context;

    public async Task<SkinEvolutionDashboardDto> GetDashboardAsync(string userId, DateTime start, DateTime end)
    {
        var results = await _context.AnalysisResults
            .Where(r => r.UserId == userId && r.AnalysisDate >= start && r.AnalysisDate <= end)
            .ToListAsync();
        // Calculate deltas, trends, etc.
        return new SkinEvolutionDashboardDto { ... };
    }
}

// Registration in Program.cs
builder.Services.AddScoped<IEvolutionAnalyticsService, EvolutionAnalyticsService>();
```

### React Component with API Call
```typescript
import { useEffect, useState } from 'react';
import axios from 'axios';

export function EvolutionDashboard() {
    const [data, setData] = useState<SkinEvolutionDashboardDto | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            const response = await axios.get('/api/evolution/dashboard', {
                params: { startDate: '2026-03-01', endDate: '2026-04-02' },
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            setData(response.data);
            setLoading(false);
        };
        fetchData();
    }, []);

    if (loading) return <div>Loading...</div>;
    return <div>{/* Render data */}</div>;
}
```

## Database Setup

**SQL Server (Local)**:
```bash
# Windows: SQL Server LocalDB (installed with Visual Studio)
# Or Docker:
docker run -e "ACCEPT_EULA=Y" -e "SA_PASSWORD=YourPassword123!" -p 1433:1433 mcr.microsoft.com/mssql/server
```

**Connection String** (in `appsettings.Local.json`):
```json
"ConnectionStrings": {
    "DefaultConnection": "Server=(localdb)\\mssqllocaldb;Database=SkinProgress;Trusted_Connection=true;"
}
```

**Apply Migrations**:
```bash
dotnet ef database update
```

## Deployment Notes

- **Frontend**: Build with `npm run build`, serve `dist/` folder via CDN or static host
- **Backend**: Publish with `dotnet publish -c Release`, run with `dotnet SkinProgress.dll`
- **Database**: Migrations auto-applied on startup or via CLI before deployment
- **Environment Variables**: Use `.env` files locally, CI/CD secrets in production
- **Docker**: Multi-stage builds for optimized image sizes; use `docker-compose` for orchestration

## Performance Considerations

- **Database**: Indexes on `(UserId, Timestamp)` for efficient range queries; pagination for large result sets
- **Frontend**: Code splitting via Vite, lazy loading of routes, Recharts chart optimization for large datasets
- **Images**: EXIF stripping, compression via `ImageCompressionService`; CDN caching recommended
- **API**: Dashboard load target <2s (4G), date-range interaction <500ms, PDF export <10s

## Troubleshooting

**Build Issues**:
- Frontend: Delete `node_modules/` and `package-lock.json`, run `npm install` again
- Backend: Run `dotnet clean && dotnet restore` if project files changed
- AI Service: Check Python version (3.8+), reinstall with `pip install --upgrade -r requirements.txt`

**Database Issues**:
- Connection string wrong: Check `appsettings.Local.json` and SQL Server instance running
- Migrations pending: Run `dotnet ef database update`
- Foreign key violations: Ensure dependent records exist before insert

**API Issues**:
- 401 Unauthorized: Token expired or missing; refresh JWT via login
- 404 Not Found: Route not registered in controller or controller not added to middleware
- CORS errors: Check `Program.cs` CORS policy allows frontend origin

**Frontend Issues**:
- Blank page: Check browser console for TypeScript errors; ensure `npm run build` passes
- API call fails: Verify backend running on correct port, auth token valid
- Styles missing: Rebuild Tailwind CSS with `npm run dev`

## Project Status

✅ **Current Release**: v1.0-evolution (Phase 5 Complete)
- Core features implemented (trend graphs, PDF export, period comparison)
- Backend and frontend fully functional
- Performance and accessibility targets met
- Phase 6: Testing expansion and final optimizations

**Next Phase**:
- Expand Jest test coverage for frontend components
- Add E2E tests via Playwright or Cypress
- Performance optimization and mobile testing
- Final bug fixes and polish

## References

- [Main README](README.md) - feature overview, setup, API endpoints
- [Specs Directory](specs/001-evolution-dashboard/) - detailed feature documentation
- [Performance Report](specs/001-evolution-dashboard/testing/performance-report.md)
- [Accessibility Audit](specs/001-evolution-dashboard/testing/accessibility-audit.md)
