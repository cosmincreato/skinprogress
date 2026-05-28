# Face-First YOLO Detection Design

**Date:** 2026-05-28  
**Status:** Approved  
**Scope:** `ai-service/app.py` only — two function changes

## Problem

YOLO runs on the full selfie image and detects acne-like spots anywhere in the frame — including hands, hair, and background. This causes heatmap overlays to appear on the wrong regions (e.g., hand on top of head in a side selfie). The existing face mask applied *after* detection is insufficient because it relies on Haar cascade, which fails on side-facing profiles and falls back to a wide center ellipse.

## Solution: Crop to Face Before YOLO

Detect the face region first using MediaPipe face mesh landmarks (already loaded in the codebase). Crop the image to that region before running YOLO. YOLO physically cannot detect anything outside the crop. Offset detection coordinates back to original image space for heatmap generation.

## Changes

### 1. `_detect_face_bbox` — MediaPipe first, Haar fallback

**Current behaviour:** Always uses Haar cascade (`haarcascade_frontalface_default.xml`). Fails on side profiles (returns `None`), causing the face focus mask to fall back to a wide center ellipse.

**New behaviour:**
1. Call `_face_landmarks_xy(image)` — already available, no new import or model.
2. Compute bbox as `min/max` over all 468 landmark points.
3. Validate result is at least 20×20 px. If valid, return it.
4. If MediaPipe returns `None` (face not detected), fall through to existing Haar cascade logic unchanged.

MediaPipe face mesh handles frontal and side-facing photos reliably. No new dependency is introduced.

### 2. `_build_acne_yolo_heatmap_overlay` — crop before YOLO

**Current behaviour:** Calls `detector.predict(np.array(image), ...)` on the full image.

**New behaviour:**
1. Get face bounds via `_get_face_focus_bounds` (which now uses the improved `_detect_face_bbox`).
2. Crop: `face_crop = image.crop((focus_left, focus_top, focus_right, focus_bottom))`.
3. Guard: if crop is smaller than 8×8 px, skip cropping and run YOLO on full image with a warning.
4. Run `detector.predict(np.array(face_crop), ...)` on the crop.
5. When building Gaussian blobs, offset each detection centre: `cx += focus_left`, `cy += focus_top`.

The rest of the function (skin mask, face mask, threshold filtering, color fallback, overlay generation) is unchanged.

## What Does Not Change

- `.env` — no config changes
- Backend (`SkinProgress/`) — no changes
- Frontend (`ui/`) — no changes
- `_detect_blemishes_by_color` — already filtered by `face_mask` and `skin_mask`, no change needed
- `_safe_build_heatmap_overlay` — no change
- All other heatmap backends (`uniform_face`, `local_regions`, `patch`) — no change

## Error Handling

| Scenario | Behaviour |
|---|---|
| MediaPipe finds no face | Fall back to Haar cascade (existing) |
| Haar also finds no face | Fall back to center ellipse (existing) |
| Crop too small (< 8×8) | Skip crop, run YOLO on full image, log warning |
| YOLO finds no detections in crop | Existing color-based fallback runs on full face region |
| Color fallback also finds nothing | Return original photo (existing behaviour from prior fix) |

## Testing

Manual verification: take a side selfie with a hand visible in frame. Confirm heatmap overlay appears only on cheek/jaw area, not on the hand or hair.
