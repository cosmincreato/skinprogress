# Hyperpigmentation Detection — Fourth Criterion

**Date:** 2026-06-23  
**Status:** Approved

## Summary

Add hyperpigmentation as a fourth skin detection criterion alongside acne, redness, and under-eye bags. Detection uses CLIP zero-shot classification with the label `"hyperpigmentation"`. The heatmap uses the existing patch-grid overlay mechanism already used for redness. The new score flows through the full stack: AI service → backend entity → DTOs → frontend trend graph, period comparison, and PDF export.

---

## AI Service (`ai-service/app.py`)

- Add `"hyperpigmentation"` to `LABELS` list and `LABEL_KEY_MAP` / `KEY_LABEL_MAP`.
- In `_score_image`, extract the score from the CLIP result for both `clip` and `acne_severity` backends.
- The existing `_build_heatmap_overlay` dispatch already handles any key present in `KEY_LABEL_MAP`, so the patch-grid heatmap requires no new function.
- `overall_scores` dict and per-angle `scores` dict gain the `"hyperpigmentation"` key.
- The `/analyze-set` response includes `"hyperpigmentation"` in `overall_scores` and each `per_angle[angle]["scores"]`.

---

## Backend

### Entity (`AnalysisResult.cs`)
- Add `HyperpigmentationSeverity int?` column.
- Requires a new EF Core migration.

### DTO (`AnalysisResultDto.cs` → `SeverityScoresDto`)
- Add `Hyperpigmentation int` property.

### Service (`EvolutionAnalyticsService.cs`)
- Map AI score `hyperpigmentation` (0–1 float) → 0–10 int when saving analysis results, same pattern as acne/redness/under_eye_bags.

### Dashboard DTO (`SkinEvolutionDashboardDto.cs` → `TrendMetricsDto`)
- Add `HyperpigmentationAverage decimal?`, `HyperpigmentationTrend string?`, `HyperpigmentationImprovement decimal?` to match the acne/redness/under-eye pattern.

---

## Frontend

### Types (`src/types/evolution.ts`)
- Add `hyperpigmentation: number` to `SeverityScoresDto`.
- Add `hyperpigmentationAverage`, `hyperpigmentationTrend`, `hyperpigmentationImprovement` to `SkinEvolutionDashboardDto`.
- Add `hyperpigmentationPeriod1`, `hyperpigmentationPeriod2`, `hyperpigmentationDelta` to `PeriodComparisonDto`.
- Add `hyperpigmentation?: number` to `TrendDataPoint`.

### Components
- **`TrendGraph.tsx`** — add hyperpigmentation line; use a distinct color (e.g. `#a855f7` purple) to avoid confusion with acne (red) and redness (orange).
- **`PeriodComparison.tsx`** — add hyperpigmentation row to the per-metric comparison table.
- **`EvolutionPage.tsx`** — add hyperpigmentation to any summary stat cards that show the other three conditions.
- **`ExportReportButton.tsx`** — include hyperpigmentation score in the PDF export section.

---

## Data Flow

```
CLIP label "hyperpigmentation"
  → _score_image() returns { acne, redness, under_eye_bags, hyperpigmentation }
  → /analyze-set overall_scores + per_angle scores
  → PhotoController saves HyperpigmentationSeverity on AnalysisResult
  → EvolutionAnalyticsService maps to SeverityScoresDto.Hyperpigmentation
  → TrendMetricsDto.HyperpigmentationAverage / Trend / Improvement
  → Frontend TrendGraph line + PeriodComparison row + PDF export
```

---

## Migration

One new EF Core migration: `AddHyperpigmentationSeverity`.  
No breaking changes — field is nullable; existing rows default to `null`.

---

## Out of Scope

- Color-analysis-based heatmap (LAB L* / chroma approach) — CLIP patch-grid is sufficient.
- Multi-label CLIP prompts (`"dark spots"`, `"post-acne marks"`) — single label keeps it simple.
- Separate heatmap URL columns per angle for hyperpigmentation — uses existing heatmap infrastructure.
