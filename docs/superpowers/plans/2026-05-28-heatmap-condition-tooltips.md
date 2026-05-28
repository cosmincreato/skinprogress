# Heatmap Condition Tooltips Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-condition heatmap with a composite per-condition-colored overlay (acne=red, redness=orange, under-eye bags=purple) and add hover tooltips on each detected region identifying the condition and severity.

**Architecture:** Three-layer change: AI service generates composite heatmap PNG + detection metadata JSON per angle → backend stores metadata in new DB columns and passes through to frontend → new `HeatmapOverlay.tsx` React component renders transparent hit zones over the image with tooltips. Tasks 1–2 are AI service, 3–4 are backend, 5–6 are frontend. Each subsystem is independently testable.

**Tech Stack:** Python/NumPy/OpenCV (AI service), C#/.NET 9/EF Core (backend), React 19/TypeScript/Tailwind CSS (frontend)

---

### Task 1: AI Service — composite heatmap with per-condition colors

**Files:**
- Modify: `ai-service/app.py` — add `_get_condition_color`, replace `_get_severity_color` usages with it in new composite function; add `_build_composite_heatmap_overlay_and_metadata`
- Test: `ai-service/tests/test_composite_heatmap.py`

- [ ] **Step 1: Write failing tests**

Create `ai-service/tests/test_composite_heatmap.py`:

```python
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import numpy as np
from unittest.mock import patch, MagicMock
from PIL import Image as PILImage


def blank_image(w=64, h=64):
    return PILImage.fromarray(np.full((h, w, 3), 128, dtype=np.uint8))


def test_get_condition_color_acne_low_severity():
    from app import _get_condition_color
    r, g, b = _get_condition_color("acne", 0.0)
    assert r == 255 and g >= 190 and b >= 190  # light pink


def test_get_condition_color_acne_high_severity():
    from app import _get_condition_color
    r, g, b = _get_condition_color("acne", 1.0)
    assert r < 230 and g < 30 and b < 30  # deep red


def test_get_condition_color_redness():
    from app import _get_condition_color
    r, g, b = _get_condition_color("redness", 0.5)
    assert r > g and g > b  # orange: red dominates, blue is lowest


def test_get_condition_color_under_eye_bags():
    from app import _get_condition_color
    r, g, b = _get_condition_color("under_eye_bags", 0.5)
    assert b > r  # purple: blue dominates


def test_composite_overlay_returns_string_or_original():
    """composite function returns a data URL (str) or None, never raises."""
    from app import _build_composite_heatmap_overlay_and_metadata
    img = blank_image()
    with patch("app._face_landmarks_xy", return_value=None):
        result, detections = _build_composite_heatmap_overlay_and_metadata(img)
    assert isinstance(detections, list)
    # result is either a data URL string or None
    assert result is None or result.startswith("data:image/")
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /c/Users/diap/Desktop/skinprogress/ai-service && python -m pytest tests/test_composite_heatmap.py -v
```

Expected: 5 FAIL — `_get_condition_color` and `_build_composite_heatmap_overlay_and_metadata` don't exist yet.

- [ ] **Step 3: Add `_get_condition_color` to `app.py`**

Add after `_to_png_data_url` (around line 480, before the existing `_get_severity_color`):

```python
def _get_condition_color(condition: str, severity: float) -> tuple[int, int, int]:
    s = float(np.clip(severity, 0.0, 1.0))
    if condition == "acne":
        return (
            int(np.clip(255 - s * 35, 0, 255)),
            int(np.clip(200 - s * 180, 0, 255)),
            int(np.clip(200 - s * 180, 0, 255)),
        )
    if condition == "redness":
        return (
            int(np.clip(255 - s * 25, 0, 255)),
            int(np.clip(220 - s * 120, 0, 255)),
            int(np.clip(180 - s * 180, 0, 255)),
        )
    # under_eye_bags
    return (
        int(np.clip(220 - s * 120, 0, 255)),
        int(np.clip(200 - s * 200, 0, 255)),
        int(np.clip(255 - s * 55, 0, 255)),
    )
```

