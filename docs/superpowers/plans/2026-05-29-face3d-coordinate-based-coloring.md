# Face3DModel Coordinate-Based Coloring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 3D face model's yellow/brown heat-map zone coloring with natural skin tone (sampled from the selfie) and precise diagnostic spots (red/orange/purple) exactly where the AI analyzer detected conditions.

**Architecture:** `Face3DModel` accepts a new `detections` prop (array of per-spot AI results). Effect 1 extracts a single median skin color from the selfie. Effect 2 paints each vertex either median skin tone or a condition color, decided by hit-testing the vertex's image-space coordinates against each detection's position and radius. All zone-based coloring code is deleted.

**Tech Stack:** React 19, TypeScript, Three.js r184, existing `Detection` type from `HeatmapOverlay.tsx`

---

## File Map

| File | Change |
|---|---|
| `ui/src/components/Face3DModel.tsx` | Main: add prop, update FaceRegion, rewrite Effect 1 median step, rewrite Effect 2 vertex loop, delete obsolete functions |
| `ui/src/pages/GalleryPage.tsx` | Minor: pass `detections` prop to `<Face3DModel>` |

---

## Task 1: Add `detections` prop + wire GalleryPage

**Files:**
- Modify: `ui/src/components/Face3DModel.tsx:1-4` (imports)
- Modify: `ui/src/components/Face3DModel.tsx:44-47` (Props interface)
- Modify: `ui/src/components/Face3DModel.tsx:49` (destructure)
- Modify: `ui/src/pages/GalleryPage.tsx:1260-1263` (Face3DModel usage)

- [ ] **Step 1: Add Detection import to Face3DModel.tsx**

At the top of `ui/src/components/Face3DModel.tsx`, add the import after the existing imports:

```typescript
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Detection } from "./HeatmapOverlay";
```

- [ ] **Step 2: Add detections to Props interface**

Replace:
```typescript
interface Props {
  scores: Record<string, number>;
  frontPhotoUrl?: string | null;
}
```

With:
```typescript
interface Props {
  scores: Record<string, number>;
  frontPhotoUrl?: string | null;
  detections?: Detection[];
}
```

- [ ] **Step 3: Destructure detections in the component**

Replace:
```typescript
export function Face3DModel({ scores, frontPhotoUrl }: Props) {
```

With:
```typescript
export function Face3DModel({ scores, frontPhotoUrl, detections }: Props) {
```

- [ ] **Step 4: Pass detections from GalleryPage**

In `ui/src/pages/GalleryPage.tsx`, replace:
```tsx
<Face3DModel
  scores={analysisByDate[selectedDay.date].overall_scores}
  frontPhotoUrl={getPhotoForAngle(selectedDay.photos, "front")?.url}
/>
```

With:
```tsx
<Face3DModel
  scores={analysisByDate[selectedDay.date].overall_scores}
  frontPhotoUrl={getPhotoForAngle(selectedDay.photos, "front")?.url}
  detections={analysisByDate[selectedDay.date].per_angle?.front?.detections ?? []}
/>
```

- [ ] **Step 5: Verify TypeScript compiles**

Run from `ui/`:
```bash
npm run build
```
Expected: build succeeds (no TS errors). The `detections` prop is accepted but not yet used, which is fine — TypeScript will not error on an unused prop.

- [ ] **Step 6: Commit**

```bash
git add ui/src/components/Face3DModel.tsx ui/src/pages/GalleryPage.tsx
git commit -m "feat: add detections prop to Face3DModel, wire from GalleryPage"
```

---

## Task 2: Update FaceRegion interface + compute median skin color in Effect 1

**Files:**
- Modify: `ui/src/components/Face3DModel.tsx:34-42` (FaceRegion interface)
- Modify: `ui/src/components/Face3DModel.tsx:88-155` (Effect 1 body)

- [ ] **Step 1: Update FaceRegion interface**

Replace:
```typescript
interface FaceRegion {
  data: Uint8ClampedArray;
  W: number;
  H: number;
  cx: number; // face centroid x in image pixels
  cy: number; // face centroid y in image pixels
  rx: number; // face half-width
  ry: number; // face half-height
}
```

With:
```typescript
interface FaceRegion {
  W: number;
  H: number;
  cx: number;   // face centroid x in image pixels
  cy: number;   // face centroid y in image pixels
  rx: number;   // face half-width
  ry: number;   // face half-height
  skinR: number; // median skin R channel, 0-255
  skinG: number; // median skin G channel, 0-255
  skinB: number; // median skin B channel, 0-255
}
```

- [ ] **Step 2: Rewrite the Pass 2 block in Effect 1 to collect and compute median**

The current Pass 2 block in Effect 1 is (lines ~109–151):

