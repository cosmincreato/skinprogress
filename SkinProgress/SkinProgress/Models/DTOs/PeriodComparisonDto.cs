using System;
using System.Collections.Generic;

namespace SkinProgress.Models.DTOs
{
    /// <summary>
    /// Period Comparison DTO - Compares severity metrics between two time periods.
    /// 
    /// Single Responsibility Principle: Encapsulates comparison data only.
    /// Contains before/after severity averages and calculated deltas.
    /// 
    /// Used by: POST /api/evolution/compare endpoint (FR-006, US3)
    /// Delta Calculation: Average-to-average percentage change (FR-007)
    /// Example: Period 1 avg acne = 7.0, Period 2 avg acne = 5.0 → delta = -29% improvement
    /// </summary>
    public class PeriodComparisonDto
    {
        /// <summary>User ID for data isolation (security principal - FR-010)</summary>
        public string? UserId { get; set; }

        /// <summary>First period start date (user's local timezone)</summary>
        public DateTime Period1Start { get; set; }

        /// <summary>First period end date (user's local timezone)</summary>
        public DateTime Period1End { get; set; }

        /// <summary>Second period start date (user's local timezone)</summary>
        public DateTime Period2Start { get; set; }

        /// <summary>Second period end date (user's local timezone)</summary>
        public DateTime Period2End { get; set; }

        /// <summary>Average severity scores for first period</summary>
        public SeverityAverageDto Period1Average { get; set; } = new SeverityAverageDto();

        /// <summary>Average severity scores for second period</summary>
        public SeverityAverageDto Period2Average { get; set; } = new SeverityAverageDto();

        /// <summary>Overall severity deltas (percentage change from Period 1 to Period 2)</summary>
        public SeverityDeltaDto OverallDeltas { get; set; } = new SeverityDeltaDto();

        /// <summary>Per-zone severity deltas showing improvement/decline by facial area</summary>
        /// <remarks>
        /// Keys: "forehead", "left_cheek", "right_cheek", "chin", "nose"
        /// Each zone includes average for both periods and calculated delta (FR-007)
        /// </remarks>
        public Dictionary<string, ZonalDeltaDto> ZonalDeltas { get; set; } = new Dictionary<string, ZonalDeltaDto>();

        /// <summary>
        /// Data quality note if one period has significantly more data than the other.
        /// Shown to user: "Period 2 has X% more data points than Period 1. Results may be skewed."
        /// </summary>
        public string? DataBalanceNote { get; set; }

        /// <summary>Number of analysis results in Period 1</summary>
        public int Period1Count { get; set; }

        /// <summary>Number of analysis results in Period 2</summary>
        public int Period2Count { get; set; }
    }

    /// <summary>
    /// Average severity scores for a period.
    /// Single Responsibility: Encapsulates average metrics only, not deltas.
    /// </summary>
    public class SeverityAverageDto
    {
        /// <summary>Average acne severity for period (0-10 scale)</summary>
        public decimal Acne { get; set; }

        /// <summary>Average inflammation severity for period (0-10 scale)</summary>
        public decimal Inflammation { get; set; }

        /// <summary>Average redness severity for period (0-10 scale)</summary>
        public decimal Redness { get; set; }
    }

    /// <summary>
    /// Severity delta (change) between two periods.
    /// Single Responsibility: Encapsulates delta calculations only.
    /// 
    /// Delta Formula (FR-007): (period2_avg - period1_avg) / period1_avg * 100
    /// Positive = worsening condition, Negative = improvement
    /// </summary>
    public class SeverityDeltaDto
    {
        /// <summary>
        /// Acne delta breakdown
        /// AbsoluteChange: Numeric change (e.g., 7.0 → 5.0 = -2.0)
        /// PercentageChange: Percentage change (e.g., 7.0 → 5.0 = -28.6%)
        /// Direction: "improved" or "declined" for display
        /// </summary>
        public MetricDeltaDto Acne { get; set; } = new MetricDeltaDto();

        /// <summary>Inflammation delta (same structure as acne)</summary>
        public MetricDeltaDto Inflammation { get; set; } = new MetricDeltaDto();

        /// <summary>Redness delta (same structure as acne)</summary>
        public MetricDeltaDto Redness { get; set; } = new MetricDeltaDto();
    }

    /// <summary>
    /// Individual metric delta with absolute and percentage change.
    /// Single Responsibility: Encapsulates one metric's delta only.
    /// Used for consistency across all severity types and zones.
    /// </summary>
    public class MetricDeltaDto
    {
        /// <summary>Absolute numeric change (e.g., 7.0 → 5.0 = -2.0)</summary>
        public decimal AbsoluteChange { get; set; }

        /// <summary>Percentage change using formula: (new - old) / old * 100</summary>
        public decimal PercentageChange { get; set; }

        /// <summary>"improved" if negative (better), "declined" if positive (worse)</summary>
        public string? Direction { get; set; }

        /// <summary>User-friendly summary (e.g., "Improved by 28.6%")</summary>
        public string? Summary { get; set; }
    }

    /// <summary>
    /// Per-zone severity comparison.
    /// Single Responsibility: Encapsulates one zone's metrics only.
    /// Used by: PeriodComparisonDto.ZonalDeltas dictionary
    /// </summary>
    public class ZonalDeltaDto
    {
        /// <summary>Zone name (forehead, left_cheek, right_cheek, chin, nose)</summary>
        public string? ZoneName { get; set; }

        /// <summary>Average severity for this zone in Period 1</summary>
        public decimal Period1Average { get; set; }

        /// <summary>Average severity for this zone in Period 2</summary>
        public decimal Period2Average { get; set; }

        /// <summary>Delta for this zone (same MetricDeltaDto structure)</summary>
        public MetricDeltaDto Delta { get; set; } = new MetricDeltaDto();

        /// <summary>Three-tier color: "green" (0–3), "yellow" (4–6), "red" (7–10) for Period 2 state</summary>
        /// <remarks>
        /// Helps visualize current severity state using color-coded mapping (FR-012)
        /// </remarks>
        public string? Period2Color { get; set; }
    }
}
