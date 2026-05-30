# Landmark Detection Tuning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate nostril and hairline false positives in heatmap overlays by replacing bbox-based face masking with precise MediaPipe face silhouette polygons and a nostril exclusion zone.

**Architecture:** Two new helper functions (`_build_face_silhouette_mask`, `_build_nostril_exclusion_mask`) use MediaPipe landmark indices to build precise masks. Two existing functions (`_build_face_focus_mask`, `_get_face_focus_bounds`) are updated to call landmarks first and fall back to the existing Haar/ellipse logic when landmarks are unavailable.

**Tech Stack:** Python, OpenCV (`cv2.fillPoly`), NumPy, MediaPipe face mesh (478 landmarks)

---

### Task 1: Add constants and new mask helper functions

**Files:**
- Modify: `ai-service/app.py:39-41` (add constants after existing FACE_EXPAND values)
- Modify: `ai-service/app.py` (add two new functions before `_detect_face_bbox` at line 905)
- Create: `ai-service/tests/test_landmark_tuning.py`

- [ ] **Step 1: Write failing tests**

Create `ai-service/tests/test_landmark_tuning.py`:

```python
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import numpy as np
from unittest.mock import patch
from PIL import Image as PILImage


def make_realistic_pts(w=640, h=480):
    """478 landmark points simulating a face occupying ~50% of the image."""
    pts = np.zeros((478, 2), dtype=np.int32)
    for i in range(478):
        pts[i, 0] = int(np.clip(w * 0.25 + (i % 20) * (w * 0.5 / 20), 0, w - 1))
        pts[i, 1] = int(np.clip(h * 0.15 + (i // 20) * (h * 0.65 / 24), 0, h - 1))
    return pts


def test_face_silhouette_mask_nonzero_for_valid_pts():
    """Silhouette mask must have non-zero pixels when given realistic landmarks."""
    from app import _build_face_silhouette_mask
    pts = make_realistic_pts()
    mask = _build_face_silhouette_mask(640, 480, pts)
    assert mask.shape == (480, 640)
    assert mask.max() > 0


def test_nostril_exclusion_mask_nonzero_for_valid_pts():
    """Nostril exclusion mask must have non-zero pixels with realistic landmarks."""
    from app import _build_nostril_exclusion_mask
    pts = make_realistic_pts()
    mask = _build_nostril_exclusion_mask(640, 480, pts)
    assert mask.shape == (480, 640)
    assert mask.max() > 0


def test_nostril_mask_smaller_than_silhouette():
    """Nostril mask covers less area than the full face silhouette."""
    from app import _build_face_silhouette_mask, _build_nostril_exclusion_mask
    pts = make_realistic_pts()
    silhouette = _build_face_silhouette_mask(640, 480, pts)
    nostril = _build_nostril_exclusion_mask(640, 480, pts)
    assert nostril.sum() < silhouette.sum()


def test_silhouette_mask_no_crash_on_degenerate_pts():
    """All-zero landmark points must not crash — just return a valid mask."""
    from app import _build_face_silhouette_mask
    pts = np.zeros((478, 2), dtype=np.int32)
    mask = _build_face_silhouette_mask(100, 100, pts)
    assert mask.shape == (100, 100)
    assert mask.max() <= 1.0
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /c/Users/diap/Desktop/skinprogress/ai-service && python -m pytest tests/test_landmark_tuning.py -v
```

Expected: all 4 FAIL — `_build_face_silhouette_mask` and `_build_nostril_exclusion_mask` don't exist yet.

- [ ] **Step 3: Add constants to `app.py`**

After the existing constant block at lines 39–41 (`FACE_EXPAND_X`, `FACE_EXPAND_Y_TOP`, `FACE_EXPAND_Y_BOTTOM`), add:

```python
FACE_SILHOUETTE_INDICES = [
    10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
    397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
    172,  58, 132,  93, 234, 127, 162,  21,  54, 103,  67, 109,
]
NOSE_NOSTRIL_INDICES = [1, 2, 49, 98, 97, 326, 327, 279]
```

