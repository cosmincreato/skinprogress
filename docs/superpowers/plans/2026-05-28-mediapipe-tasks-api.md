# MediaPipe Tasks API Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken `mp.solutions.face_mesh` API with `mp.tasks.vision.FaceLandmarker` so face detection works correctly on all selfie angles (front, left, right).

**Architecture:** Replace `_get_face_mesh()` and `_face_landmarks_xy()` in `ai-service/app.py` — same external interfaces, new internals. All callers (`_detect_face_bbox`, `_build_under_eye_heatmap`) are untouched. Model downloaded via `hf_hub_download` with a Google CDN fallback.

**Tech Stack:** Python, mediapipe 0.10+ Tasks API (`mp.tasks.vision.FaceLandmarker`), huggingface_hub, urllib

---

### Task 1: Add constants and `_get_face_landmarker()`

**Files:**
- Modify: `ai-service/app.py:57-70` (constants + globals)
- Modify: `ai-service/app.py:110-124` (replace `_get_face_mesh`)
- Test: `ai-service/tests/test_face_landmarker.py`

- [ ] **Step 1: Write failing tests**

Create `ai-service/tests/test_face_landmarker.py`:

```python
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from unittest.mock import patch, MagicMock
import importlib


def _reload_app():
    """Re-import app so module-level globals reset between tests."""
    import app as _app
    _app._face_landmarker = None
    return _app


def test_get_face_landmarker_returns_none_when_download_fails():
    """If model download raises, _get_face_landmarker returns None (no crash)."""
    app = _reload_app()
    with patch("app.hf_hub_download", side_effect=Exception("network error")):
        with patch("urllib.request.urlretrieve", side_effect=Exception("offline")):
            result = app._get_face_landmarker()
    assert result is None


def test_get_face_landmarker_returns_landmarker_on_success():
    """When download and init succeed, returns a non-None object."""
    app = _reload_app()
    fake_landmarker = MagicMock()

    with patch("app.hf_hub_download", return_value="/tmp/face_landmarker.task"):
        with patch("mediapipe.tasks.python.BaseOptions"):
            with patch("mediapipe.tasks.python.vision.FaceLandmarkerOptions"):
                with patch(
                    "mediapipe.tasks.python.vision.FaceLandmarker.create_from_options",
                    return_value=fake_landmarker,
                ):
                    result = app._get_face_landmarker()

    assert result is fake_landmarker


def test_get_face_landmarker_is_cached():
    """Second call returns same instance without re-downloading."""
    app = _reload_app()
    fake_landmarker = MagicMock()
    app._face_landmarker = fake_landmarker

    with patch("app.hf_hub_download") as mock_dl:
        result = app._get_face_landmarker()

    mock_dl.assert_not_called()
    assert result is fake_landmarker
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /c/Users/diap/Desktop/skinprogress/ai-service && python -m pytest tests/test_face_landmarker.py -v
```

Expected: `test_get_face_landmarker_returns_landmarker_on_success` and `test_get_face_landmarker_returns_none_when_download_fails` FAIL — `_get_face_landmarker` does not exist yet.

- [ ] **Step 3: Add constants to `app.py`**

After line 60 (`ACNE_DETECT_MODEL_FILE = ...`), add:

```python
FACE_LANDMARKER_MODEL_REPO = os.getenv("FACE_LANDMARKER_MODEL_REPO", "google/mediapipe").strip()
FACE_LANDMARKER_MODEL_FILE = os.getenv("FACE_LANDMARKER_MODEL_FILE", "face_landmarker.task").strip()
```

Change the globals block (lines 67-70) from:

```python
_clip_classifier = None
_acne_classifier = None
_acne_detector = None
_face_mesh = None
```

to:

```python
_clip_classifier = None
_acne_classifier = None
_acne_detector = None
_face_landmarker = None
_face_landmarker_initialized = False
```

- [ ] **Step 4: Replace `_get_face_mesh()` with `_get_face_landmarker()` in `app.py`**

Replace lines 110–124 (the entire `_get_face_mesh` function) with:

