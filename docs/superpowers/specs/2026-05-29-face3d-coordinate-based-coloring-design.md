# Face3DModel Coordinate-Based Coloring Design

**Date:** 2026-05-29  
**Status:** Approved  
**Scope:** Frontend only (`ui/src/components/Face3DModel.tsx`, `ui/src/pages/GalleryPage.tsx`)

## Problem

The current 3D face model shows random yellow and brown patches unrelated to the user's actual skin tone. Two root causes:

1. `scoreToHeat()` maps severity 0→1 to a greenish→yellow→orange-brown gradient and applies it at 82–85% opacity across entire anatomical zones (forehead, cheeks, nose, chin, under-eye). The colors look unnatural and bear no resemblance to actual skin conditions.
2. Per-vertex pixel sampling from the selfie can hit hair, background, or clothing pixels at zone boundaries, adding further random color contamination.

## Solution

Replace zone-based heat coloring with coordinate-based diagnostic spots. The 3D model always has both a selfie photo and AI detection data available (it is only generated after analysis), so no fallback is needed. Compute one representative skin tone from the selfie as a clean base. Paint condition spots only at the exact pixel positions the AI analyzer detected, using clinically meaningful colors.

---

## Section 1: Props

**File:** `ui/src/components/Face3DModel.tsx`

Add one prop to the existing `Props` interface:

```typescript
interface Props {
  scores: Record<string, number>;   // kept for subtitle text only
  frontPhotoUrl?: string | null;
  detections?: Detection[];         // NEW — from HeatmapOverlay.tsx
}
```

Import `Detection` from `./HeatmapOverlay` (both files live in `ui/src/components/`).

**GalleryPage change** (`ui/src/pages/GalleryPage.tsx`):

```tsx
<Face3DModel
  scores={analysisByDate[selectedDay.date].overall_scores}
  frontPhotoUrl={getPhotoForAngle(selectedDay.photos, "front")?.url}
  detections={analysisByDate[selectedDay.date].per_angle?.front?.detections ?? []}
/>
```

---

## Section 2: Skin tone base (Effect 1 change)

**Current behavior:** stores raw pixel data in `regionRef` for per-vertex lookup.

**New behavior:** Effect 1 additionally computes a single median skin color from all `isSkinPixel()` pixels inside the face bounds and stores it in `regionRef` alongside the existing geometry fields:

```typescript
interface FaceRegion {
  W: number; H: number;
  cx: number; cy: number;
  rx: number; ry: number;
  skinR: number;   // NEW — median skin color, 0–255
  skinG: number;
  skinB: number;
  // data field removed — no longer needed for per-vertex lookup
}
```

**Median computation:**
- Collect R, G, B of every pixel passing `isSkinPixel()` within the face bounding box
- Sort each channel array independently
- Take the middle element as the median
- Store as `skinR/G/B` in `regionRef`

The `data: Uint8ClampedArray` field is removed from `FaceRegion` — pixel-by-pixel vertex sampling is eliminated.

---

## Section 3: Detection-to-mesh hit test (Effect 2 change)

For each vertex, the code computes image-space coordinates using the face centroid:

```
imgX = cx + normX * rx
imgY = cy + ry * (1 − 2 * normY)
```

This formula is already present in Effect 2. Detection hit test reuses it:

**Spot detection** (`type: "spot"`, fields: `x`, `y`, `radius`):
```
distance(imgX − det.x, imgY − det.y) < det.radius * 1.3
```
Radius enlarged 1.3× for mesh resolution (3D mesh has fewer vertices than image pixels).

**Zone detection** (`type: "zone"`, fields: `x1`, `y1`, `x2`, `y2`):
```
det.x1 ≤ imgX ≤ det.x2  &&  det.y1 ≤ imgY ≤ det.y2
```

**Multi-detection conflict:** if a vertex is covered by more than one detection, the detection with the highest `severity` wins.

**No detection:** vertex gets median skin color.

**Back of head** (`fnz < 0`): vertex gets `skinDark` (unchanged from current code).

---

## Section 4: Condition colors and blending

Condition colors match the heatmap spec (`2026-05-28-heatmap-condition-tooltips-design.md`):

| Condition | Color | Hex |
|---|---|---|
| `acne` | Deep red | `#DC1414` → THREE.Color(0.863, 0.078, 0.078) |
| `redness` | Deep orange | `#E66400` → THREE.Color(0.902, 0.392, 0.0) |
| `under_eye_bags` | Deep purple | `#6400C8` → THREE.Color(0.392, 0.0, 0.784) |

**Blend formula:**
```
vertexColor = lerp(skinMedian, conditionColor, 0.82)
```

0.82 blend weight makes spots clearly visible (diagnostic style) while keeping the skin tone as a visible anchor so spots look like they belong on the face.

---

## Removed Code

The following are deleted entirely:

- `scoreToHeat()` function
- `zoneColor()` function  
- `zc` zone color map object
- `skinBase` constant
- Per-vertex pixel lookup inside Effect 2 (`region.data[k]` reads)
- `data: Uint8ClampedArray` field from `FaceRegion`

`skinDark` constant stays for back-of-head coloring.

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| `detections` prop is empty `[]` | All front-facing vertices get median skin color — clean natural face, no spots |
| `regionRef` is null (skin detection failed) | All vertices get `skinDark` fallback, no crash |
| Detection has `type: "spot"` but missing `x/y/radius` | Skip that detection silently |
| Detection has `type: "zone"` but missing `x1/y1/x2/y2` | Skip that detection silently |
| `frontPhotoUrl` is null | Skin detection skipped, `regionRef` stays null, skinDark fallback |

---

## What Does Not Change

- `isSkinPixel()` YCrCb skin detection logic
- Face centroid + bounds computation in Effect 1
- Three.js scene setup, lighting, camera, drag/rotation
- LeePerrySmith model loading and vertex iteration
- Roughness texture generation
- `MeshPhysicalMaterial` parameters
- `fnz` face-normal-z computation for front/back distinction
- `normX`, `normY` normalization formulas
- All other GalleryPage behavior (heatmap overlays, date filtering, compare mode, etc.)
