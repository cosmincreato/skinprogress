# MediaPipe Tasks API Migration Design

**Date:** 2026-05-28  
**Status:** Approved  
**Scope:** `ai-service/app.py` only — two function replacements

## Problem

`mp.solutions.face_mesh` was removed in mediapipe 0.10.35 on Python 3.14. As a result, `_get_face_mesh()` always returns `None`, `_face_landmarks_xy()` always returns `None`, and all face detection falls through to the center-ellipse fallback. That ellipse is a hardcoded rectangle centered at `(image_width // 2, height * 0.42)` — it does not track where the face actually is in side-profile selfies, allowing YOLO and the color-based blemish detector to pick up hands and hair.

## Solution

Replace `_get_face_mesh()` with `_get_face_landmarker()` using the current MediaPipe Tasks API (`mp.tasks.vision.FaceLandmarker`). Keep `_face_landmarks_xy()` signature identical so all callers (`_detect_face_bbox`, `_build_under_eye_heatmap`) require no changes.

## Changes

### 1. New constants (`.env` + `app.py`)

Add to `.env`:
```
FACE_LANDMARKER_MODEL_REPO=google/mediapipe
FACE_LANDMARKER_MODEL_FILE=face_landmarker.task
```

Add to `app.py` alongside existing model constants:
```python
FACE_LANDMARKER_MODEL_REPO = os.getenv("FACE_LANDMARKER_MODEL_REPO", "google/mediapipe").strip()
FACE_LANDMARKER_MODEL_FILE = os.getenv("FACE_LANDMARKER_MODEL_FILE", "face_landmarker.task").strip()
```

If `face_landmarker.task` is not available on the configured HuggingFace repo, fall back to a direct download from Google's CDN: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`.

### 2. Replace `_get_face_mesh()` → `_get_face_landmarker()`

**Remove:** `_get_face_mesh()` and its global `_face_mesh`.

**Add:** `_get_face_landmarker()` with a module-level `_face_landmarker` global.

```python
_face_landmarker = None

def _get_face_landmarker():
    global _face_landmarker
    if _face_landmarker is not None:
        return _face_landmarker
    try:
        model_path = hf_hub_download(
            repo_id=FACE_LANDMARKER_MODEL_REPO,
            filename=FACE_LANDMARKER_MODEL_FILE,
        )
    except Exception:
        # Fall back to direct Google CDN download
        import urllib.request, tempfile, os
        url = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
        cache_dir = os.path.join(tempfile.gettempdir(), "mediapipe_models")
        os.makedirs(cache_dir, exist_ok=True)
        model_path = os.path.join(cache_dir, "face_landmarker.task")
        if not os.path.exists(model_path):
            urllib.request.urlretrieve(url, model_path)
    try:
        from mediapipe.tasks import python as _mp_python
        from mediapipe.tasks.python import vision as _mp_vision
        base_options = _mp_python.BaseOptions(model_asset_path=model_path)
        options = _mp_vision.FaceLandmarkerOptions(
            base_options=base_options,
            num_faces=1,
            min_face_detection_confidence=0.5,
            min_face_presence_score=0.5,
            min_tracking_confidence=0.5,
            output_face_blendshapes=False,
            output_facial_transformation_matrixes=False,
        )
        _face_landmarker = _mp_vision.FaceLandmarker.create_from_options(options)
    except Exception as e:
        print(f"WARNING: Could not load FaceLandmarker: {e}", flush=True)
        _face_landmarker = None
    return _face_landmarker
```

### 3. Replace `_face_landmarks_xy()` body

Keep signature: `(image: Image.Image) -> np.ndarray | None`  
Keep return type: `(N, 2)` int32 array of pixel coords, or `None`.

```python
def _face_landmarks_xy(image: Image.Image) -> np.ndarray | None:
    landmarker = _get_face_landmarker()
    if landmarker is None:
        return None
    try:
        import mediapipe as mp
        img_rgb = np.array(image)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=img_rgb)
        result = landmarker.detect(mp_image)
        if not result.face_landmarks:
            return None
        w, h = image.size
        lms = result.face_landmarks[0]
        pts = np.array(
            [[int(np.clip(lm.x * w, 0, w - 1)), int(np.clip(lm.y * h, 0, h - 1))]
             for lm in lms],
            dtype=np.int32,
        )
        return pts
    except Exception as e:
        print(f"WARNING: FaceLandmarker detection failed: {e}", flush=True)
        return None
```

### 4. Update startup preload

Replace `_get_face_mesh()` call in `_startup_preload_models` with `_get_face_landmarker()`.

## What Does Not Change

- `_detect_face_bbox` — calls `_face_landmarks_xy`, unchanged
- `_build_under_eye_heatmap` — calls `_face_landmarks_xy`, unchanged
- `_build_face_focus_mask`, `_get_face_focus_bounds` — call `_detect_face_bbox`, unchanged
- `_build_acne_yolo_heatmap_overlay` — unchanged
- Backend, frontend, `.env` structure — unchanged except two new vars

## Error Handling

| Scenario | Behaviour |
|---|---|
| HuggingFace download fails | Falls back to Google CDN download |
| CDN download also fails (offline) | `_face_landmarker = None`, `_face_landmarks_xy` returns `None`, `_detect_face_bbox` falls back to Haar then ellipse |
| `FaceLandmarker` init fails | Same graceful None fallback |
| Face not found in image | `result.face_landmarks` is empty → returns `None` → Haar fallback |

## Testing

- Unit: mock `_get_face_landmarker` to return a fake landmarker, verify `_face_landmarks_xy` extracts correct pixel coords
- Unit: verify `_face_landmarks_xy` returns `None` when landmarker returns empty `face_landmarks`
- Manual: restart AI service, analyze side selfie with hand visible, confirm `DEBUG: MediaPipe face bbox:` appears in logs (not `Haar face detection failed`)