```python
def _get_face_landmarker():
    global _face_landmarker, _face_landmarker_initialized
    if _face_landmarker_initialized:
        return _face_landmarker

    _face_landmarker_initialized = True

    # Try HuggingFace Hub first, fall back to Google CDN
    model_path = None
    try:
        model_path = hf_hub_download(
            repo_id=FACE_LANDMARKER_MODEL_REPO,
            filename=FACE_LANDMARKER_MODEL_FILE,
        )
    except Exception as e:
        print(f"WARNING: hf_hub_download failed ({e}), trying Google CDN", flush=True)
        try:
            import urllib.request, tempfile
            url = (
                "https://storage.googleapis.com/mediapipe-models/"
                "face_landmarker/face_landmarker/float16/1/face_landmarker.task"
            )
            cache_dir = os.path.join(tempfile.gettempdir(), "mediapipe_models")
            os.makedirs(cache_dir, exist_ok=True)
            model_path = os.path.join(cache_dir, "face_landmarker.task")
            if not os.path.exists(model_path):
                urllib.request.urlretrieve(url, model_path)
        except Exception as e2:
            print(f"WARNING: CDN download also failed ({e2})", flush=True)
            _face_landmarker = None
            return None

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
        print(f"WARNING: FaceLandmarker init failed: {e}", flush=True)
        _face_landmarker = None

    return _face_landmarker
```

- [ ] **Step 5: Run tests — all 3 must pass**

```bash
cd /c/Users/diap/Desktop/skinprogress/ai-service && python -m pytest tests/test_face_landmarker.py -v
```

Expected:
```
PASSED tests/test_face_landmarker.py::test_get_face_landmarker_returns_none_when_download_fails
PASSED tests/test_face_landmarker.py::test_get_face_landmarker_returns_landmarker_on_success
PASSED tests/test_face_landmarker.py::test_get_face_landmarker_is_cached
```

- [ ] **Step 6: Commit**

```bash
git -C /c/Users/diap/Desktop/skinprogress add ai-service/app.py ai-service/tests/test_face_landmarker.py
git -C /c/Users/diap/Desktop/skinprogress commit -m "feat: add _get_face_landmarker with HuggingFace + CDN fallback"
```

---

### Task 2: Replace `_face_landmarks_xy()` body

**Files:**
- Modify: `ai-service/app.py:127-142`
- Test: `ai-service/tests/test_face_landmarker.py` (append)

- [ ] **Step 1: Add failing tests**

Append to `ai-service/tests/test_face_landmarker.py`:

```python
def _make_fake_landmarker(normalized_points):
    """
    Returns a mock FaceLandmarker whose detect() returns face_landmarks
    built from the given [(x_norm, y_norm), ...] list.
    If normalized_points is None, returns empty face_landmarks.
    """
    fake_result = MagicMock()
    if normalized_points is None:
        fake_result.face_landmarks = []
    else:
        fake_lms = []
        for x_norm, y_norm in normalized_points:
            lm = MagicMock()
            lm.x = x_norm
            lm.y = y_norm
            fake_lms.append(lm)
        fake_result.face_landmarks = [fake_lms]

    landmarker = MagicMock()
    landmarker.detect.return_value = fake_result
    return landmarker


def test_face_landmarks_xy_returns_none_when_landmarker_is_none():
    """If _get_face_landmarker returns None, _face_landmarks_xy returns None."""
    import numpy as np
    from PIL import Image
    app = _reload_app()
    image = Image.fromarray(np.full((100, 100, 3), 128, dtype=np.uint8))
    with patch("app._get_face_landmarker", return_value=None):
        result = app._face_landmarks_xy(image)
    assert result is None


def test_face_landmarks_xy_returns_none_when_no_face_detected():
    """If face_landmarks is empty, returns None."""
    import numpy as np
    from PIL import Image
    app = _reload_app()
    fake_lmk = _make_fake_landmarker(None)
    with patch("app._get_face_landmarker", return_value=fake_lmk):
        result = app._face_landmarks_xy(
            Image.fromarray(np.full((100, 100, 3), 128, dtype=np.uint8))
        )
    assert result is None


def test_face_landmarks_xy_converts_normalized_to_pixel_coords():
    """Normalized (0.5, 0.5) on a 200×100 image → pixel (100, 50)."""
    import numpy as np
    from PIL import Image
    app = _reload_app()
    # Two landmarks at normalized (0.5, 0.5) and (1.0, 0.0)
    fake_lmk = _make_fake_landmarker([(0.5, 0.5), (1.0, 0.0)])
    image = Image.fromarray(np.full((100, 200, 3), 128, dtype=np.uint8))  # w=200, h=100
    with patch("app._get_face_landmarker", return_value=fake_lmk):
        result = app._face_landmarks_xy(image)
    assert result is not None
    assert result.shape == (2, 2)
    assert result[0, 0] == 100   # x = 0.5 * 200 = 100
    assert result[0, 1] == 50    # y = 0.5 * 100 = 50
    assert result[1, 0] == 199   # x = 1.0 * 200 = 200, clipped to 199
    assert result[1, 1] == 0     # y = 0.0 * 100 = 0
```

- [ ] **Step 2: Run new tests to confirm they fail**