- [ ] **Step 4: Add `_build_composite_heatmap_overlay_and_metadata` to `app.py`**

Add after `_build_uniform_face_overlay` (keeping it near the other overlay builders). This function returns `(data_url | None, detections_list)`:

```python
def _build_composite_heatmap_overlay_and_metadata(
    image: Image.Image,
) -> tuple[str | None, list[dict]]:
    """
    Builds a single composite heatmap PNG (acne=red, redness=orange, under-eye=purple)
    and returns detection metadata for hover tooltips.
    Returns (data_url_or_None, detections_list).
    """
    w, h = image.size
    if w < 8 or h < 8:
        return None, []

    overlay_rgba = np.zeros((h, w, 4), dtype=np.uint8)
    detections: list[dict] = []
    y_indices, x_indices = np.ogrid[:h, :w]

    face_mask = _build_face_focus_mask(w, h, image)
    skin_mask = _build_skin_mask(image)

    # ── Layer 1: Redness ──
    try:
        redness_heat = _build_redness_heatmap(image)
        r_mask = redness_heat > 0.12
        if r_mask.any():
            rc = np.zeros((h, w, 3), dtype=np.float32)
            rc[..., 0] = np.clip(255 - redness_heat * 25, 0, 255)
            rc[..., 1] = np.clip(220 - redness_heat * 120, 0, 255)
            rc[..., 2] = np.clip(180 - redness_heat * 180, 0, 255)
            ra = (redness_heat * HEATMAP_ALPHA_MAX).astype(np.uint8)
            ra[~r_mask] = 0
            overlay_rgba[r_mask, :3] = rc[r_mask].astype(np.uint8)
            overlay_rgba[r_mask, 3] = ra[r_mask]
            zone_mask = redness_heat > 0.3
            if zone_mask.any():
                ys, xs = np.where(zone_mask)
                detections.append({
                    "condition": "redness", "type": "zone",
                    "x1": int(xs.min()), "y1": int(ys.min()),
                    "x2": int(xs.max()), "y2": int(ys.max()),
                    "severity": float(np.clip(redness_heat[zone_mask].mean(), 0, 1)),
                })
    except Exception as e:
        print(f"WARNING: redness layer failed: {e}", flush=True)

    # ── Layer 2: Under-eye bags ──
    try:
        undereye_heat = _build_under_eye_heatmap(image)
        u_mask = undereye_heat > 0.12
        if u_mask.any():
            uc = np.zeros((h, w, 3), dtype=np.float32)
            uc[..., 0] = np.clip(220 - undereye_heat * 120, 0, 255)
            uc[..., 1] = np.clip(200 - undereye_heat * 200, 0, 255)
            uc[..., 2] = np.clip(255 - undereye_heat * 55, 0, 255)
            ua = (undereye_heat * HEATMAP_ALPHA_MAX).astype(np.uint8)
            ua[~u_mask] = 0
            overlay_rgba[u_mask, :3] = uc[u_mask].astype(np.uint8)
            overlay_rgba[u_mask, 3] = ua[u_mask]
            zone_mask = undereye_heat > 0.3
            if zone_mask.any():
                ys, xs = np.where(zone_mask)
                detections.append({
                    "condition": "under_eye_bags", "type": "zone",
                    "x1": int(xs.min()), "y1": int(ys.min()),
                    "x2": int(xs.max()), "y2": int(ys.max()),
                    "severity": float(np.clip(undereye_heat[zone_mask].mean(), 0, 1)),
                })
    except Exception as e:
        print(f"WARNING: under-eye layer failed: {e}", flush=True)

    # ── Layer 3: Acne (top) ──
    try:
        focus_left, focus_top, focus_right, focus_bottom = _get_face_focus_bounds(w, h, image)
        crop_left, crop_top = focus_left, focus_top
        face_crop = image.crop((crop_left, crop_top, focus_right, focus_bottom))
        if face_crop.size[0] < 8 or face_crop.size[1] < 8:
            face_crop, crop_left, crop_top = image, 0, 0

        acne_heat = np.zeros((h, w), dtype=np.float32)
        det_count = 0
        yolo_xyxy, yolo_conf = None, None

        detector = _get_acne_detector()
        results = detector.predict(
            np.array(face_crop), verbose=False,
            conf=ACNE_DETECT_CONF, iou=ACNE_DETECT_IOU, max_det=ACNE_DETECT_MAX_DET,
        )
        if results:
            boxes = getattr(results[0], "boxes", None)
            if boxes is not None and getattr(boxes, "xyxy", None) is not None:
                yolo_xyxy = boxes.xyxy
                yolo_conf = getattr(boxes, "conf", None)
                det_count = int(yolo_xyxy.shape[0]) if hasattr(yolo_xyxy, "shape") else 0

        use_color = det_count == 0
        if not use_color:
            for i in range(det_count):
                x1, y1, x2, y2 = [float(v) for v in yolo_xyxy[i].tolist()]
                cx = int((x1 + x2) / 2) + crop_left
                cy = int((y1 + y2) / 2) + crop_top
                bw, bh = max(2.0, x2 - x1), max(2.0, y2 - y1)
                radius = max(6.0, 0.5 * (bw + bh) * 0.5 * ACNE_HEATMAP_RADIUS_RATIO)
                sigma = max(6.0, radius / 1.8)
                c = float(yolo_conf[i]) if yolo_conf is not None else 0.6
                intensity = float(np.clip(c, 0.15, 1.0))
                d2 = (x_indices - cx) ** 2 + (y_indices - cy) ** 2
                acne_heat = np.maximum(acne_heat, (intensity * np.exp(-d2 / (2 * sigma**2))).astype(np.float32))
                detections.append({
                    "condition": "acne", "type": "spot",
                    "x": cx, "y": cy,
                    "radius": max(6, int(0.5 * (bw + bh) * 0.5)),
                    "severity": float(np.clip(c, 0, 1)),
                })

        if use_color:
            blemishes = _detect_blemishes_by_color(image, skin_mask, face_mask)
            for b in blemishes:
                cx, cy = int(b["cx"]), int(b["cy"])
                sev = float(b.get("severity", 0.5))
                sigma = 18.0
                d2 = (x_indices - cx) ** 2 + (y_indices - cy) ** 2
                acne_heat = np.maximum(acne_heat, (sev * np.exp(-d2 / (2 * sigma**2))).astype(np.float32))
                detections.append({
                    "condition": "acne", "type": "spot",
                    "x": cx, "y": cy,
                    "radius": max(6, int(b.get("radius", 8))),
                    "severity": float(np.clip(sev, 0, 1)),
                })

        acne_heat *= face_mask * skin_mask
        bk = max(25, (min(w, h) // 28) | 1)
        acne_heat = cv2.GaussianBlur(acne_heat, (bk, bk), 0)
        if acne_heat.max() > 0:
            acne_heat /= acne_heat.max()

        a_mask = acne_heat > 0.08
        if a_mask.any():
            ac = np.zeros((h, w, 3), dtype=np.float32)
            ac[..., 0] = np.clip(255 - acne_heat * 35, 0, 255)
            ac[..., 1] = np.clip(200 - acne_heat * 180, 0, 255)
            ac[..., 2] = np.clip(200 - acne_heat * 180, 0, 255)
            aa = (acne_heat * HEATMAP_ALPHA_MAX).astype(np.uint8)
            aa[~a_mask] = 0
            overlay_rgba[a_mask, :3] = ac[a_mask].astype(np.uint8)
            overlay_rgba[a_mask, 3] = aa[a_mask]
    except Exception as e:
        print(f"WARNING: acne layer failed: {e}", flush=True)

    if not (overlay_rgba[..., 3] > 0).any():
        return _to_png_data_url(image), detections

    overlay_img = Image.fromarray(overlay_rgba, mode="RGBA")
    composite = Image.alpha_composite(image.convert("RGBA"), overlay_img)
    return _to_png_data_url(composite), detections
```

