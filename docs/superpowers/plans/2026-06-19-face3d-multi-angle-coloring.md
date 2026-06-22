# Face3D Multi-Angle Coloring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-color, front-only coloring system in the 3D face model with per-condition colors and accurate 3-angle mapping (weighted composite for redness, zone blending for acne/under-eye).

**Architecture:** Single file change to `ui/src/components/Face3DModel.tsx`. Three condition constants replace the single `ACNE_COLOR`. Vertex coloring loop gains per-condition blend weight computation and additive multi-condition blending. No prop interface changes — `perAngle` already exists.

**Tech Stack:** React 19, Three.js, TypeScript (strict)

**Spec:** `docs/superpowers/specs/2026-06-19-face3d-multi-angle-coloring-design.md`

---

### Task 1: Replace single color constant with per-condition color constants

**Files:**
- Modify: `ui/src/components/Face3DModel.tsx:7`

This removes `ACNE_COLOR` and adds three typed color constants. Nothing else changes yet — the rest of the file still references `ACNE_COLOR` and will be updated in Task 2.

- [ ] **Step 1: Replace the color constant block**

In `ui/src/components/Face3DModel.tsx`, replace lines 6–7:

```ts
// Condition colors (linear RGB, 0-1)
const ACNE_COLOR = [0.85, 0.06, 0.06] as const; // red — all conditions map to this
```

With:

```ts
// Condition colors (linear RGB, 0-1) — natural/subtle palette
const ACNE_COLOR    = [0.75, 0.22, 0.17] as const; // crimson
const REDNESS_COLOR = [0.88, 0.44, 0.44] as const; // soft rose
const EYE_COLOR     = [0.55, 0.55, 0.75] as const; // blue-grey
```

- [ ] **Step 2: Verify TypeScript compiles (ACNE_COLOR still used downstream — that's fine)**

```bash
cd ui && npx tsc --noEmit
```

Expected: 0 errors (ACNE_COLOR is still referenced in the vertex loop, so no unused-variable error).

- [ ] **Step 3: Commit**

```bash
git add ui/src/components/Face3DModel.tsx
git commit -m "feat: add per-condition color constants for acne, redness, under-eye"
```

---

### Task 2: Add angle-visibility weight helper and per-condition score derivation

**Files:**
- Modify: `ui/src/components/Face3DModel.tsx`

This adds the `angleWeight` helper function and derives the 7 per-angle scores used in vertex coloring. The vertex loop itself is untouched until Task 3.

- [ ] **Step 1: Add `angleWeight` helper after the `gauss2d` function (after line 29)**

```ts
// Gaussian visibility weight — how well a given face angle "sees" this normX position
function angleWeight(normX: number, center: number, sigma: number): number {
  const d = (normX - center) / sigma;
  return Math.exp(-0.5 * d * d);
}
```

- [ ] **Step 2: In Effect 2, replace the per-angle score derivation block (lines 249–264) with expanded version**

Find this block (starting at `// Overall scores`):

```ts
// Overall scores (fallback for zones without an angle-specific reading)
const acneScore    = Math.min(1, scores.acne           ?? 0);
const rednessScore = Math.min(1, scores.redness        ?? 0);
const eyeScore     = Math.min(1, scores.under_eye_bags ?? 0);

// Per-angle scores — drive left/right cheek zones independently
const frontScores = perAngle?.front?.scores ?? scores;
const leftScores  = perAngle?.left?.scores  ?? scores;
const rightScores = perAngle?.right?.scores ?? scores;

const acneLeft      = Math.min(1, leftScores.acne           ?? acneScore);
const acneRight     = Math.min(1, rightScores.acne          ?? acneScore);
const redLeft       = Math.min(1, leftScores.redness        ?? rednessScore);
const redRight      = Math.min(1, rightScores.redness       ?? rednessScore);
const redNose       = Math.min(1, frontScores.redness       ?? rednessScore);
const eyeLeft       = Math.min(1, leftScores.under_eye_bags  ?? eyeScore);
const eyeRight      = Math.min(1, rightScores.under_eye_bags ?? eyeScore);
```

Replace with:

```ts
// Overall scores (fallback when per-angle data is absent)
const acneScore    = Math.min(1, scores.acne           ?? 0);
const rednessScore = Math.min(1, scores.redness        ?? 0);
const eyeScore     = Math.min(1, scores.under_eye_bags ?? 0);

// Per-angle score objects
const frontScores = perAngle?.front?.scores ?? scores;
const leftScores  = perAngle?.left?.scores  ?? scores;
const rightScores = perAngle?.right?.scores ?? scores;

// Acne — per-angle cheek severity (front blobs handled separately via detections)
const acneLeft  = Math.min(1, leftScores.acne  ?? acneScore);
const acneRight = Math.min(1, rightScores.acne ?? acneScore);

// Redness — weighted composite inputs
const redFront = Math.min(1, frontScores.redness ?? rednessScore);
const redLeft  = Math.min(1, leftScores.redness  ?? rednessScore);
const redRight = Math.min(1, rightScores.redness ?? rednessScore);

// Under-eye — per-angle (left angle sees person's left eye, right angle sees person's right)
const eyeLeft  = Math.min(1, leftScores.under_eye_bags  ?? eyeScore);
const eyeRight = Math.min(1, rightScores.under_eye_bags ?? eyeScore);
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd ui && npx tsc --noEmit
```

Expected: 0 errors. `redNose` is removed — confirm it's no longer referenced (it won't be, since the vertex loop is about to be replaced in Task 3).