- [ ] **Step 4: Add `_build_face_silhouette_mask` and `_build_nostril_exclusion_mask` to `app.py`**

Insert both functions immediately before `_detect_face_bbox` (currently line 905). Add:

```python
def _build_face_silhouette_mask(
    image_width: int, image_height: int, pts: np.ndarray
) -> np.ndarray:
    mask = np.zeros((image_height, image_width), dtype=np.float32)
    sil_pts = pts[FACE_SILHOUETTE_INDICES]
    if len(sil_pts) < 3:
        return mask
    cv2.fillPoly(mask, [sil_pts.astype(np.int32)], 1.0)
    blur_kernel = max(21, (min(image_width, image_height) // 20) | 1)
    mask = cv2.GaussianBlur(mask, (blur_kernel, blur_kernel), sigmaX=0)
    return np.clip(mask, 0.0, 1.0)


def _build_nostril_exclusion_mask(
    image_width: int, image_height: int, pts: np.ndarray
) -> np.ndarray:
    mask = np.zeros((image_height, image_width), dtype=np.float32)
    nostril_pts = pts[NOSE_NOSTRIL_INDICES]
    if len(nostril_pts) < 3:
        return mask
    cv2.fillPoly(mask, [nostril_pts.astype(np.int32)], 1.0)
    blur_kernel = max(11, (min(image_width, image_height) // 40) | 1)
    mask = cv2.GaussianBlur(mask, (blur_kernel, blur_kernel), sigmaX=0)
    return np.clip(mask, 0.0, 1.0)
```

- [ ] **Step 5: Run tests — all 4 must pass**

```bash
cd /c/Users/diap/Desktop/skinprogress/ai-service && python -m pytest tests/test_landmark_tuning.py -v
```

Expected: 4 PASSED.

- [ ] **Step 6: Run full suite to confirm no regressions**

```bash
cd /c/Users/diap/Desktop/skinprogress/ai-service && python -m pytest tests/ -q
```

Expected: all existing tests still pass.

- [ ] **Step 7: Commit**

```bash
git -C /c/Users/diap/Desktop/skinprogress add ai-service/app.py ai-service/tests/test_landmark_tuning.py
git -C /c/Users/diap/Desktop/skinprogress commit -m "feat: add face silhouette and nostril exclusion mask helpers"
```

---

### Task 2: Update `_build_face_focus_mask` to use landmark silhouette

**Files:**
- Modify: `ai-service/app.py:938-978`
- Test: `ai-service/tests/test_landmark_tuning.py` (append)

- [ ] **Step 1: Add failing tests**

Append to `ai-service/tests/test_landmark_tuning.py`:

```python
def test_face_focus_mask_uses_landmarks_when_available():
    """When _face_landmarks_xy returns pts, mask is derived from silhouette."""
    pts = make_realistic_pts(640, 480)
    img = PILImage.fromarray(np.full((480, 640, 3), 128, dtype=np.uint8))
    with patch("app._face_landmarks_xy", return_value=pts):
        from app import _build_face_focus_mask
        mask = _build_face_focus_mask(640, 480, img)
    assert mask.shape == (480, 640)
    assert mask.max() > 0


def test_face_focus_mask_falls_back_when_no_landmarks():
    """When _face_landmarks_xy returns None, fallback ellipse is used."""
    img = PILImage.fromarray(np.full((480, 640, 3), 128, dtype=np.uint8))
    with patch("app._face_landmarks_xy", return_value=None):
        from app import _build_face_focus_mask
        mask = _build_face_focus_mask(640, 480, img)
    assert mask.shape == (480, 640)
    assert mask.max() > 0
```

- [ ] **Step 2: Run new tests to confirm they fail**

```bash
cd /c/Users/diap/Desktop/skinprogress/ai-service && python -m pytest tests/test_landmark_tuning.py::test_face_focus_mask_uses_landmarks_when_available tests/test_landmark_tuning.py::test_face_focus_mask_falls_back_when_no_landmarks -v
```

Expected: `test_face_focus_mask_uses_landmarks_when_available` FAIL (current code never calls `_face_landmarks_xy`).