- [ ] **Step 5: Run tests — all 5 must pass**

```bash
cd /c/Users/diap/Desktop/skinprogress/ai-service && python -m pytest tests/test_composite_heatmap.py -v
```

Expected: 5 PASSED.

- [ ] **Step 6: Run full suite for regressions**

```bash
cd /c/Users/diap/Desktop/skinprogress/ai-service && python -m pytest tests/ -q
```

Expected: all 20+ tests pass.

- [ ] **Step 7: Commit**

```bash
git -C /c/Users/diap/Desktop/skinprogress add ai-service/app.py ai-service/tests/test_composite_heatmap.py
git -C /c/Users/diap/Desktop/skinprogress commit -m "feat: add per-condition color function and composite heatmap builder"
```

---

### Task 2: AI Service — wire composite into `analyze_set` response

**Files:**
- Modify: `ai-service/app.py` — update `analyze_set` to use `_build_composite_heatmap_overlay_and_metadata` for `yolo_acne` backend and include `detections` in per-angle response

- [ ] **Step 1: Locate the heatmap call in `analyze_set`**

In `app.py` find the block inside `analyze_set` that reads:
```python
        heatmap_overlay_data_url = (
            _safe_build_heatmap_overlay(image, heatmap_target)
            if HEATMAP_ENABLED
            else None
        )
```

