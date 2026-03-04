# skinprogress

## Google Sign-In

1. **Create a Google OAuth 2.0 Client ID** at [Google Cloud Console](https://console.cloud.google.com/apis/credentials). Create a "Web application" client and add your UI origin (e.g. `http://localhost:5173` for Vite dev).

2. **Backend:** Set `Google:ClientId` in `SkinProgress/SkinProgress/appsettings.json` or `appsettings.Local.json`:

   ```json
   "Google": { "ClientId": "YOUR_CLIENT_ID.apps.googleusercontent.com" }
   ```

3. **Frontend:** Copy `ui/.env.example` to `ui/.env` and set `VITE_GOOGLE_CLIENT_ID` to the same Client ID.

4. Run `npm install` in `ui/`, then `npm run dev`. The "Sign in with Google" button appears on the auth page when the client ID is configured.

## AI Set Analysis (MVP)

The app supports analyzing a daily selfie set (`front`, `left`, `right`) from the gallery.

### 1) Run Python AI microservice

From `ai-service/`:

```bash
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8001 --reload
```

Or run it in Docker from repo root:

```bash
docker compose up -d ai-analyzer
```

### 2) Backend configuration

Set in `SkinProgress/SkinProgress/appsettings.Local.json`:

```json
"AiService": {
   "BaseUrl": "http://localhost:8001"
}
```

### 3) Use in UI

Open `View All` gallery and click **Analyze Set** on any daily card.

### Notes

- Current analyzer is a zero-shot CLIP baseline for MVP.
- Output is informational only and not a medical diagnosis.
