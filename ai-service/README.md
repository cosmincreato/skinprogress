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

Each angle also includes a heatmap overlay field:

- `heatmap_target` (condition key used for overlay)
- `heatmap_overlay_data_url` (PNG data URL with highlighted problem areas)

Note: heatmap generation uses patch-based localization and is slower than pure score-only analysis.

## Note

By default the service uses a dedicated acne severity classifier (better than CLIP zero-shot for acne).

### Configuration (env vars)

- `MODEL_BACKEND`
  - `acne_severity` (default): acne from a supervised acne model + redness/bags from CLIP
  - `clip`: all three scores from CLIP zero-shot (original behavior)
- `ACNE_MODEL_ID` (default: `imfarzanansari/skintelligent-acne`)
- `CLIP_MODEL_ID` (default: `openai/clip-vit-base-patch32`)
- `HEATMAP_ENABLED`
  - `0` (default): do not generate heatmap overlay (much faster)
  - `1`: enable heatmap overlay
- `HEATMAP_BACKEND`
  - `uniform_face` (recommended for your request): uniformly colors detected facial skin
  - `yolo_acne`: uses a YOLO acne detector for acne heatmaps (lesion-localized)
  - `patch` (fallback): uses patch-based CLIP localization (slow, less accurate)
  - `local_regions` (recommended): fully local inference for *all* overlays:
    - acne: YOLO detections → blobs
    - redness: LAB a* channel on facial skin
    - under-eye bags: landmark-based under-eye darkness
- `ACNE_DETECT_MODEL_REPO` (default: `Tinny-Robot/acne`)
- `ACNE_DETECT_MODEL_FILE` (default: `acne.pt`)
- `ACNE_DETECT_CONF` (default: `0.35`) confidence threshold
- `ACNE_DETECT_IOU` (default: `0.55`) NMS IoU threshold
- `ACNE_DETECT_MAX_DET` (default: `250`) max detections per image
- `ACNE_HEATMAP_RADIUS_RATIO` (default: `0.55`) detection spot radius as ratio of box size
- `UNIFORM_FACE_ALPHA` (default: `120`) alpha strength for `uniform_face` mode (0-255)