- [ ] **Step 4: Commit**

```bash
git add ui/src/components/Face3DModel.tsx
git commit -m "feat: add angleWeight helper and expand per-angle score derivation"
```

---

### Task 3: Rewrite vertex coloring loop with per-condition blend weights

**Files:**
- Modify: `ui/src/components/Face3DModel.tsx` — the inner `for` loop inside `headGroup.traverse`

This is the core change. The loop currently computes a single `blendWeight` and blends everything to red. Replace it with three independent weights (acne, redness, under-eye) and additive multi-condition blending.

- [ ] **Step 1: Replace the entire vertex `for` loop body**

Find the block starting at `// --- Detection-driven blobs` (inside the `for (let i = 0; i < posAttr.count; i++)` loop) through the end of `colorBuf` assignment. It currently looks like this:

```ts
            // --- Detection-driven blobs (when front photo detections are available) ---
            let blendWeight = 0;

            const blobs = blobsRef.current;
            if (blobs.length > 0) {
              // Detection-driven: actual positions from photo, severity = intensity
              for (const blob of blobs) {
                const w = gauss2d(normX, normY, blob.normX, blob.normY, blob.sigmaX, blob.sigmaY)
                  * blob.severity;
                if (w > blendWeight) blendWeight = w;
              }
            } else {
              // Fallback: fixed anatomical zones, per-angle score = intensity (not size)
              // This makes asymmetry visible: low score → dim, high score → bright
              blendWeight = Math.min(1, Math.max(
                gauss2d(normX, normY, -0.28, 0.53, 0.12, 0.10) * acneLeft,
                gauss2d(normX, normY,  0.28, 0.53, 0.12, 0.10) * acneRight,
                gauss2d(normX, normY,  0.00, 0.60, 0.10, 0.10) * redNose,
                gauss2d(normX, normY, -0.26, 0.55, 0.16, 0.12) * redLeft,
                gauss2d(normX, normY,  0.26, 0.55, 0.16, 0.12) * redRight,
                gauss2d(normX, normY, -0.16, 0.70, 0.08, 0.04) * eyeLeft,
                gauss2d(normX, normY,  0.16, 0.70, 0.08, 0.04) * eyeRight,
              ));
            }

            // Gamma: pushes mid-weights down, keeps high-severity spots vivid
            const blend = Math.pow(Math.min(1, blendWeight), 0.7) * faceW;

            // Start from base skin tone, blend into red
            let r = baseSkinR, g = baseSkinG, b = baseSkinB;

            r += blend * (ACNE_COLOR[0] - r);
            g += blend * (ACNE_COLOR[1] - g);
            b += blend * (ACNE_COLOR[2] - b);
```

