# Face3D Multi-Angle Coloring Design

**Date:** 2026-06-19  
**Status:** Approved  
**File:** `ui/src/components/Face3DModel.tsx`

## Problem

The current 3D face model coloring system has two major weaknesses:

1. All conditions (acne, redness, under-eye bags) map to the same red color — there is no visual distinction between condition types.
2. Left and right angle photo data is ignored when detection blobs are present. The model either shows front-photo blobs OR falls back to per-angle anatomical zones — never both at the same time. Cheek asymmetry from side photos is lost.

## Goal

When a user looks at their front selfie and then at the 3D model, they should say "yeah, that looks right." Accurate color placement and per-condition color coding are the two levers.

## Condition Colors

Natural/subtle palette — colors that read like real skin conditions, not clinical diagrams.

| Condition | Color | Hex | Linear RGB |
|---|---|---|---|
| Acne | Crimson | `#c0392b` | `[0.75, 0.22, 0.17]` |
| Redness | Soft rose | `#e07070` | `[0.88, 0.44, 0.44]` |
| Under-eye bags | Blue-grey | `#8b8bbf` | `[0.55, 0.55, 0.75]` |

## Mapping Strategy Per Condition

### Redness — Weighted Composite

Redness is a diffuse skin tone condition. A flush that appears on the left cheek in the side photo realistically extends somewhat toward the nose. Weighted composite handles this naturally:

For each vertex, compute a visibility weight for each angle based on normX position:

```
w_front = Gaussian(normX, center=0.0,   sigma=0.50)
w_left  = Gaussian(normX, center=+0.55, sigma=0.35)   // person's left cheek
w_right = Gaussian(normX, center=-0.55, sigma=0.35)   // person's right cheek
```

Redness blend weight at vertex:
```
rednessW = (w_front·redFront + w_left·redLeft + w_right·redRight) / (w_front + w_left + w_right)
```

Where `redFront/Left/Right` come from `perAngle.front/left/right.scores.redness` (falling back to overall `scores.redness`).

### Acne — Zone Blending

Acne is a spot condition — position matters. Two sources combine additively:

1. **Front-photo detection blobs** (existing system, unchanged): Gaussian blobs placed at actual detection positions from the front selfie, covering the center zone of the face.
2. **Per-angle cheek blobs** (new): Two fixed anatomical Gaussian blobs for left and right cheeks, driven by `perAngle.left.scores.acne` and `perAngle.right.scores.acne`. These always contribute alongside front blobs — no either/or switch.

Acne blob positions (normX, normY):
- Left cheek: `(+0.30, 0.53)`, σx=0.13, σy=0.11
- Right cheek: `(-0.30, 0.53)`, σx=0.13, σy=0.11

Final acne blend weight = max of all blob contributions (front detections + cheek blobs), clamped to [0,1].

### Under-Eye Bags — Zone Blending

Fixed anatomical positions, driven by per-angle scores:

| Zone | normX | normY | σx | σy | Score source |
|---|---|---|---|---|---|
| Left under-eye | +0.16 | 0.70 | 0.08 | 0.04 | `perAngle.left.scores.under_eye_bags` |
| Right under-eye | −0.16 | 0.70 | 0.08 | 0.04 | `perAngle.right.scores.under_eye_bags` |

## Multi-Condition Blending

All three conditions blend additively over the base skin tone:

```
r = skinR + acneW·(acneR − skinR) + rednessW·(rednessR − skinR) + eyeW·(eyeR − skinR)
g = skinG + acneW·(acneG − skinG) + rednessW·(rednessG − skinG) + eyeW·(eyeG − skinG)
b = skinB + acneW·(acneB − skinB) + rednessW·(rednessB − skinB) + eyeW·(eyeB − skinB)
```

Each weight passes through `Math.pow(w, 0.7)` gamma before blending (preserves current behaviour — keeps mid-weights subdued, high-severity vivid). Channels clamped to [0,1].

When conditions overlap (e.g. acne inside a redness zone), the colors mix — a crimson spot on a rose background reads as a darker red, which is visually correct.

## What Does Not Change

- Skin tone extraction (YCrCb, median RGB from selfie)
- Roughness texture (procedural pore microstructure)
- Three-point lighting rig
- `MeshPhysicalMaterial` settings (sheen, roughness, metalness)
- Drag/rotate interaction
- Front-facing gate (`faceW` from surface normal Z)
- Overall gamma `Math.pow(w, 0.7)`

## Scope

Single file change: `ui/src/components/Face3DModel.tsx`.

No backend changes. No prop interface changes — `perAngle` already exists on `Props`.
