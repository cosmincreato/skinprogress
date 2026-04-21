using System;
using System.Collections.Generic;

namespace SkinProgress.Models.DTOs
{
    /// <summary>
    /// Data Transfer Object for individual analysis result.
    /// 
    /// Single Responsibility Principle: Represents analysis data from one selfie analysis only.
    /// Contains severity scores and heatmap reference for dashboard visualization.
    /// 
    /// Mapped from: AnalysisResult entity in database
    /// Used by: GET /api/evolution/dashboard, POST /api/evolution/compare endpoints
    /// </summary>
    public class AnalysisResultDto
    {
        /// <summary>Unique identifier for this analysis result</summary>
        public Guid Id { get; set; }

        /// <summary>Associated selfie ID</summary>
        public Guid SelfieId { get; set; }

        /// <summary>Timestamp when analysis was performed (user's local timezone)</summary>
        public DateTime Timestamp { get; set; }

        /// <summary>
        /// Overall severity scores (0-10 scale) from CLIP analysis.
        /// Applied to all severity metrics consistently (acne, inflammation, redness).
        /// Three-tier color mapping: Green 0–3 (healthy), Yellow 4–6 (monitoring), Red 7–10 (active issues)
        /// </summary>
        public SeverityScoresDto? SeverityScores { get; set; }

        /// <summary>
        /// Per-zone severity scores (0-10 scale) from CLIP analysis.
        /// Used for heatmap display and zone-level delta calculation in comparisons.
        /// </summary>
        public ZoneSeveritiesDto? ZoneSeverities { get; set; }

        /// <summary>Path to heatmap image (PNG) showing severity visualization</summary>
        public string? HeatmapImageUrl { get; set; }

        /// <summary>Status of analysis (Completed, Failed, Pending)</summary>
        public string? AnalysisStatus { get; set; }
    }

    /// <summary>
    /// Severity scores for three main categories.
    /// Single Responsibility: Encapsulates only severity metrics, not zone data.
    /// </summary>
    public class SeverityScoresDto
    {
        /// <summary>Acne severity (0-10 scale)</summary>
        public int Acne { get; set; }

        /// <summary>Inflammation severity (0-10 scale)</summary>
        public int Inflammation { get; set; }

        /// <summary>Redness severity (0-10 scale)</summary>
        public int Redness { get; set; }
    }

    /// <summary>
    /// Severity scores broken down by facial zone.
    /// Single Responsibility: Represents zone-specific metrics only.
    /// Used for: Heatmap display, zone-level delta calculation in period comparison (FR-007).
    /// </summary>
    public class ZoneSeveritiesDto
    {
        /// <summary>Forehead severity (0-10 scale)</summary>
        public int Forehead { get; set; }

        /// <summary>Left cheek severity (0-10 scale)</summary>
        public int LeftCheek { get; set; }

        /// <summary>Right cheek severity (0-10 scale)</summary>
        public int RightCheek { get; set; }

        /// <summary>Chin severity (0-10 scale)</summary>
        public int Chin { get; set; }

        /// <summary>Nose severity (0-10 scale)</summary>
        public int Nose { get; set; }
    }
}
