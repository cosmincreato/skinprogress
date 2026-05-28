# Face-Crop YOLO Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make YOLO detect acne only on the face by cropping to the face region before running detection, eliminating false positives on hands, hair, and background.

**Architecture:** Update `_detect_face_bbox` to use MediaPipe face mesh landmarks first (already loaded) for accurate side-profile support, falling back to Haar. Then crop the input to the face bounds before calling YOLO, offsetting detection coordinates back to original image space.

**Tech Stack:** Python, MediaPipe (already imported), OpenCV, Ultralytics YOLO, Pillow

---

### Task 1: Update `_detect_face_bbox` to use MediaPipe landmarks first

**Files:**
- Modify: `ai-service/app.py:835-854`
- Create: `ai-service/tests/test_face_bbox.py`

- [ ] **Step 1: Create test file with a failing test**

Create `ai-service/tests/__init__.py` (empty) and `ai-service/tests/test_face_bbox.py`:

```python
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import numpy as np
from PIL import Image
from unittest.mock import patch


def make_solid_image(w=100, h=100):
    """Solid grey image — no face, so both MediaPipe and Haar return None."""
    return Image.fromarray(np.full((h, w, 3), 128, dtype=np.uint8))


def test_returns_none_when_no_face_detected():
    """With a blank image, _detect_face_bbox must return None (not crash)."""
    from app import _detect_face_bbox
    result = _detect_face_bbox(make_solid_image())
    assert result is None


def test_mediapipe_result_preferred_over_haar():
    """When MediaPipe returns landmarks, the result comes from them, not Haar."""
    import numpy as np
    from app import _detect_face_bbox

    fake_pts = np.array([[50, 60], [150, 60], [50, 200], [150, 200]], dtype=np.int32)

    with patch("app._face_landmarks_xy", return_value=fake_pts):
        result = _detect_face_bbox(make_solid_image(w=300, h=300))

    assert result is not None
    x, y, w, h = result
    assert x == 50
    assert y == 60
    assert w == 100   # 150 - 50
    assert h == 140   # 200 - 60


def test_falls_back_to_haar_when_mediapipe_returns_none():
    """When MediaPipe finds no landmarks, Haar cascade is tried."""
    from app import _detect_face_bbox

    with patch("app._face_landmarks_xy", return_value=None):
        # Blank image → Haar also finds nothing → None
        result = _detect_face_bbox(make_solid_image())

    assert result is None
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd ai-service
python -m pytest tests/test_face_bbox.py -v
```

Expected: `test_mediapipe_result_preferred_over_haar` and `test_falls_back_to_haar_when_mediapipe_returns_none` FAIL because `_detect_face_bbox` doesn't call `_face_landmarks_xy` yet. `test_returns_none_when_no_face_detected` may pass already.

- [ ] **Step 3: Replace `_detect_face_bbox` in `app.py`**

Replace lines 835–854:

```python
def _detect_face_bbox(image: Image.Image) -> tuple[int, int, int, int] | None:
    # Try MediaPipe face mesh first — handles frontal and side-facing photos
    pts = _face_landmarks_xy(image)
    if pts is not None:
        iw, ih = image.size
        x1 = int(np.clip(pts[:, 0].min(), 0, iw - 1))
        y1 = int(np.clip(pts[:, 1].min(), 0, ih - 1))
        x2 = int(np.clip(pts[:, 0].max(), 0, iw - 1))
        y2 = int(np.clip(pts[:, 1].max(), 0, ih - 1))
        fw, fh = x2 - x1, y2 - y1
        if fw >= 20 and fh >= 20:
            print(f"DEBUG: MediaPipe face bbox: x={x1}, y={y1}, w={fw}, h={fh}")
            return x1, y1, fw, fh

    # Fall back to Haar cascade for frontal faces
    image_rgb = np.array(image)
    image_gray = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2GRAY)
    face_cascade = cv2.CascadeClassifier(
        cv2.data.haarcascades + "haarcascade_frontalface_default.xml",
    )
    faces = face_cascade.detectMultiScale(
        image_gray,
        scaleFactor=1.1,
        minNeighbors=5,
        minSize=(48, 48),
    )
    if faces is None or len(faces) == 0:
        return None
    largest = max(faces, key=lambda item: item[2] * item[3])
    x, y, w, h = [int(value) for value in largest]
    return x, y, w, h
```

- [ ] **Step 4: Run tests again — all three must pass**

```bash
cd ai-service
python -m pytest tests/test_face_bbox.py -v
```

Expected output:
```
PASSED tests/test_face_bbox.py::test_returns_none_when_no_face_detected
PASSED tests/test_face_bbox.py::test_mediapipe_result_preferred_over_haar
PASSED tests/test_face_bbox.py::test_falls_back_to_haar_when_mediapipe_returns_none
```

- [ ] **Step 5: Commit**

```bash
git add ai-service/app.py ai-service/tests/__init__.py ai-service/tests/test_face_bbox.py
git commit -m "feat: use MediaPipe landmarks for face bbox, fall back to Haar"
```