```typescript
// Pass 2: keep only face skin pixels (within 45% of min dimension from centroid)
// This excludes neck, shoulders, background, and skin-colored non-face areas.
const maxRadius = Math.min(W, H) * 0.45;
let faceCount = 0,
  faceSumX = 0,
  faceSumY = 0;
let minX = W,
  maxX = 0,
  minY = H,
  maxY = 0;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (!isSkinPixel(data[i], data[i + 1], data[i + 2])) continue;
    if (Math.hypot(x - roughCx, y - roughCy) > maxRadius) continue;
    faceSumX += x;
    faceSumY += y;
    faceCount++;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
}

if (faceCount < 200 || maxX <= minX || maxY <= minY) {
  setPixelVersion((v) => v + 1);
  return;
}

regionRef.current = {
  data,
  W,
  H,
  cx: faceSumX / faceCount,
  cy: faceSumY / faceCount,
  rx: (maxX - minX) / 2,
  ry: (maxY - minY) / 2,
};
```

Replace it entirely with:

```typescript
// Pass 2: face skin pixels within 45% of min dimension — collect geometry + pixel values
const maxRadius = Math.min(W, H) * 0.45;
let faceCount = 0,
  faceSumX = 0,
  faceSumY = 0;
let minX = W,
  maxX = 0,
  minY = H,
  maxY = 0;
const rVals: number[] = [],
  gVals: number[] = [],
  bVals: number[] = [];
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (!isSkinPixel(data[i], data[i + 1], data[i + 2])) continue;
    if (Math.hypot(x - roughCx, y - roughCy) > maxRadius) continue;
    faceSumX += x;
    faceSumY += y;
    faceCount++;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    rVals.push(data[i]);
    gVals.push(data[i + 1]);
    bVals.push(data[i + 2]);
  }
}

if (faceCount < 200 || maxX <= minX || maxY <= minY) {
  setPixelVersion((v) => v + 1);
  return;
}

rVals.sort((a, b) => a - b);
gVals.sort((a, b) => a - b);
bVals.sort((a, b) => a - b);
const mid = Math.floor(rVals.length / 2);

regionRef.current = {
  W,
  H,
  cx: faceSumX / faceCount,
  cy: faceSumY / faceCount,
  rx: (maxX - minX) / 2,
  ry: (maxY - minY) / 2,
  skinR: rVals[mid] ?? 180,
  skinG: gVals[mid] ?? 140,
  skinB: bVals[mid] ?? 120,
};
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npm run build
```
Expected: build succeeds. TypeScript will complain that `region.data` is used in Effect 2 — that's expected and will be fixed in Task 3.

- [ ] **Step 4: Commit**

```bash
git add ui/src/components/Face3DModel.tsx
git commit -m "feat: compute median skin color from face region in Effect 1"
```

---

## Task 3: Replace vertex coloring in Effect 2

**Files:**
- Modify: `ui/src/components/Face3DModel.tsx` — add helpers, rewrite vertex loop, update useEffect deps

- [ ] **Step 1: Add CONDITION_COLORS constant and hitTestDetection helper**

Add these two items immediately above the `FACE_MODEL` constant at the top of the file (after imports, before `FACE_MODEL`):

```typescript
const CONDITION_COLORS: Record<string, [number, number, number]> = {
  acne:           [0.863, 0.078, 0.078], // #DC1414
  redness:        [0.902, 0.392, 0.0],   // #E66400
  under_eye_bags: [0.392, 0.0,   0.784], // #6400C8
};

function hitTestDetection(imgX: number, imgY: number, det: Detection): boolean {
  if (det.type === "spot") {
    if (det.x == null || det.y == null || det.radius == null) return false;
    return Math.hypot(imgX - det.x, imgY - det.y) < det.radius * 1.3;
  }
  if (det.type === "zone") {
    if (det.x1 == null || det.y1 == null || det.x2 == null || det.y2 == null)
      return false;
    return imgX >= det.x1 && imgX <= det.x2 && imgY >= det.y1 && imgY <= det.y2;
  }
  return false;
}
```

- [ ] **Step 2: Add detectionsKey derived value inside the component**

After the `const eyeS = ...` line (or wherever `acne/red/eyeS` are declared), add:

```typescript
const detectionsKey = JSON.stringify(detections ?? []);
```

- [ ] **Step 3: Replace the vertex coloring block inside Effect 2**

Inside Effect 2, find the vertex `for` loop body. The block to replace starts at:
```typescript
let r: number, g: number, b: number;

if (region && fnz > -0.05) {
```
and ends at:
```typescript
colorBuf[i * 3] = r;
colorBuf[i * 3 + 1] = g;
colorBuf[i * 3 + 2] = b;
```

Replace the entire block with:

