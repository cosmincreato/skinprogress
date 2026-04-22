/**
 * Evolution Dashboard Types
 *
 * TypeScript interfaces matching C# DTOs from backend
 * Used by frontend components and API client
 *
 * Mapping:
 * - AnalysisResultDto ← AnalysisResult entity
 * - SkinEvolutionDashboardDto ← Dashboard calculation
 * - PeriodComparisonDto ← Period comparison calculation
 */

/**
 * Severity scores for three main categories
 * 0-10 scale from CLIP analysis
 *
 * Three-tier color mapping:
 * - Green: 0-3 (healthy)
 * - Yellow: 4-6 (monitoring)
 * - Red: 7-10 (active issues)
 */
export interface SeverityScoresDto {
  /** Acne severity (0-10 scale) */
  acne: number;
  /** Inflammation severity (0-10 scale) */
  inflammation: number;
  /** Redness severity (0-10 scale) */
  redness: number;
}

/**
 * Per-zone severity scores
 * Used for heatmap display and zone-level delta calculation
 */
export interface ZoneSeveritiesDto {
  /** Forehead severity (0-10 scale) */
  forehead: number;
  /** Left cheek severity (0-10 scale) */
  leftCheek: number;
  /** Right cheek severity (0-10 scale) */
  rightCheek: number;
  /** Chin severity (0-10 scale) */
  chin: number;
  /** Nose severity (0-10 scale) */
  nose: number;
}

/**
 * Individual analysis result from CLIP model
 * Represents one selfie's analysis with severity scores and heatmap
 *
 * Used by:
 * - TrendGraph component (rendering line chart)
 * - PeriodComparison component (delta calculations)
 * - PDF export (selecting representative images)
 */
export interface AnalysisResultDto {
  /** Unique identifier for this analysis */
  id: string;
  /** Associated selfie ID */
  selfieId: string;
  /** Timestamp when analysis was performed */
  timestamp: string;  // ISO 8601 datetime
  /** Overall severity scores (acne, inflammation, redness) */
  severityScores?: SeverityScoresDto;
  /** Per-zone severity scores for heatmap */
  zoneSeverities?: ZoneSeveritiesDto;
  /** URL to heatmap image (PNG) */
  heatmapImageUrl?: string;
  /** Status of analysis: "Completed", "Failed", "Pending" */
  analysisStatus?: string;
}

/**
 * Dashboard data for trend graphs
 * Contains analysis history and calculated trend metrics
 *
 * Used by:
 * - EvolutionDashboard.tsx (main container)
 * - TrendGraph.tsx (rendering graphs)
 * - DateRangeFilter.tsx (applying filters)
 *
 * Performance Target: <2s load on 4G (SC-001)
 */
export interface SkinEvolutionDashboardDto {
  /** User's unique identifier */
  userId?: string;
  /** Date range start (ISO format) */
  dateRangeStart?: string;
  /** Date range end (ISO format) */
  dateRangeEnd?: string;
  /** List of individual analysis results */
  analysisResults?: AnalysisResultDto[];
  /** Average severity across period (0-10 scale) */
  averageSeverity?: number;
  /** Improvement percentage from start to end of period */
  improvementPercent?: number;
  /** Trend direction: "improving", "stable", "worsening" */
  trend?: string;
  /** Peak (highest) severity in period */
  peakSeverity?: number;
  /** Best (lowest) severity in period */
  bestSeverity?: number;
  /** Acne metrics for period */
  acneAverage?: number;
  acneTrend?: string;
  acneImprovement?: number;
  /** Inflammation metrics for period */
  inflammationAverage?: number;
  inflammationTrend?: string;
  inflammationImprovement?: number;
  /** Redness metrics for period */
  rednessAverage?: number;
  rednessTrend?: string;
  rednessImprovement?: number;
  /** Helper message for sparse data (<7 selfies in period) */
  helperMessage?: string;
  /** Per-zone breakdown for heatmaps */
  zoneBreakdown?: Record<string, number>;
}

/**
 * Zone-level metric comparison in period comparison
 */
export interface ZoneMetricComparison {
  /** Zone name: "Forehead", "LeftCheek", "RightCheek", "Chin", "Nose" */
  zoneName?: string;
  /** Period 1 average severity for this zone */
  period1Average?: number;
  /** Period 2 average severity for this zone */
  period2Average?: number;
  /** Percentage delta: (avg2 - avg1) / avg1 * 100 */
  deltaPercent?: number;
  /** Improvement direction: "improved", "worsened", "stable" */
  direction?: string;
  /** Color for period 1: Green, Yellow, or Red */
  period1Color?: string;
  /** Color for period 2: Green, Yellow, or Red */
  period2Color?: string;
}

/**
 * Period comparison data
 * Shows improvement/worsening between two time ranges
 *
 * Used by:
 * - PeriodComparison.tsx (side-by-side heatmaps and metrics)
 * - Comparison tab in EvolutionDashboard.tsx
 *
 * Delta Formula:
 * (Period2_Value - Period1_Value) / Period1_Value * 100
 *
 * Significance Threshold: >5% change
 *
 * Performance Target: <2s load time
 */
export interface PeriodComparisonDto {
  /** User's unique identifier */
  userId?: string;
  /** Period 1 start date */
  period1Start?: string;
  /** Period 1 end date */
  period1End?: string;
  /** Period 2 start date */
  period2Start?: string;
  /** Period 2 end date */
  period2End?: string;
  /** Period 1 average severity */
  period1AverageSeverity?: number;
  /** Period 2 average severity */
  period2AverageSeverity?: number;
  /** Overall severity delta percentage */
  averageSeverityDelta?: number;
  /** Overall improvement percentage */
  improvementPercent?: number;
  /** Per-acne metric comparison */
  acnePeriod1?: number;
  acnePeriod2?: number;
  acneDelta?: number;
  /** Per-inflammation metric comparison */
  inflammationPeriod1?: number;
  inflammationPeriod2?: number;
  inflammationDelta?: number;
  /** Per-redness metric comparison */
  rednessPeriod1?: number;
  rednessPeriod2?: number;
  rednessDelta?: number;
  /** Zone-level comparisons */
  zoneComparisons?: ZoneMetricComparison[];
  /** Direction of change: "improved", "worsened", "stable" */
  direction?: string;
  /** Overall summary message */
  summary?: string;
  /** Note if data counts are imbalanced (<3 analyses in one period) */
  dataBalanceNote?: string;
  /** Count of analyses in period 1 (for sparse data detection) */
  period1Count?: number;
  /** Count of analyses in period 2 */
  period2Count?: number;
}

/**
 * Combined trend data for graph rendering
 * Derived from AnalysisResultDto for Recharts compatibility
 */
export interface TrendDataPoint {
  /** ISO date string for x-axis */
  date: string;
  /** Overall severity for this date */
  overallSeverity: number;
  /** Acne severity */
  acne: number;
  /** Inflammation severity */
  inflammation: number;
  /** Redness severity */
  redness: number;
  /** Per-zone averages */
  forehead?: number;
  leftCheek?: number;
  rightCheek?: number;
  chin?: number;
  nose?: number;
  [key: string]: any;  // Allows chart library to add additional properties
}