- [ ] **Step 3: Replace `_build_face_focus_mask` in `app.py` (lines 938–978)**

Replace the entire function with:

```python
def _build_face_focus_mask(
    image_width: int,
    image_height: int,
    image: Image.Image,
) -> np.ndarray:
    pts = _face_landmarks_xy(image)
    if pts is not None:
        silhouette = _build_face_silhouette_mask(image_width, image_height, pts)
        nostril = _build_nostril_exclusion_mask(image_width, image_height, pts)
        mask = np.clip(silhouette - nostril, 0.0, 1.0)
        if mask.max() > 0:
            return mask

    # Fallback: Haar bbox or center ellipse
    mask = np.zeros((image_height, image_width), dtype=np.float32)
    bbox = _detect_face_bbox(image)
    if bbox is not None:
        x, y, w, h = bbox
        left = max(0, int(x - w * FACE_EXPAND_X))
        right = min(image_width, int(x + w + w * FACE_EXPAND_X))
        top = max(0, int(y - h * FACE_EXPAND_Y_TOP))
        bottom = min(image_height, int(y + h + h * FACE_EXPAND_Y_BOTTOM))
        print(
            f"DEBUG: Face bbox: x={x}, y={y}, w={w}, h={h}, expanded: left={left}, top={top}, right={right}, bottom={bottom}"
        )
        cx = int((left + right) / 2)
        cy = int((top + bottom) / 2)
        ax = max(1, int((right - left) / 2))
        ay = max(1, int((bottom - top) / 2))
        cv2.ellipse(mask, (cx, cy), (ax, ay), 0, 0, 360, 1.0, -1)
    else:
        print("DEBUG: Haar face detection failed, using fallback ellipse")
        center_x = image_width // 2
        center_y = int(image_height * 0.42)
        radius_x = int(image_width * 0.22)
        radius_y = int(image_height * 0.30)
        y_indices, x_indices = np.ogrid[:image_height, :image_width]
        ellipse = (
            ((x_indices - center_x) ** 2) / max(radius_x**2, 1)
            + ((y_indices - center_y) ** 2) / max(radius_y**2, 1)
        ) <= 1.0
        mask[ellipse] = 1.0

    blur_kernel = max(21, (min(image_width, image_height) // 20) | 1)
    mask = cv2.GaussianBlur(mask, (blur_kernel, blur_kernel), sigmaX=0)
    return np.clip(mask, 0.0, 1.0)
```

- [ ] **Step 4: Run all tests — must pass**

```bash
cd /c/Users/diap/Desktop/skinprogress/ai-service && python -m pytest tests/ -q
```

Expected: all tests pass (6 face_bbox + 6 face_landmarker + 6 landmark_tuning = 18 total).

- [ ] **Step 5: Commit**

```bash
git -C /c/Users/diap/Desktop/skinprogress add ai-service/app.py ai-service/tests/test_landmark_tuning.py
git -C /c/Users/diap/Desktop/skinprogress commit -m "feat: update _build_face_focus_mask to use landmark silhouette and nostril exclusion"
```

---

### Task 3: Update `_get_face_focus_bounds` to use silhouette bounds

**Files:**
- Modify: `ai-service/app.py:981-1003`
- Test: `ai-service/tests/test_landmark_tuning.py` (append)

- [ ] **Step 1: Add failing tests**

Append to `ai-service/tests/test_landmark_tuning.py`:

```python
def test_get_face_focus_bounds_uses_silhouette_when_landmarks_available():
    """Bounds derived from silhouette indices min/max when landmarks available."""
    from app import _get_face_focus_bounds, FACE_SILHOUETTE_INDICES
    pts = make_realistic_pts(640, 480)
    img = PILImage.fromarray(np.full((480, 640, 3), 128, dtype=np.uint8))
    with patch("app._face_landmarks_xy", return_value=pts):
        left, top, right, bottom = _get_face_focus_bounds(640, 480, img)
    expected_left = int(np.clip(pts[FACE_SILHOUETTE_INDICES, 0].min(), 0, 639))
    expected_right = int(np.clip(pts[FACE_SILHOUETTE_INDICES, 0].max(), 0, 639))
    assert left == expected_left
    assert right == expected_right
    assert right > left
    assert bottom > top


def test_get_face_focus_bounds_falls_back_when_no_landmarks():
    """Returns valid bounds even when _face_landmarks_xy returns None."""
    from app import _get_face_focus_bounds
    img = PILImage.fromarray(np.full((480, 640, 3), 128, dtype=np.uint8))
    with patch("app._face_landmarks_xy", return_value=None):
        left, top, right, bottom = _get_face_focus_bounds(640, 480, img)
    assert right > left
    assert bottom > top
    assert left >= 0 and top >= 0
    assert right <= 640 and bottom <= 480
```

- [ ] **Step 2: Run new tests to confirm they fail**

```bash
cd /c/Users/diap/Desktop/skinprogress/ai-service && python -m pytest tests/test_landmark_tuning.py::test_get_face_focus_bounds_uses_silhouette_when_landmarks_available tests/test_landmark_tuning.py::test_get_face_focus_bounds_falls_back_when_no_landmarks -v
```

Expected: `test_get_face_focus_bounds_uses_silhouette_when_landmarks_available` FAIL (current code never calls `_face_landmarks_xy`).

- [ ] **Step 3: Replace `_get_face_focus_bounds` in `app.py` (lines 981–1003)**

Replace the entire function with:

```python
def _get_face_focus_bounds(
    image_width: int,
    image_height: int,
    image: Image.Image,
) -> tuple[int, int, int, int]:
    pts = _face_landmarks_xy(image)
    if pts is not None:
        sil_pts = pts[FACE_SILHOUETTE_INDICES]
        left = int(np.clip(sil_pts[:, 0].min(), 0, image_width - 1))
        right = int(np.clip(sil_pts[:, 0].max(), 0, image_width - 1))
        top = int(np.clip(sil_pts[:, 1].min(), 0, image_height - 1))
        bottom = int(np.clip(sil_pts[:, 1].max(), 0, image_height - 1))
        if right > left and bottom > top:
            return left, top, right, bottom

    # Fallback: Haar bbox or center ellipse
    bbox = _detect_face_bbox(image)
    if bbox is not None:
        x, y, w, h = bbox
        left = max(0, int(x - w * FACE_EXPAND_X))
        right = min(image_width, int(x + w + w * FACE_EXPAND_X))
        top = max(0, int(y - h * FACE_EXPAND_Y_TOP))
        bottom = min(image_height, int(y + h + h * FACE_EXPAND_Y_BOTTOM))
        return left, top, right, bottom

    center_x = image_width // 2
    center_y = int(image_height * 0.42)
    radius_x = int(image_width * 0.22)
    radius_y = int(image_height * 0.30)
    left = max(0, center_x - radius_x)
    right = min(image_width, center_x + radius_x)
    top = max(0, center_y - radius_y)
    bottom = min(image_height, center_y + radius_y)
    return left, top, right, bottom
```

- [ ] **Step 4: Run all tests — 20 total must pass**

```bash
cd /c/Users/diap/Desktop/skinprogress/ai-service && python -m pytest tests/ -v
```

Expected: 20 PASSED (6 face_bbox + 6 face_landmarker + 8 landmark_tuning).

- [ ] **Step 5: Restart AI service and verify manually**

```bash
cd /c/Users/diap/Desktop/skinprogress/ai-service && uvicorn app:app --host 0.0.0.0 --port 8001
```

Analyze a selfie and confirm in logs:
- `DEBUG: MediaPipe face bbox:` still appears (landmarks working)
- Heatmap overlay does **not** highlight nostrils
- Heatmap overlay does **not** bleed into hairline

- [ ] **Step 6: Commit**

```bash
git -C /c/Users/diap/Desktop/skinprogress add ai-service/app.py ai-service/tests/test_landmark_tuning.py
git -C /c/Users/diap/Desktop/skinprogress commit -m "feat: update _get_face_focus_bounds to use landmark silhouette bounds"
```