---

### Task 2: Crop image to face bounds before running YOLO

**Files:**
- Modify: `ai-service/app.py:643-693` (inside `_build_acne_yolo_heatmap_overlay`)

- [ ] **Step 1: Add a test for coordinate offset logic**

Add to `ai-service/tests/test_face_bbox.py`:

```python
def test_crop_offset_centres_are_within_original_image():
    """
    Simulates what the updated YOLO loop does: detection coords from a crop
    must be offset by crop origin to land inside the original image.
    """
    # Pretend face crop starts at (80, 100) in the original 640x480 image
    crop_left, crop_top = 80, 100
    # YOLO found a box at (10, 15, 50, 55) within the crop
    x1, y1, x2, y2 = 10.0, 15.0, 50.0, 55.0
    cx = int((x1 + x2) / 2) + crop_left
    cy = int((y1 + y2) / 2) + crop_top

    assert cx == 110   # 30 + 80
    assert cy == 135   # 35 + 100
```

Run to confirm it passes immediately (pure arithmetic, no import):

```bash
cd ai-service
python -m pytest tests/test_face_bbox.py::test_crop_offset_centres_are_within_original_image -v
```

Expected: PASS

- [ ] **Step 2: Replace the YOLO predict call and detection loop in `_build_acne_yolo_heatmap_overlay`**

In `ai-service/app.py`, find the block starting at line 643 (`detector = _get_acne_detector()`) through line 693 (end of the `for i in range(det_count)` loop). Replace it with:

```python
    # Crop to face region — YOLO only sees the face, not hands/hair/background
    crop_left, crop_top = focus_left, focus_top
    face_crop = image.crop((crop_left, crop_top, focus_right, focus_bottom))
    crop_w, crop_h = face_crop.size
    if crop_w < 8 or crop_h < 8:
        print("WARNING: Face crop too small, running YOLO on full image", flush=True)
        face_crop = image
        crop_left, crop_top = 0, 0

    detector = _get_acne_detector()
    results = detector.predict(
        np.array(face_crop),
        verbose=False,
        conf=ACNE_DETECT_CONF,
        iou=ACNE_DETECT_IOU,
        max_det=ACNE_DETECT_MAX_DET,
    )
    if not results:
        return None

    result = results[0]
    boxes = getattr(result, "boxes", None)
    if boxes is None or getattr(boxes, "xyxy", None) is None:
        return None

    xyxy = boxes.xyxy
    conf = getattr(boxes, "conf", None)
    if xyxy is None:
        return None

    # Build face and skin masks for stricter filtering
    face_mask = _build_face_focus_mask(image_width, image_height, image)
    skin_mask = _build_skin_mask(image)

    # Create heatmap from YOLO detections (local model)
    heatmap = np.zeros((image_height, image_width), dtype=np.float32)

    y_indices, x_indices = np.ogrid[:image_height, :image_width]

    det_count = int(xyxy.shape[0]) if hasattr(xyxy, "shape") else 0
    print(f"DEBUG: YOLO detections: {det_count}")

    # If YOLO returns nothing usable, fall back to color-based spot detection
    use_color_fallback = det_count == 0
    if not use_color_fallback:
        for i in range(det_count):
            x1, y1, x2, y2 = [float(v) for v in xyxy[i].tolist()]
            # Offset crop-relative coordinates back to full image space
            cx = int((x1 + x2) / 2) + crop_left
            cy = int((y1 + y2) / 2) + crop_top
            bw = max(2.0, x2 - x1)
            bh = max(2.0, y2 - y1)
            radius = max(6.0, 0.5 * (bw + bh) * 0.5 * ACNE_HEATMAP_RADIUS_RATIO)
            sigma = max(6.0, radius / 1.8)
            c = float(conf[i]) if conf is not None else 0.6
            intensity = float(np.clip(c, 0.15, 1.0))

            # Gaussian blob
            distance2 = (x_indices - cx) ** 2 + (y_indices - cy) ** 2
            blob = intensity * np.exp(-distance2 / (2.0 * sigma**2))
            heatmap = np.maximum(heatmap, blob.astype(np.float32))
```

- [ ] **Step 3: Run all tests**

```bash
cd ai-service
python -m pytest tests/test_face_bbox.py -v
```

Expected: all 4 tests PASS.

- [ ] **Step 4: Restart the AI service and do a manual end-to-end check**

```bash
cd ai-service
uvicorn app:app --host 0.0.0.0 --port 8001
```

Upload a side selfie with a hand visible. Confirm in the AI service logs:
- `DEBUG: MediaPipe face bbox: x=..., y=..., w=..., h=...` (not the Haar fallback)
- `DEBUG: YOLO detections: N` where N detections are on the face region
- Heatmap overlay appears on the cheek/jaw, **not** on the hand or hair

- [ ] **Step 5: Commit**

```bash
git add ai-service/app.py
git commit -m "feat: crop to face before YOLO to prevent hand/hair false detections"
```