- [ ] **Step 2: Replace heatmap call in `analyze_set`**

Replace that block with:

```python
        detections: list[dict] = []
        if HEATMAP_ENABLED and HEATMAP_BACKEND == "yolo_acne":
            heatmap_overlay_data_url, detections = _build_composite_heatmap_overlay_and_metadata(image)
        elif HEATMAP_ENABLED:
            heatmap_overlay_data_url = _safe_build_heatmap_overlay(image, heatmap_target)
        else:
            heatmap_overlay_data_url = None
```

- [ ] **Step 3: Add `detections` to the per-angle dict**

In the same `analyze_set` function, find:
```python
        per_angle[angle] = {
            "label": label,
            "confidence": confidence,
            "scores": scores,
            "heatmap_target": heatmap_target,
            "heatmap_overlay_data_url": heatmap_overlay_data_url,
        }
```

Replace with:
```python
        per_angle[angle] = {
            "label": label,
            "confidence": confidence,
            "scores": scores,
            "heatmap_target": heatmap_target,
            "heatmap_overlay_data_url": heatmap_overlay_data_url,
            "detections": detections,
        }
```

- [ ] **Step 4: Verify the endpoint returns detections**

Start the AI service and call it manually (or use an existing selfie to trigger analysis via the backend). Confirm the response JSON includes `per_angle.front.detections` as a list.

Alternatively, write a quick smoke test:
```python
# In test_composite_heatmap.py, append:
def test_analyze_set_includes_detections_field():
    """analyze_set must include detections key in per_angle entries."""
    from fastapi.testclient import TestClient
    from app import app as fastapi_app
    import io
    client = TestClient(fastapi_app)
    # Create tiny blank JPEG bytes
    img = PILImage.fromarray(np.full((64, 64, 3), 128, dtype=np.uint8))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    buf.seek(0)
    data = buf.read()
    response = client.post(
        "/analyze-set",
        files={"front": ("f.jpg", data, "image/jpeg"), "left": ("l.jpg", data, "image/jpeg"), "right": ("r.jpg", data, "image/jpeg")},
    )
    assert response.status_code == 200
    body = response.json()
    assert "detections" in body["per_angle"]["front"]
    assert isinstance(body["per_angle"]["front"]["detections"], list)
```

Run: `cd /c/Users/diap/Desktop/skinprogress/ai-service && python -m pytest tests/test_composite_heatmap.py -v`

Expected: all tests pass (including the new one).

- [ ] **Step 5: Commit**