```typescript
let r: number, g: number, b: number;
const blend = Math.max(0, Math.min(1, (fnz + 0.05) / 0.35)) ** 1.5;

if (!region || fnz < -0.05) {
  r = skinDark.r;
  g = skinDark.g;
  b = skinDark.b;
} else {
  const imgX = region.cx + normX * region.rx;
  const imgY = region.cy + region.ry * (1 - 2 * normY);

  let bestDet: Detection | null = null;
  let bestSev = -1;
  for (const det of (detections ?? [])) {
    if (hitTestDetection(imgX, imgY, det) && det.severity > bestSev) {
      bestSev = det.severity;
      bestDet = det;
    }
  }

  const skinMR = region.skinR / 255;
  const skinMG = region.skinG / 255;
  const skinMB = region.skinB / 255;

  let targetR: number, targetG: number, targetB: number;
  if (bestDet) {
    const cc = CONDITION_COLORS[bestDet.condition] ?? [0.863, 0.078, 0.078];
    targetR = skinMR + 0.82 * (cc[0] - skinMR);
    targetG = skinMG + 0.82 * (cc[1] - skinMG);
    targetB = skinMB + 0.82 * (cc[2] - skinMB);
  } else {
    targetR = skinMR;
    targetG = skinMG;
    targetB = skinMB;
  }

  r = skinDark.r + blend * (targetR - skinDark.r);
  g = skinDark.g + blend * (targetG - skinDark.g);
  b = skinDark.b + blend * (targetB - skinDark.b);
}

colorBuf[i * 3] = r;
colorBuf[i * 3 + 1] = g;
colorBuf[i * 3 + 2] = b;
```

- [ ] **Step 4: Update useEffect dependency array**

At the bottom of Effect 2, replace:
```typescript
}, [pixelVersion, acne, red, eyeS]);
```

With:
```typescript
}, [pixelVersion, detectionsKey]);
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npm run build
```
Expected: build succeeds. TypeScript may warn about `acne`, `red`, `eyeS` being unused — those are removed in Task 4.

- [ ] **Step 6: Commit**

```bash
git add ui/src/components/Face3DModel.tsx
git commit -m "feat: replace vertex coloring with detection-based coordinate mapping"
```

---

## Task 4: Delete obsolete code + lint + visual verify

**Files:**
- Modify: `ui/src/components/Face3DModel.tsx` — remove dead code

- [ ] **Step 1: Delete scoreToHeat function**

Remove the entire `scoreToHeat` function (lines 8–24 in the original file):

```typescript
function scoreToHeat(s: number): THREE.Color {
  const t = Math.max(0, Math.min(1, s));
  if (t < 0.5) {
    const u = t * 2;
    return new THREE.Color(
      0.133 + u * 0.785,
      0.773 - u * 0.071,
      0.369 - u * 0.338,
    );
  }
  const u = (t - 0.5) * 2;
  return new THREE.Color(
    0.918 + u * 0.019,
    0.702 - u * 0.435,
    0.031 + u * 0.236,
  );
}
```

- [ ] **Step 2: Delete acne/red/eyeS score extractions**

Remove these three lines from the component body:
```typescript
const acne = scores.acne ?? 0;
const red = scores.redness ?? 0;
const eyeS = scores.under_eye_bags ?? 0;
```

- [ ] **Step 3: Delete zc, skinBase, lerp, and zoneColor**

Inside Effect 2, remove:

1. The `zc` object:
```typescript
const zc = {
  forehead: scoreToHeat(acne * 0.9),
  leftCheek: scoreToHeat(red),
  rightCheek: scoreToHeat(red),
  nose: scoreToHeat((acne + red) / 2),
  chin: scoreToHeat(acne * 0.7),
  underEye: scoreToHeat(eyeS),
};
```

2. The `skinBase` constant:
```typescript
const skinBase = new THREE.Color(0.70, 0.50, 0.40);
```

3. The `lerp` helper:
```typescript
const lerp = (a: THREE.Color, b: THREE.Color, t: number) =>
  a.clone().lerp(b, Math.max(0, Math.min(1, t)));
```

4. The entire `zoneColor` function (the long block from `function zoneColor` through its closing `}`).

- [ ] **Step 4: Run lint**

```bash
npm run lint
```
Expected: no errors. If ESLint reports unused variables in `Face3DModel.tsx` that you missed, remove them.

- [ ] **Step 5: Run build**

```bash
npm run build
```
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 6: Start dev server and visually verify**

```bash
npm run dev
```

Navigate to the Gallery page and open a day with an analysis. Verify:
1. The 3D model shows a natural, uniform skin tone matching the selfie (no yellow/brown patches)
2. If the analysis has detections, the model shows clearly visible red/orange/purple spots at the correct positions
3. If `detections` is `[]`, the model shows only clean skin with no colored zones
4. Rotating the model (drag) works as before
5. Model loads without console errors

- [ ] **Step 7: Commit**

```bash
git add ui/src/components/Face3DModel.tsx
git commit -m "refactor: remove obsolete scoreToHeat/zoneColor zone coloring from Face3DModel"
```
