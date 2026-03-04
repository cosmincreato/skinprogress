# AI Analyzer Service (Python)

This microservice analyzes a 3-photo selfie set (front/left/right) and returns condition trend scores for:

- acne
- redness
- under-eye bags

## Run locally

1. Create and activate a virtual environment.
2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Start service:

```bash
uvicorn app:app --host 0.0.0.0 --port 8001 --reload
```

## Run with Docker

From `ai-service/`:

```bash
docker build -t skinprogress-ai .
docker run --rm -p 8001:8001 --name skinprogress-ai skinprogress-ai
```

The service will be available at `http://localhost:8001`.

## Endpoint

- `POST /analyze-set`
  - multipart files: `front`, `left`, `right`
  - optional form fields: `user_id`, `date`

Returns JSON with overall + per-angle predictions and a summary.

## Note

Current implementation uses CLIP zero-shot classification as an MVP baseline.
For production quality, replace with a model fine-tuned on your target dermatology dataset and validated clinically.
