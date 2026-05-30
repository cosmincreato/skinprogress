# Heatmap Condition Tooltips Design

**Date:** 2026-05-28  
**Status:** Approved  
**Scope:** AI service, backend (entity + migration + controller), frontend (new component)

## Problem

The heatmap overlay is a static PNG with no information about which condition each highlighted region represents. All spots use the same green→yellow→red gradient regardless of whether they indicate acne, redness, or under-eye bags. There is no way to tell conditions apart visually, and no hover interaction.

## Solution

Generate a composite per-condition-colored heatmap (acne = red, redness = orange, under-eye bags = purple) alongside JSON detection metadata. The frontend renders the heatmap with transparent hit zones overlaid, each showing a tooltip on hover identifying the condition and severity.

---

## Section 1: AI Service (`ai-service/app.py`)

### 1.1 Per-condition color functions

Replace `_get_severity_color(severity)` with `_get_condition_color(condition: str, severity: float) -> tuple[int, int, int]`:

| Condition | Low severity (0.0) | High severity (1.0) |
|---|---|---|
| `acne` | `(255, 200, 200)` light pink | `(220, 20, 20)` deep red |
| `redness` | `(255, 220, 180)` light orange | `(230, 100, 0)` deep orange |
| `under_eye_bags` | `(220, 200, 255)` light lavender | `(100, 0, 200)` deep purple |

Linear interpolation between low and high by severity.

### 1.2 Composite heatmap function

New `_build_composite_heatmap_overlay(image, pts) -> str | None`:
- Calls existing acne detection (YOLO + color fallback) to get acne spots
- Calls `_build_redness_heatmap(image)` for redness
- Calls `_build_under_eye_heatmap(image)` for under-eye bags
- Renders all three condition layers onto one RGBA overlay using `_get_condition_color`
- For redness/under-eye: uses the existing heatmap arrays, applies condition color per pixel
- For acne: uses Gaussian blobs per detection, same as current `_build_acne_yolo_heatmap_overlay`
- Composites over original image and returns PNG data URL

### 1.3 Detection metadata

New `_build_detection_metadata(image, pts) -> list[dict]`:

Returns a list of detection dicts:

```json
[
  {"condition": "acne", "x": 150, "y": 200, "radius": 15, "severity": 0.7, "type": "spot"},
  {"condition": "redness", "x1": 100, "y1": 80, "x2": 400, "y2": 300, "severity": 0.5, "type": "zone"},
  {"condition": "under_eye_bags", "x1": 150, "y1": 140, "x2": 300, "y2": 180, "severity": 0.4, "type": "zone"}
]
```

- Acne spots: one dict per YOLO detection or color blemish, with `x/y/radius` in original image space
- Redness zone: bounding box of pixels where redness heatmap > 0.3, with mean severity
- Under-eye zone: bounding box from `_build_under_eye_heatmap` high-intensity region, with mean severity
- If a condition has no detections above threshold, it is omitted from the list

### 1.4 `analyze_set` response change

Each per-angle entry gains:
```json
{
  "heatmap_overlay_data_url": "data:image/png;base64,...",
  "detections": [...]
}
```

`_safe_build_heatmap_overlay` is replaced by `_build_composite_heatmap_overlay` for the `yolo_acne` backend. Other backends (`uniform_face`, `local_regions`, `patch`) keep their existing single-condition overlays with empty `detections: []`.

---

## Section 2: Backend

### 2.1 `AnalysisResult` entity

Add three nullable string columns:
```csharp
public string? DetectionsFrontJson { get; set; }
public string? DetectionsLeftJson { get; set; }
public string? DetectionsRightJson { get; set; }
```

### 2.2 EF Core migration

`dotnet ef migrations add AddDetectionsJson`

### 2.3 `SaveAnalysisHeatmapAsync`

After saving each angle's heatmap file, also read `angleData["detections"]` from the AI response JSON and store it as a JSON string in the corresponding `DetectionsXxxJson` column.

### 2.4 `AnalyzeSelfieSet` live response

After replacing `heatmap_overlay_data_url` with the saved file URL, pass through `detections` from the AI response as-is (coordinates are in original image space — the frontend handles scaling).

### 2.5 `GetAllAnalyses`

Add to each analysis entry:
```csharp
detectionsFront = ar.DetectionsFrontJson,
detectionsLeft = ar.DetectionsLeftJson,
detectionsRight = ar.DetectionsRightJson,
```

---

## Section 3: Frontend

### 3.1 New `HeatmapOverlay` component

**File:** `ui/src/components/HeatmapOverlay.tsx`

**Props:**
```typescript
interface Detection {
  condition: "acne" | "redness" | "under_eye_bags";
  severity: number;
  type: "spot" | "zone";
  // spot fields
  x?: number; y?: number; radius?: number;
  // zone fields
  x1?: number; y1?: number; x2?: number; y2?: number;
}

interface HeatmapOverlayProps {
  imageUrl: string;
  detections: Detection[];
}
```

**Behavior:**
- Renders heatmap `<img>` inside a `position: relative` container
- Uses `ResizeObserver` on the container to get rendered dimensions
- Reads `naturalWidth/naturalHeight` from the `<img>` element's `onLoad` event
- Scales each detection's coordinates: `displayX = origX * (renderedWidth / naturalWidth)`
- For each spot detection: absolutely-positioned circular `<div>` (border-radius: 50%) with `onMouseEnter`/`onMouseLeave` showing a tooltip
- For each zone detection: absolutely-positioned rectangular `<div>` with same hover behavior
- Tooltip content: `"Acne — Moderate"` (severity bucketed: 0–0.33 = Mild, 0.34–0.66 = Moderate, 0.67+ = Severe)
- Hit zone divs are invisible (opacity: 0, cursor: crosshair) — they are interaction targets only, not visual

**Condition label display names:**
```typescript
const CONDITION_LABELS = {
  acne: "Acne",
  redness: "Redness",
  under_eye_bags: "Under-eye bags",
};
```

### 3.2 Color legend

Rendered below each `HeatmapOverlay`, showing only conditions present in the detections array:

```
● Acne  ● Redness  ● Under-eye bags
```

Dot colors: red `#DC1414`, orange `#E66400`, purple `#6400C8`.

### 3.3 GalleryPage integration

In `GalleryPage.tsx`, where heatmap angles are currently rendered as `<img>`:
- Replace with `<HeatmapOverlay>` when `overlayUrl` and `detections` are both available
- Fall back to plain `<img>` when `detections` is null/empty (old analyses without metadata)
- Parse the `detectionsFront/Left/Right` JSON strings from `analysisByDate`

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| AI service returns no `detections` field | Backend stores null, frontend falls back to plain `<img>` |
| Detection metadata malformed/unparseable | Backend skips storage, logs warning; frontend falls back |
| Redness/under-eye heatmap all-zero | Condition omitted from detections list |
| Image not yet loaded (ResizeObserver not fired) | Hit zones not rendered until dimensions known |
| Old analysis records (no DetectionsXxxJson) | `GetAllAnalyses` returns null; frontend renders plain `<img>` |

## What Does Not Change

- Heatmap file storage location/naming
- `GetAnalysisForDate` endpoint
- Gallery layout, date filtering, compare mode
- Auth, habits, badges, evolution dashboard
- Non-`yolo_acne` heatmap backends
