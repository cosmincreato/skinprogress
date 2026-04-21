using System;
using System.Collections.Generic;

namespace SkinProgress.Models.DTOs
{
    /// <summary>
    /// Skin Evolution Dashboard DTO - Aggregated view of trend analysis.
    /// 
    /// Single Responsibility Principle: Encapsulates dashboard data only.
    /// Contains analysis history, calculated trend metrics, and heatmap references.
    /// 
    /// Used by: GET /api/evolution/dashboard endpoint (FR-001, US1)
    /// Response Type: Returns trend graphs with severity trends over time
    /// Performance: Includes data optimized for <2s load time on 4G (SC-001)
    /// </summary>
    public class SkinEvolutionDashboardDto
    {
        /// <summary>User ID for data isolation (security principal - FR-010)</summary>
        public string? UserId { get; set; }

        /// <summary>Selected date range start (user's local timezone)</summary>
        public DateTime DateRangeStart { get; set; }

        /// <summary>Selected date range end (user's local timezone)</summary>
        public DateTime DateRangeEnd { get; set; }

        /// <summary>List of analysis results within date range, sorted by timestamp descending</summary>
        /// <remarks>
        /// For <7 selfies (sparse data): Shows all available data with helper message (FR-008)
        /// For ≥7 selfies: Defaults to 30-day view (Assumption)
        /// Empty state: Shows callout "Capture your first selfie to begin tracking" (Edge case)
        /// </remarks>
        public List<AnalysisResultDto> AnalysisResults { get; set; } = new List<AnalysisResultDto>();

        /// <summary>Calculated trend metrics showing progress over date range</summary>
        public TrendMetricsDto TrendMetrics { get; set; } = new TrendMetricsDto();

        /// <summary>Helper message for sparse data scenarios</summary>
        /// <remarks>
        /// Populated only for users with <7 analyzed selfies
        /// Message: "Capture more selfies to see meaningful trends"
        /// </remarks>
        public string? HelperMessage { get; set; }
    }

    /// <summary>
    /// Trend metrics for dashboard visualization.
    /// Single Responsibility Principle: Encapsulates calculated metrics only.
    /// 
    /// All percentages calculated as improvement: (latest_avg - oldest_avg) / oldest_avg * 100
    /// Positive = improvement, Negative = decline
    /// </summary>
    public class TrendMetricsDto
    {
        /// <summary>
        /// Acne severity improvement percentage over date range.
        /// Formula: (acne_avg_end - acne_avg_start) / acne_avg_start * 100
        /// Example: 7.0 → 5.0 = -29% (29% improvement)
        /// </summary>
        public decimal? AcneImprovement { get; set; }

        /// <summary>Inflammation severity improvement percentage (same formula as acne)</summary>
        public decimal? InflammationImprovement { get; set; }

        /// <summary>Redness severity improvement percentage (same formula as acne)</summary>
        public decimal? RednessImprovement { get; set; }

        /// <summary>
        /// Indicates data quality: true if enough data points for meaningful trend, false for sparse data.
        /// Threshold: >=3 selfies considered sufficient
        /// </summary>
        public bool HasMeaningfulTrend { get; set; }

        /// <summary>Total number of analysis results in date range</summary>
        public int AnalysisCount { get; set; }
    }
}