Replace with:

```ts
            // --- Acne weight ---
            // Front-photo detection blobs + per-angle cheek anatomical blobs (additive)
            let acneW = 0;
            for (const blob of blobsRef.current) {
              const w = gauss2d(normX, normY, blob.normX, blob.normY, blob.sigmaX, blob.sigmaY)
                * blob.severity;
              if (w > acneW) acneW = w;
            }
            // Per-angle cheek blobs always contribute alongside front detections
            acneW = Math.min(1, Math.max(
              acneW,
              gauss2d(normX, normY, +0.30, 0.53, 0.13, 0.11) * acneLeft,
              gauss2d(normX, normY, -0.30, 0.53, 0.13, 0.11) * acneRight,
            ));

            // --- Redness weight — weighted composite across all 3 angles ---
            const wFront = angleWeight(normX,  0.00, 0.50);
            const wLeft  = angleWeight(normX, +0.55, 0.35);
            const wRight = angleWeight(normX, -0.55, 0.35);
            const wSum   = wFront + wLeft + wRight || 1;
            const rednessW = Math.min(1,
              (wFront * redFront + wLeft * redLeft + wRight * redRight) / wSum
            );

            // --- Under-eye weight ---
            const eyeW = Math.min(1, Math.max(
              gauss2d(normX, normY, +0.16, 0.70, 0.08, 0.04) * eyeLeft,
              gauss2d(normX, normY, -0.16, 0.70, 0.08, 0.04) * eyeRight,
            ));

            // Gamma: pushes mid-weights down, keeps high-severity vivid
            const acneBlend    = Math.pow(acneW,    0.7) * faceW;
            const rednessBlend = Math.pow(rednessW, 0.7) * faceW;
            const eyeBlend     = Math.pow(eyeW,     0.7) * faceW;

            // Additive multi-condition blend over base skin tone
            let r = baseSkinR + acneBlend * (ACNE_COLOR[0] - baseSkinR)
                               + rednessBlend * (REDNESS_COLOR[0] - baseSkinR)
                               + eyeBlend * (EYE_COLOR[0] - baseSkinR);
            let g = baseSkinG + acneBlend * (ACNE_COLOR[1] - baseSkinG)
                               + rednessBlend * (REDNESS_COLOR[1] - baseSkinG)
                               + eyeBlend * (EYE_COLOR[1] - baseSkinG);
            let b = baseSkinB + acneBlend * (ACNE_COLOR[2] - baseSkinB)
                               + rednessBlend * (REDNESS_COLOR[2] - baseSkinB)
                               + eyeBlend * (EYE_COLOR[2] - baseSkinB);
            r = Math.min(1, Math.max(0, r));
            g = Math.min(1, Math.max(0, g));
            b = Math.min(1, Math.max(0, b));
```

- [ ] **Step 2: Verify TypeScript compiles with zero errors**

```bash
cd ui && npx tsc --noEmit
```

Expected: 0 errors. If `redNose` appears as an undefined variable, you missed replacing it in Task 2 — go back and remove that line.

- [ ] **Step 3: Start the dev server and visually verify**

```bash
cd ui && npm run dev
```

Open `http://localhost:5173`. Navigate to a user's evolution or gallery page that shows the 3D face model. Verify:

- With **all scores at 0**: model shows only the base skin tone (warm neutral or sampled from selfie). No color blobs.
- With **high redness only** (mock or real data): both cheeks and nose flush with soft rose. The flush should be smooth — no visible seam between zones.
- With **high acne on left angle only**: the left cheek (viewer's right) shows crimson. Right cheek stays skin-toned.
- With **high under-eye bags**: two blue-grey shadows appear below the eye positions.
- With **all conditions high**: colors mix naturally (e.g., acne inside redness zone reads as a darker, slightly more crimson patch).

- [ ] **Step 4: Commit**

```bash
git add ui/src/components/Face3DModel.tsx
git commit -m "feat: multi-angle vertex coloring — weighted composite redness, per-condition colors, additive blending"
```