```bash
git -C /c/Users/diap/Desktop/skinprogress add ai-service/app.py ai-service/tests/test_composite_heatmap.py
git -C /c/Users/diap/Desktop/skinprogress commit -m "feat: include detections metadata in analyze_set per-angle response"
```

---

### Task 3: Backend — `AnalysisResult` entity + EF Core migration

**Files:**
- Modify: `SkinProgress/SkinProgress/Models/Entities/AnalysisResult.cs` — add 3 new nullable string properties
- Create: EF Core migration via CLI

- [ ] **Step 1: Add three new properties to `AnalysisResult.cs`**

After the `HeatmapRightUrl` property (line 162), add:

```csharp
/// <summary>JSON array of detection metadata for the front-angle heatmap.</summary>
public string? DetectionsFrontJson { get; set; }

/// <summary>JSON array of detection metadata for the left-angle heatmap.</summary>
public string? DetectionsLeftJson { get; set; }

/// <summary>JSON array of detection metadata for the right-angle heatmap.</summary>
public string? DetectionsRightJson { get; set; }
```

- [ ] **Step 2: Create and apply the migration**

```bash
cd /c/Users/diap/Desktop/skinprogress/SkinProgress
dotnet ef migrations add AddDetectionsJson
dotnet ef database update
```

Expected: migration file created in `Migrations/`, database updated successfully.

- [ ] **Step 3: Verify build**

```bash
cd /c/Users/diap/Desktop/skinprogress/SkinProgress && dotnet build
```

Expected: Build succeeded, 0 errors.

- [ ] **Step 4: Commit**

```bash
git -C /c/Users/diap/Desktop/skinprogress add SkinProgress/SkinProgress/Models/Entities/AnalysisResult.cs SkinProgress/SkinProgress/Migrations/
git -C /c/Users/diap/Desktop/skinprogress commit -m "feat: add DetectionsFrontJson, DetectionsLeftJson, DetectionsRightJson to AnalysisResult"
```

---

### Task 4: Backend — store detections + return in API responses

**Files:**
- Modify: `SkinProgress/SkinProgress/Controllers/UsersController.cs`
  - `SaveAnalysisHeatmapAsync` (~line 809): extract and store detections JSON
  - `AnalyzeSelfieSet` (~line 773): pass detections through in live response
  - `GetAllAnalyses` (~line 1020): include detections in response

- [ ] **Step 1: Update `SaveAnalysisHeatmapAsync` to store detections**

In `SaveAnalysisHeatmapAsync`, inside the `foreach (var angle in new[] { "front", "left", "right" })` loop, after saving the heatmap file (after line `heatmapUrls[angle] = ...`), add:

```csharp
var detectionsJson = angleData["detections"]?.ToJsonString();
```

Then, in the `AnalysisResult` object initialisation block, add the three detections properties:

```csharp
HeatmapFrontUrl = heatmapUrls.GetValueOrDefault("front"),
HeatmapLeftUrl = heatmapUrls.GetValueOrDefault("left"),
HeatmapRightUrl = heatmapUrls.GetValueOrDefault("right"),
DetectionsFrontJson = perAngleObj["front"]?["detections"]?.ToJsonString(),
DetectionsLeftJson = perAngleObj["left"]?["detections"]?.ToJsonString(),
DetectionsRightJson = perAngleObj["right"]?["detections"]?.ToJsonString(),
```

