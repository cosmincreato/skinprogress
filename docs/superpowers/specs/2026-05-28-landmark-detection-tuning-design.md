# Landmark-Based Detection Tuning Design

**Date:** 2026-05-28  
**Status:** Approved  
**Scope:** `ai-service/app.py` only — two new functions, two updated functions

## Problem

Two false-positive sources remain after the MediaPipe migration:

1. **Nostrils** — dark circular openings match the acne color profile (dark, slightly reddish). The detection region includes them because the face mask covers the entire face including the nose cavity.
2. **Hair at top edges** — `_get_face_focus_bounds` expands 15% (`FACE_EXPAND_Y_TOP = 0.15`) above the face bounding box, pulling in hairline pixels. `_build_face_focus_mask` mirrors this expansion.

Both stem from using a rectangular bbox with percentage expansion instead of the precise face geometry MediaPipe already provides.

## Solution

Use MediaPipe's face oval silhouette landmarks (36 specific indices that trace the exact face boundary) as the detection polygon. Subtract a nostril exclusion zone (8 nose-opening landmark indices) from it. Both structures are derived from the same `pts` array already returned by `_face_landmarks_xy`.

## New Constants

```python
FACE_SILHOUETTE_INDICES = [
    10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
    397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
    172,  58, 132,  93, 234, 127, 162,  21,  54, 103,  67, 109,
]

NOSE_NOSTRIL_INDICES = [1, 2, 49, 98, 97, 326, 327, 279]
```

These are module-level constants, not env vars — they are fixed MediaPipe topology.

## New Functions

### `_build_face_silhouette_mask(image_width, image_height, pts)`

- Extracts `pts[FACE_SILHOUETTE_INDICES]` from the landmark array
- Fills the resulting polygon with `cv2.fillPoly`
- Applies a small Gaussian blur (`max(21, min(w,h)//20 | 1)`) for smooth edges — same kernel formula as the existing bbox-based mask
- Returns `np.ndarray` float32 `[0,1]`, shape `(h, w)`

### `_build_nostril_exclusion_mask(image_width, image_height, pts)`

- Extracts `pts[NOSE_NOSTRIL_INDICES]` from the landmark array
- Fills the resulting polygon with `cv2.fillPoly`
- Applies a small Gaussian blur (`max(11, min(w,h)//40 | 1)`) to soften edges
- Returns `np.ndarray` float32 `[0,1]`, shape `(h, w)`

## Updated Functions

### `_build_face_focus_mask(image_width, image_height, image)`

**Current:** always calls `_detect_face_bbox` → Haar/ellipse → builds mask from rectangle.

**New:**
1. Call `_face_landmarks_xy(image)`.
2. If `pts is not None`: return `np.clip(_build_face_silhouette_mask(...) - _build_nostril_exclusion_mask(...), 0, 1)`.
3. If `pts is None`: fall through to existing `_detect_face_bbox` → Haar → ellipse logic unchanged.

### `_get_face_focus_bounds(image_width, image_height, image)`

**Current:** calls `_detect_face_bbox` → expands by `FACE_EXPAND_X`, `FACE_EXPAND_Y_TOP`, `FACE_EXPAND_Y_BOTTOM`.

**New:**
1. Call `_face_landmarks_xy(image)`.
2. If `pts is not None`: derive bounds as `min/max` of `pts[FACE_SILHOUETTE_INDICES]` clipped to image dimensions — no percentage expansion needed.
3. If `pts is None`: fall through to existing `_detect_face_bbox` + expansion logic unchanged.

## What Does Not Change

- `_detect_face_bbox` — fallback path, untouched
- `_build_skin_mask` — untouched
- `_build_acne_yolo_heatmap_overlay` — untouched
- `_build_redness_heatmap`, `_build_under_eye_heatmap` — untouched
- `.env`, backend, frontend — untouched
- All detection thresholds — untouched

## Error Handling

| Scenario | Behaviour |
|---|---|
| `_face_landmarks_xy` returns None | Both updated functions fall back to existing Haar/ellipse logic |
| Silhouette polygon has < 3 points (degenerate) | Return zero mask, caller falls back to Haar |
| Nostril polygon has < 3 points | Skip subtraction, return silhouette mask unchanged |
| Subtraction results in all-zero mask | Caller falls back to Haar/ellipse (existing behaviour) |

## Testing

- Unit: silhouette mask covers face interior, excludes hair area above topmost silhouette landmark
- Unit: nostril exclusion mask is non-zero only in a small central-lower region of the face
- Unit: combined mask (`silhouette - nostril`) has zero in nostril area and non-zero on cheeks/forehead
- Manual: restart AI service, analyze side selfie, confirm nostrils not highlighted and hairline not included