```bash
cd /c/Users/diap/Desktop/skinprogress/ai-service && python -m pytest tests/test_face_landmarker.py::test_face_landmarks_xy_converts_normalized_to_pixel_coords tests/test_face_landmarker.py::test_face_landmarks_xy_returns_none_when_no_face_detected tests/test_face_landmarker.py::test_face_landmarks_xy_returns_none_when_landmarker_is_none -v
```

Expected: all 3 FAIL — current `_face_landmarks_xy` calls `_get_face_mesh`, not `_get_face_landmarker`.

- [ ] **Step 3: Replace `_face_landmarks_xy` body in `app.py`**

Replace lines 127–142 (the entire `_face_landmarks_xy` function) with:

```python
def _face_landmarks_xy(image: Image.Image) -> np.ndarray | None:
    """Returns (N,2) array of landmark pixel coords, or None."""
    landmarker = _get_face_landmarker()
    if landmarker is None:
        return None
    try:
        img_rgb = np.array(image)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=img_rgb)
        result = landmarker.detect(mp_image)
        if not result.face_landmarks:
            return None
        w, h = image.size
        lms = result.face_landmarks[0]
        pts = np.array(
            [
                [int(np.clip(lm.x * w, 0, w - 1)), int(np.clip(lm.y * h, 0, h - 1))]
                for lm in lms
            ],
            dtype=np.int32,
        )
        return pts
    except Exception as e:
        print(f"WARNING: FaceLandmarker detection failed: {e}", flush=True)
        return None
```

- [ ] **Step 4: Run all tests — 6 original + 3 new = 9 total must pass**

```bash
cd /c/Users/diap/Desktop/skinprogress/ai-service && python -m pytest tests/ -v
```

Expected: 9 PASSED (6 from `test_face_bbox.py` + 3 new from `test_face_landmarker.py`). The 3 Task 1 tests also remain passing.

- [ ] **Step 5: Commit**

```bash
git -C /c/Users/diap/Desktop/skinprogress add ai-service/app.py ai-service/tests/test_face_landmarker.py
git -C /c/Users/diap/Desktop/skinprogress commit -m "feat: replace _face_landmarks_xy to use Tasks API FaceLandmarker"
```

---

### Task 3: Update startup preload, `.env`, and end-to-end verification

**Files:**
- Modify: `ai-service/app.py:243-251` (startup warmup)
- Modify: `.env`

- [ ] **Step 1: Update startup warmup in `app.py`**

In `_startup_preload_models`, the `_warmup` inner function currently is:

```python
    def _warmup():
        try:
            _get_clip_classifier()
            _get_acne_classifier()
            if HEATMAP_BACKEND == "yolo_acne":
                _get_acne_detector()
        except Exception:
            pass
```

Replace with:

```python
    def _warmup():
        try:
            _get_clip_classifier()
            _get_acne_classifier()
            _get_face_landmarker()
            if HEATMAP_BACKEND == "yolo_acne":
                _get_acne_detector()
        except Exception:
            pass
```

- [ ] **Step 2: Add env vars to `.env`**

Append to `c:/Users/diap/Desktop/skinprogress/.env`:

```
# AI Service: MediaPipe face landmarker model (Tasks API)
FACE_LANDMARKER_MODEL_REPO=google/mediapipe
FACE_LANDMARKER_MODEL_FILE=face_landmarker.task
```

> **Note for implementer:** If `hf_hub_download` fails for `google/mediapipe` / `face_landmarker.task`, the code automatically falls back to Google's CDN. No action needed — but if you want to verify the HuggingFace path first, run:
> ```bash
> python -c "from huggingface_hub import hf_hub_download; print(hf_hub_download('google/mediapipe', 'face_landmarker.task'))"
> ```
> If that errors, the CDN fallback will handle it at runtime.

- [ ] **Step 3: Run full test suite**

```bash
cd /c/Users/diap/Desktop/skinprogress/ai-service && python -m pytest tests/ -v
```

Expected: 9 PASSED, 0 FAILED.

- [ ] **Step 4: Restart AI service and verify in logs**

```bash
cd /c/Users/diap/Desktop/skinprogress/ai-service && uvicorn app:app --host 0.0.0.0 --port 8001
```

On startup (with `PRELOAD_MODELS=1`), expect to see the model download and no `AttributeError`. Then analyze a selfie set and confirm the logs show:

```
DEBUG: MediaPipe face bbox: x=..., y=..., w=..., h=...
```

instead of:

```
DEBUG: Haar face detection failed, using fallback ellipse
```

for all three angles.

- [ ] **Step 5: Commit**

```bash
git -C /c/Users/diap/Desktop/skinprogress add ai-service/app.py .env
git -C /c/Users/diap/Desktop/skinprogress commit -m "feat: update startup preload and env for FaceLandmarker"
```