(The `perAngleObj` variable already exists in that method — it's `analysisJson["per_angle"] as JsonObject`.)

- [ ] **Step 2: Pass detections through in `AnalyzeSelfieSet` live response**

In `AnalyzeSelfieSet`, find the loop that processes `per_angle` angles and sets `heatmap_overlay_data_url` (~line 773). Currently it nulls out or sets the heatmap URL. Detections are already in the AI response JSON — they just need to NOT be stripped.

After setting the `heatmap_overlay_data_url` node for each angle, ensure `detections` is preserved in `angleNode`. Since the response is returned as `Ok(responseNode)` after stripping base64, the `detections` array (which is not base64) will be included automatically — no change needed here as long as the code only touches `heatmap_overlay_data_url`.

Verify this is true by reading the existing stripping code (~line 773–793). The loop only modifies `angleNode["heatmap_overlay_data_url"]`. The `detections` key in each angle object is left untouched. No code change needed.

- [ ] **Step 3: Update `GetAllAnalyses` to return detections**

In `GetAllAnalyses` (~line 1020), find the `.Select(ar => new { ... })` projection. Add:

```csharp
detectionsFront = ar.DetectionsFrontJson,
detectionsLeft = ar.DetectionsLeftJson,
detectionsRight = ar.DetectionsRightJson,
```

- [ ] **Step 4: Run backend tests**

```bash
cd /c/Users/diap/Desktop/skinprogress/SkinProgress && dotnet test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git -C /c/Users/diap/Desktop/skinprogress add SkinProgress/SkinProgress/Controllers/UsersController.cs
git -C /c/Users/diap/Desktop/skinprogress commit -m "feat: store and return detection metadata in analysis API"
```

---

### Task 5: Frontend — `HeatmapOverlay` component

**Files:**
- Create: `ui/src/components/HeatmapOverlay.tsx`

- [ ] **Step 1: Create `ui/src/components/HeatmapOverlay.tsx`**

```tsx
import { useEffect, useRef, useState } from "react";

export type DetectionCondition = "acne" | "redness" | "under_eye_bags";

export interface Detection {
  condition: DetectionCondition;
  severity: number;
  type: "spot" | "zone";
  // spot
  x?: number;
  y?: number;
  radius?: number;
  // zone
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
}

interface HeatmapOverlayProps {
  imageUrl: string;
  detections: Detection[];
  angleLabel: string;
}

const CONDITION_LABELS: Record<DetectionCondition, string> = {
  acne: "Acne",
  redness: "Redness",
  under_eye_bags: "Under-eye bags",
};

const CONDITION_COLORS: Record<DetectionCondition, string> = {
  acne: "#DC1414",
  redness: "#E66400",
  under_eye_bags: "#6400C8",
};

function severityLabel(s: number): string {
  if (s < 0.34) return "Mild";
  if (s < 0.67) return "Moderate";
  return "Severe";
}

export function HeatmapOverlay({
  imageUrl,
  detections,
  angleLabel,
}: HeatmapOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [scale, setScale] = useState<{ x: number; y: number } | null>(null);
  const [tooltip, setTooltip] = useState<{
    text: string;
    top: number;
    left: number;
  } | null>(null);

  const updateScale = () => {
    const img = imgRef.current;
    if (img && img.naturalWidth > 0) {
      setScale({
        x: img.clientWidth / img.naturalWidth,
        y: img.clientHeight / img.naturalHeight,
      });
    }
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(updateScale);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  const presentConditions = [
    ...new Set(detections.map((d) => d.condition)),
  ] as DetectionCondition[];

  return (
    <div className="space-y-1">
      <div
        ref={containerRef}
        className="relative rounded-xl overflow-hidden border border-slate-700"
      >
        <img
          ref={imgRef}
          src={imageUrl}
          alt={`${angleLabel} heatmap`}
          className="w-full aspect-[4/3] object-cover"
          onLoad={updateScale}
        />

        {scale &&
          detections.map((det, i) => {
            if (det.type === "spot" && det.x !== undefined) {
              const cx = det.x * scale.x;
              const cy = det.y * scale.y;
              const r = (det.radius ?? 15) * Math.min(scale.x, scale.y);
              return (
                <div
                  key={i}
                  className="absolute rounded-full"
                  style={{
                    left: cx - r,
                    top: cy - r,
                    width: r * 2,
                    height: r * 2,
                    opacity: 0,
                    cursor: "crosshair",
                  }}
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const container =
                      containerRef.current!.getBoundingClientRect();
                    setTooltip({
                      text: `${CONDITION_LABELS[det.condition]} — ${severityLabel(det.severity)}`,
                      left: rect.left - container.left + r,
                      top: rect.top - container.top - 28,
                    });
                  }}
                  onMouseLeave={() => setTooltip(null)}
                />
              );
            }
            if (det.type === "zone" && det.x1 !== undefined) {
              return (
                <div
                  key={i}
                  className="absolute"
                  style={{
                    left: det.x1 * scale.x,
                    top: det.y1! * scale.y,
                    width: (det.x2! - det.x1) * scale.x,
                    height: (det.y2! - det.y1!) * scale.y,
                    opacity: 0,
                    cursor: "crosshair",
                  }}
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const container =
                      containerRef.current!.getBoundingClientRect();
                    setTooltip({
                      text: `${CONDITION_LABELS[det.condition]} — ${severityLabel(det.severity)}`,
                      left: rect.left - container.left + (rect.width / 2),
                      top: rect.top - container.top - 28,
                    });
                  }}
                  onMouseLeave={() => setTooltip(null)}
                />
              );
            }
            return null;
          })}

        {tooltip && (
          <div
            className="absolute z-50 px-2 py-1 rounded bg-slate-800 text-white text-[11px] pointer-events-none shadow-lg whitespace-nowrap"
            style={{ left: tooltip.left, top: tooltip.top }}
          >
            {tooltip.text}
          </div>
        )}

        <p className="text-center text-[11px] py-2 text-on-surface-variant bg-slate-900/60">
          {angleLabel}
        </p>
      </div>

      {presentConditions.length > 0 && (
        <div className="flex gap-3 flex-wrap px-1">
          {presentConditions.map((condition) => (
            <span
              key={condition}
              className="flex items-center gap-1 text-[11px] text-on-surface-variant"
            >
              <span
                className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: CONDITION_COLORS[condition] }}
              />
              {CONDITION_LABELS[condition]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /c/Users/diap/Desktop/skinprogress/ui && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git -C /c/Users/diap/Desktop/skinprogress add ui/src/components/HeatmapOverlay.tsx
git -C /c/Users/diap/Desktop/skinprogress commit -m "feat: add HeatmapOverlay component with condition-specific hover tooltips"
```

---

### Task 6: Frontend — integrate `HeatmapOverlay` into `GalleryPage`

**Files:**
- Modify: `ui/src/pages/GalleryPage.tsx`
  - Add `detections` field to `AngleAnalysis` interface
  - Add detections parsing in the `GetAllAnalyses` data loading block (~line 285)
  - Replace the heatmap `<img>` rendering (~line 1261) with `<HeatmapOverlay>`

- [ ] **Step 1: Update `AngleAnalysis` interface**

Find (line 29):
```typescript
interface AngleAnalysis {
  label: string;
  confidence: number;
  scores: Record<string, number>;
  heatmap_target?: string;
  heatmap_overlay_data_url?: string | null;
}
```

Replace with:
```typescript
interface AngleAnalysis {
  label: string;
  confidence: number;
  scores: Record<string, number>;
  heatmap_target?: string;
  heatmap_overlay_data_url?: string | null;
  detections?: Detection[];
}
```

And add the import at the top of the file:
```typescript
import { HeatmapOverlay, type Detection } from "../components/HeatmapOverlay";
```

- [ ] **Step 2: Add detections parsing in the `GetAllAnalyses` data loading**

In the `analyses.forEach(...)` callback (~line 285), update the type annotation to include the three new fields:

```typescript
          (analysis: {
            date: string;
            acneSeverity?: number;
            rednessSeverity?: number;
            underEyeBagsSeverity?: number;
            heatmapImageUrl?: string;
            heatmapFrontUrl?: string;
            heatmapLeftUrl?: string;
            heatmapRightUrl?: string;
            detectionsFront?: string | null;
            detectionsLeft?: string | null;
            detectionsRight?: string | null;
            timestamp?: string;
            status?: string;
          }) => {
```

Then add detection parsing after the URL resolution lines (~line 307):

```typescript
            const parseDets = (json?: string | null): Detection[] => {
              try { return json ? JSON.parse(json) : []; }
              catch { return []; }
            };
            const frontDets = parseDets(analysis.detectionsFront);
            const leftDets = parseDets(analysis.detectionsLeft);
            const rightDets = parseDets(analysis.detectionsRight);
```

Then add `detections` to each angle in `per_angle` (~line 325):
```typescript
              per_angle: {
                front: {
                  label: "completed",
                  confidence: 1.0,
                  scores: overallScores,
                  heatmap_overlay_data_url: frontUrl,
                  detections: frontDets,
                },
                left: {
                  label: "completed",
                  confidence: 1.0,
                  scores: overallScores,
                  heatmap_overlay_data_url: leftUrl,
                  detections: leftDets,
                },
                right: {
                  label: "completed",
                  confidence: 1.0,
                  scores: overallScores,
                  heatmap_overlay_data_url: rightUrl,
                  detections: rightDets,
                },
              },
```

- [ ] **Step 3: Replace heatmap `<img>` with `<HeatmapOverlay>`**

Find the heatmap rendering block (~line 1261–1288):
```tsx
                                {angleOrder.map((angle) => {
                                  const overlayUrl =
                                    analysisByDate[selectedDay.date].per_angle[
                                      angle
                                    ]?.heatmap_overlay_data_url ?? "";
                                  return overlayUrl ? (
                                    <div
                                      key={`${selectedDay.date}-heatmap-${angle}`}
                                      className="rounded-xl overflow-hidden border border-slate-700"
                                    >
                                      <img
                                        src={overlayUrl}
                                        alt={`${formatAngleLabel(angle)} heatmap`}
                                        className="w-full aspect-[4/3] object-cover"
                                      />
                                      <p className="text-center text-[11px] py-2 text-on-surface-variant bg-slate-900/60">
                                        {formatAngleLabel(angle)}
                                      </p>
                                    </div>
                                  ) : (
                                    <div
                                      key={`${selectedDay.date}-heatmap-${angle}`}
                                      className="rounded-xl border border-dashed border-slate-700 aspect-[4/3] flex items-center justify-center text-[11px] text-on-surface-variant"
                                    >
                                      {formatAngleLabel(angle)} unavailable
                                    </div>
                                  );
                                })}
```

Replace with:
```tsx
                                {angleOrder.map((angle) => {
                                  const angleData = analysisByDate[selectedDay.date].per_angle[angle];
                                  const overlayUrl = angleData?.heatmap_overlay_data_url ?? "";
                                  const detections = angleData?.detections ?? [];
                                  return overlayUrl ? (
                                    <HeatmapOverlay
                                      key={`${selectedDay.date}-heatmap-${angle}`}
                                      imageUrl={overlayUrl}
                                      detections={detections}
                                      angleLabel={formatAngleLabel(angle)}
                                    />
                                  ) : (
                                    <div
                                      key={`${selectedDay.date}-heatmap-${angle}`}
                                      className="rounded-xl border border-dashed border-slate-700 aspect-[4/3] flex items-center justify-center text-[11px] text-on-surface-variant"
                                    >
                                      {formatAngleLabel(angle)} unavailable
                                    </div>
                                  );
                                })}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /c/Users/diap/Desktop/skinprogress/ui && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5: Start the frontend dev server and test manually**

```bash
cd /c/Users/diap/Desktop/skinprogress/ui && npm run dev
```

Open http://localhost:5173, go to the Gallery page, select a day with an analysis. Confirm:
- Heatmap images still display with multiple condition colors
- Hovering over a red spot shows `"Acne — Moderate"` (or similar)
- Hovering over an orange region shows `"Redness — Mild"` (or similar)
- Color legend appears below each heatmap showing only conditions present
- Old analyses without detections still show as plain images (no error)

- [ ] **Step 6: Commit**

```bash
git -C /c/Users/diap/Desktop/skinprogress add ui/src/pages/GalleryPage.tsx
git -C /c/Users/diap/Desktop/skinprogress commit -m "feat: integrate HeatmapOverlay with condition tooltips in gallery"
```
