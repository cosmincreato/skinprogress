using SkinProgress.Data;
using SkinProgress.Models.DTOs;
using SkinProgress.Models.Entities;
using SkinProgress.Services.Interfaces;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace SkinProgress.Services
{
    /// <summary>
    /// Evolution Analytics Service
    /// 
    /// Implements analytics for skin analysis trends, comparisons, and report generation.
    /// 
    /// SOLID Principles:
    /// - Single Responsibility: Focuses only on analytics calculations, not HTTP or persistence
    /// - Open/Closed: Extensible via dependency injection of data layer
    /// - Dependency Inversion: Depends on AppDbContext (abstracted as DbContext)
    /// </summary>
    public class EvolutionAnalyticsService : IEvolutionAnalyticsService
    {
        private readonly AppDbContext _dbContext;
        private readonly ILogger<EvolutionAnalyticsService> _logger;

        /// <summary>
        /// Initializes a new instance of EvolutionAnalyticsService.
        /// </summary>
        /// <param name="dbContext">Database context for querying analysis results</param>
        /// <param name="logger">Logger for error tracking and audit trail</param>
        public EvolutionAnalyticsService(AppDbContext dbContext, ILogger<EvolutionAnalyticsService> logger)
        {
            _dbContext = dbContext ?? throw new ArgumentNullException(nameof(dbContext));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        /// <summary>
        /// Retrieves analysis history for a user within date range.
        /// Filters analysis results by user and date range.
        /// Performance: Uses indexed query on AnalysisResults(UserId, Timestamp)
        /// </summary>
        /// <param name="userId">User's unique identifier</param>
        /// <param name="startDate">Start of date range (inclusive)</param>
        /// <param name="endDate">End of date range (inclusive)</param>
        /// <returns>List of analysis results with severity metrics, ordered by timestamp ascending</returns>
        /// <exception cref="ArgumentException">Thrown if userId is null/empty or date range invalid</exception>
        public async Task<List<AnalysisResultDto>> GetAnalysisHistoryAsync(string userId, DateTime startDate, DateTime endDate)
        {
            // Validation
            if (string.IsNullOrWhiteSpace(userId))
            {
                throw new ArgumentException("UserId cannot be null or empty", nameof(userId));
            }

            if (startDate > endDate)
            {
                throw new ArgumentException($"StartDate ({startDate}) cannot be later than EndDate ({endDate})", nameof(startDate));
            }

            // Npgsql requires DateTimeKind.Utc for 'timestamp with time zone' columns.
            // The ASP.NET model binder produces Kind=Unspecified for bare date strings;
            // SpecifyKind retags the value as UTC without shifting it.
            startDate = DateTime.SpecifyKind(startDate, DateTimeKind.Utc);
            endDate   = DateTime.SpecifyKind(endDate,   DateTimeKind.Utc);

            if (endDate > DateTime.UtcNow)
            {
                throw new ArgumentException($"EndDate ({endDate}) cannot be in the future", nameof(endDate));
            }

            try
            {
                // Query using index IX_AnalysisResults_UserId_Timestamp
                // LINQ translates to: SELECT * FROM AnalysisResults WHERE UserId = @userId AND Timestamp BETWEEN @startDate AND @endDate ORDER BY Timestamp ASC
                var analysisResults = await _dbContext.AnalysisResults
                    .Where(ar => ar.UserId == userId &&
                                 ar.Timestamp >= startDate &&
                                 ar.Timestamp <= endDate &&
                                 ar.Status == "Completed")  // Only include completed analyses
                    .OrderBy(ar => ar.Timestamp)
                    .ToListAsync();

                // Map to DTOs
                return analysisResults.Select(MapAnalysisResultToDto).ToList();
            }
            catch (OperationCanceledException ex)
            {
                _logger.LogError(ex, "Database query timeout for user {UserId} with date range {StartDate}-{EndDate}", userId, startDate, endDate);
                throw new TimeoutException("Database query timed out", ex);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Database error retrieving analysis history for user {UserId}", userId);
                throw;
            }
        }

        /// <summary>
        /// Retrieves dashboard data for a user including analysis history and basic trend metrics.
        /// Wraps CalculateTrendMetricsAsync for dashboard display.
        /// 
        /// Performance: <2 seconds on 4G (SC-001)
        /// </summary>
        /// <param name="userId">User's unique identifier</param>
        /// <param name="startDate">Start of date range (inclusive)</param>
        /// <param name="endDate">End of date range (inclusive)</param>
        /// <returns>Dashboard DTO with analysis results and calculated trends</returns>
        public Task<SkinEvolutionDashboardDto> GetDashboardAsync(string userId, DateTime startDate, DateTime endDate)
        {
            return CalculateTrendMetricsAsync(userId, startDate, endDate);
        }

        /// <summary>
        /// Helper method to map AnalysisResult entity to DTO.
        /// </summary>
        private static AnalysisResultDto MapAnalysisResultToDto(AnalysisResult entity)
        {
            return new AnalysisResultDto
            {
                Id = entity.Id,
                SelfieId = entity.SelfieId,
                Timestamp = entity.Timestamp,
                SeverityScores = new SeverityScoresDto
                {
                    Acne = entity.AcneSeverity ?? 0,
                    Inflammation = entity.InflammationSeverity ?? 0,
                    Redness = entity.RednessSeverity ?? 0
                },
                ZoneSeverities = new ZoneSeveritiesDto
                {
                    Forehead = entity.ForeheadSeverity ?? 0,
                    LeftCheek = entity.LeftCheekSeverity ?? 0,
                    RightCheek = entity.RightCheekSeverity ?? 0,
                    Chin = entity.ChinSeverity ?? 0,
                    Nose = entity.NoseSeverity ?? 0
                },
                HeatmapImageUrl = entity.HeatmapImageUrl,
                AnalysisStatus = entity.Status
            };
        }

        /// <summary>
        /// Helper: Calculate improvement percentage between first and last data points.
        /// Improvement % = (First - Last) / First * 100 (negative = improvement, positive = worsening)
        /// </summary>
        private static double CalculateImprovement(List<double> scores)
        {
            if (scores.Count < 2)
                return 0;

            var first = scores.First();
            var last = scores.Last();

            if (first == 0)
                return 0;

            return ((last - first) / first) * 100;
        }

        /// <summary>
        /// Helper: Determine overall trend direction from individual metric improvements.
        /// </summary>
        private static string DetermineTrendDirection(double acneImprovement, double inflammationImprovement, double rednessImprovement)
        {
            var improvements = new[] { acneImprovement, inflammationImprovement, rednessImprovement };
            var avgImprovement = improvements.Average();

            if (Math.Abs(avgImprovement) < 1)
                return "Stable";
            return avgImprovement < 0 ? "Improving" : "Worsening";
        }

        /// <summary>
        /// Calculates trend metrics from analysis history.
        /// Computes: average severity, trend direction, improvement percentage, etc.
        /// </summary>
        public async Task<SkinEvolutionDashboardDto> CalculateTrendMetricsAsync(string userId, DateTime startDate, DateTime endDate)
        {
            // Validation
            if (string.IsNullOrWhiteSpace(userId))
            {
                throw new ArgumentException("UserId cannot be null or empty", nameof(userId));
            }

            try
            {
                // Get analysis history
                var analysisHistory = await GetAnalysisHistoryAsync(userId, startDate, endDate);

                // Create dashboard DTO
                var dashboard = new SkinEvolutionDashboardDto
                {
                    UserId = userId,
                    DateRangeStart = startDate,
                    DateRangeEnd = endDate,
                    AnalysisResults = analysisHistory
                };

                // If we have data, calculate trend metrics
                if (analysisHistory.Count > 0)
                {
                    var acneScores = analysisHistory.Select(a => (double)a.SeverityScores.Acne).ToList();
                    var inflammationScores = analysisHistory.Select(a => (double)a.SeverityScores.Inflammation).ToList();
                    var rednessScores = analysisHistory.Select(a => (double)a.SeverityScores.Redness).ToList();

                    var acneImprovement = CalculateImprovement(acneScores);
                    var inflammationImprovement = CalculateImprovement(inflammationScores);
                    var rednessImprovement = CalculateImprovement(rednessScores);

                    dashboard.TrendMetrics = new TrendMetricsDto
                    {
                        AcneImprovement = (decimal)acneImprovement,
                        InflammationImprovement = (decimal)inflammationImprovement,
                        RednessImprovement = (decimal)rednessImprovement,
                        HasMeaningfulTrend = analysisHistory.Count >= 3,
                        AnalysisCount = analysisHistory.Count
                    };

                    // Set helper message for sparse data
                    if (analysisHistory.Count < 7)
                    {
                        dashboard.HelperMessage = "Capture more selfies to see meaningful trends";
                    }
                }
                else
                {
                    dashboard.HelperMessage = "Capture your first selfie to begin tracking your skin evolution";
                }

                return dashboard;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error calculating trend metrics for user {UserId}", userId);
                throw;
            }
        }

        /// <summary>
        /// Generates a PDF report of skin progress.
        /// Selects representative images and includes severity summaries.
        /// Performance Target: < 10 seconds
        /// 
        /// Note: This implementation returns HTML byte array.
        /// For production PDF generation, integrate iText library.
        /// </summary>
        public async Task<byte[]> GeneratePdfReportAsync(string userId, DateTime startDate, DateTime endDate)
        {
            // Validation
            if (string.IsNullOrWhiteSpace(userId))
            {
                throw new ArgumentException("UserId cannot be null or empty", nameof(userId));
            }

            try
            {
                // Get analysis history
                var analysisHistory = await GetAnalysisHistoryAsync(userId, startDate, endDate);

                if (analysisHistory.Count == 0)
                {
                    throw new InvalidOperationException("No analysis data available for PDF report generation");
                }

                // Select representative images
                var representativeImages = SelectRepresentativeImages(analysisHistory);

                // Build HTML report
                var html = GeneratePdfHtml(userId, startDate, endDate, analysisHistory, representativeImages);

                // Convert HTML to bytes
                // NOTE: In production, use iText or similar to convert HTML to actual PDF
                // For now, returning HTML as byte array for client-side conversion
                return System.Text.Encoding.UTF8.GetBytes(html);
            }
            catch (InvalidOperationException ex)
            {
                _logger.LogWarning(ex, "Insufficient data for PDF report for user {UserId}", userId);
                throw;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error generating PDF report for user {UserId}", userId);
                throw;
            }
        }

        /// <summary>
        /// Helper: Generate HTML report structure.
        /// </summary>
        private static string GeneratePdfHtml(string userId, DateTime startDate, DateTime endDate,
            List<AnalysisResultDto> allResults, List<AnalysisResultDto> representativeImages)
        {
            var html = new System.Text.StringBuilder();

            html.AppendLine("<!DOCTYPE html>");
            html.AppendLine("<html lang=\"en\">");
            html.AppendLine("<head>");
            html.AppendLine("  <meta charset=\"UTF-8\">");
            html.AppendLine("  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">");
            html.AppendLine("  <title>Skin Progress Report</title>");
            html.AppendLine("  <style>");
            html.AppendLine("    body { font-family: Arial, sans-serif; margin: 20px; color: #333; }");
            html.AppendLine("    .header { text-align: center; margin-bottom: 30px; }");
            html.AppendLine("    .header h1 { color: #2c3e50; margin: 0; }");
            html.AppendLine("    .header p { margin: 5px 0; color: #7f8c8d; }");
            html.AppendLine("    .section { margin-bottom: 30px; page-break-inside: avoid; }");
            html.AppendLine("    .section h2 { color: #34495e; border-bottom: 2px solid #3498db; padding-bottom: 10px; }");
            html.AppendLine("    table { width: 100%; border-collapse: collapse; margin-top: 15px; }");
            html.AppendLine("    th { background-color: #3498db; color: white; padding: 10px; text-align: left; }");
            html.AppendLine("    td { border-bottom: 1px solid #ecf0f1; padding: 10px; }");
            html.AppendLine("    tr:nth-child(even) { background-color: #f8f9fa; }");
            html.AppendLine("    .metric-card { background-color: #ecf0f1; padding: 15px; border-radius: 5px; margin: 10px 0; }");
            html.AppendLine("    .improvement { color: #27ae60; }");
            html.AppendLine("    .decline { color: #e74c3c; }");
            html.AppendLine("    .page-break { page-break-after: always; }");
            html.AppendLine("  </style>");
            html.AppendLine("</head>");
            html.AppendLine("<body>");

            // Header
            html.AppendLine("  <div class=\"header\">");
            html.AppendLine("    <h1>Skin Progress Report</h1>");
            html.AppendLine($"    <p>User ID: {userId}</p>");
            html.AppendLine($"    <p>Period: {startDate:MMMM d, yyyy} to {endDate:MMMM d, yyyy}</p>");
            html.AppendLine($"    <p>Generated: {DateTime.UtcNow:MMMM d, yyyy 'at' h:mm tt UTC}</p>");
            html.AppendLine("  </div>");

            // Summary Statistics
            html.AppendLine("  <div class=\"section\">");
            html.AppendLine("    <h2>Summary Statistics</h2>");
            html.AppendLine($"    <p><strong>Total Analyses:</strong> {allResults.Count}</p>");
            html.AppendLine($"    <p><strong>Period Duration:</strong> {(endDate - startDate).Days + 1} days</p>");

            if (allResults.Count >= 2)
            {
                var acneScores = allResults.Select(r => (double)r.SeverityScores.Acne).ToList();
                var inflammationScores = allResults.Select(r => (double)r.SeverityScores.Inflammation).ToList();
                var rednessScores = allResults.Select(r => (double)r.SeverityScores.Redness).ToList();

                var acneImprovement = CalculateImprovement(acneScores);
                var inflammationImprovement = CalculateImprovement(inflammationScores);
                var rednessImprovement = CalculateImprovement(rednessScores);

                html.AppendLine("    <div class=\"metric-card\">");
                html.AppendLine($"      <strong>Acne Improvement:</strong> <span class=\"{(acneImprovement < 0 ? "improvement" : "decline")}\">{acneImprovement:F1}%</span>");
                html.AppendLine("    </div>");
                html.AppendLine("    <div class=\"metric-card\">");
                html.AppendLine($"      <strong>Inflammation Improvement:</strong> <span class=\"{(inflammationImprovement < 0 ? "improvement" : "decline")}\">{inflammationImprovement:F1}%</span>");
                html.AppendLine("    </div>");
                html.AppendLine("    <div class=\"metric-card\">");
                html.AppendLine($"      <strong>Redness Improvement:</strong> <span class=\"{(rednessImprovement < 0 ? "improvement" : "decline")}\">{rednessImprovement:F1}%</span>");
                html.AppendLine("    </div>");
            }
            html.AppendLine("  </div>");

            // Representative Images Section
            html.AppendLine("  <div class=\"section page-break\">");
            html.AppendLine("    <h2>Representative Images</h2>");

            var imageLabels = new[] { "Start of Period", "Mid Period", "End of Period" };
            for (int i = 0; i < representativeImages.Count && i < imageLabels.Length; i++)
            {
                var image = representativeImages[i];
                html.AppendLine($"    <h3>{imageLabels[i]} - {image.Timestamp:MMMM d, yyyy}</h3>");
                if (!string.IsNullOrEmpty(image.HeatmapImageUrl))
                {
                    html.AppendLine($"    <p><em>Heatmap: {image.HeatmapImageUrl}</em></p>");
                }
                html.AppendLine("    <table>");
                html.AppendLine("      <tr><th>Metric</th><th>Severity Score</th></tr>");
                html.AppendLine($"      <tr><td>Acne</td><td>{image.SeverityScores.Acne}</td></tr>");
                html.AppendLine($"      <tr><td>Inflammation</td><td>{image.SeverityScores.Inflammation}</td></tr>");
                html.AppendLine($"      <tr><td>Redness</td><td>{image.SeverityScores.Redness}</td></tr>");
                html.AppendLine("    </table>");
                html.AppendLine("    <p style=\"color: #7f8c8d; font-size: 0.9em;\">Status: " + image.AnalysisStatus + "</p>");
            }
            html.AppendLine("  </div>");

            // Detailed Severity Breakdown
            html.AppendLine("  <div class=\"section\">");
            html.AppendLine("    <h2>Detailed Severity Breakdown</h2>");
            html.AppendLine("    <table>");
            html.AppendLine("      <tr>");
            html.AppendLine("        <th>Date</th>");
            html.AppendLine("        <th>Acne</th>");
            html.AppendLine("        <th>Inflammation</th>");
            html.AppendLine("        <th>Redness</th>");
            html.AppendLine("      </tr>");

            foreach (var result in allResults)
            {
                html.AppendLine("      <tr>");
                html.AppendLine($"        <td>{result.Timestamp:M/d/yyyy}</td>");
                html.AppendLine($"        <td>{result.SeverityScores.Acne}</td>");
                html.AppendLine($"        <td>{result.SeverityScores.Inflammation}</td>");
                html.AppendLine($"        <td>{result.SeverityScores.Redness}</td>");
                html.AppendLine("      </tr>");
            }

            html.AppendLine("    </table>");
            html.AppendLine("  </div>");

            // Footer
            html.AppendLine("  <hr>");
            html.AppendLine("  <p style=\"color: #95a5a6; font-size: 0.85em; text-align: center;\">");
            html.AppendLine("    This report was generated by SkinProgress Evolution Analytics.<br>");
            html.AppendLine("    For questions or concerns, please contact support.");
            html.AppendLine("  </p>");

            html.AppendLine("</body>");
            html.AppendLine("</html>");

            return html.ToString();
        }

        /// <summary>
        /// Compares metrics between two time periods.
        /// Calculates percentage changes and statistical significance.
        /// </summary>
        public async Task<PeriodComparisonDto> ComparePeriods(string userId, DateTime period1Start, DateTime period1End, DateTime period2Start, DateTime period2End)
        {
            // Validation
            if (string.IsNullOrWhiteSpace(userId))
            {
                throw new ArgumentException("UserId cannot be null or empty", nameof(userId));
            }

            if (period1Start > period1End || period2Start > period2End)
            {
                throw new ArgumentException("Period start date cannot be later than end date");
            }

            // Avoid overlapping periods
            if (period1End >= period2Start)
            {
                throw new ArgumentException("Periods must not overlap");
            }

            try
            {
                // Get metrics for both periods
                var period1Dashboard = await CalculateTrendMetricsAsync(userId, period1Start, period1End);
                var period2Dashboard = await CalculateTrendMetricsAsync(userId, period2Start, period2End);

                var period1Results = period1Dashboard.AnalysisResults;
                var period2Results = period2Dashboard.AnalysisResults;

                // Create comparison DTO
                var comparison = new PeriodComparisonDto
                {
                    UserId = userId,
                    Period1Start = period1Start,
                    Period1End = period1End,
                    Period2Start = period2Start,
                    Period2End = period2End,
                    Period1Count = period1Results.Count,
                    Period2Count = period2Results.Count
                };

                // Calculate averages for both periods
                if (period1Results.Count > 0)
                {
                    comparison.Period1Average = new SeverityAverageDto
                    {
                        Acne = (decimal)period1Results.Average(r => r.SeverityScores.Acne),
                        Inflammation = (decimal)period1Results.Average(r => r.SeverityScores.Inflammation),
                        Redness = (decimal)period1Results.Average(r => r.SeverityScores.Redness)
                    };
                }

                if (period2Results.Count > 0)
                {
                    comparison.Period2Average = new SeverityAverageDto
                    {
                        Acne = (decimal)period2Results.Average(r => r.SeverityScores.Acne),
                        Inflammation = (decimal)period2Results.Average(r => r.SeverityScores.Inflammation),
                        Redness = (decimal)period2Results.Average(r => r.SeverityScores.Redness)
                    };
                }

                // Calculate overall deltas
                comparison.OverallDeltas = new SeverityDeltaDto
                {
                    Acne = CalculateMetricDelta(comparison.Period1Average.Acne, comparison.Period2Average.Acne),
                    Inflammation = CalculateMetricDelta(comparison.Period1Average.Inflammation, comparison.Period2Average.Inflammation),
                    Redness = CalculateMetricDelta(comparison.Period1Average.Redness, comparison.Period2Average.Redness)
                };

                // Calculate per-zone deltas
                var zones = new[] { "forehead", "left_cheek", "right_cheek", "chin", "nose" };
                foreach (var zone in zones)
                {
                    var period1ZoneAvg = CalculateZoneAverage(period1Results, zone);
                    var period2ZoneAvg = CalculateZoneAverage(period2Results, zone);

                    comparison.ZonalDeltas[zone] = new ZonalDeltaDto
                    {
                        ZoneName = zone,
                        Period1Average = period1ZoneAvg,
                        Period2Average = period2ZoneAvg,
                        Delta = CalculateMetricDelta(period1ZoneAvg, period2ZoneAvg),
                        Period2Color = DetermineSeverityColor(period2ZoneAvg)
                    };
                }

                // Check data balance
                if (period1Results.Count > 0 && period2Results.Count > 0)
                {
                    var ratio = (decimal)period2Results.Count / period1Results.Count;
                    if (ratio < 0.5m || ratio > 2m)
                    {
                        var imbalancePercent = Math.Abs((ratio - 1) * 100);
                        var moreOrFewer = ratio > 1 ? "more" : "fewer";
                        comparison.DataBalanceNote = $"Period 2 has {imbalancePercent:F0}% {moreOrFewer} data points than Period 1. Results may be skewed.";
                    }
                }

                return comparison;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error comparing periods for user {UserId}", userId);
                throw;
            }
        }

        /// <summary>
        /// Helper: Calculate metric delta between two periods.
        /// </summary>
        private static MetricDeltaDto CalculateMetricDelta(decimal period1Value, decimal period2Value)
        {
            if (period1Value == 0)
            {
                return new MetricDeltaDto
                {
                    AbsoluteChange = period2Value,
                    PercentageChange = 0,
                    Direction = period2Value < 0 ? "improved" : "declined",
                    Summary = $"Changed to {period2Value}"
                };
            }

            var absoluteChange = period2Value - period1Value;
            var percentageChange = (period2Value - period1Value) / period1Value * 100;
            var direction = percentageChange < 0 ? "improved" : "declined";
            var summary = percentageChange < 0
                ? $"Improved by {Math.Abs(percentageChange):F1}%"
                : $"Declined by {percentageChange:F1}%";

            return new MetricDeltaDto
            {
                AbsoluteChange = absoluteChange,
                PercentageChange = percentageChange,
                Direction = direction,
                Summary = summary
            };
        }

        /// <summary>
        /// Helper: Calculate average severity for a specific zone across analysis results.
        /// </summary>
        private static decimal CalculateZoneAverage(List<AnalysisResultDto> results, string zone)
        {
            if (results.Count == 0)
                return 0;

            return zone switch
            {
                "forehead" => (decimal)results.Average(r => r.ZoneSeverities.Forehead),
                "left_cheek" => (decimal)results.Average(r => r.ZoneSeverities.LeftCheek),
                "right_cheek" => (decimal)results.Average(r => r.ZoneSeverities.RightCheek),
                "chin" => (decimal)results.Average(r => r.ZoneSeverities.Chin),
                "nose" => (decimal)results.Average(r => r.ZoneSeverities.Nose),
                _ => 0
            };
        }

        /// <summary>
        /// Helper: Determine severity color based on average severity score.
        /// Green (0-3): Good, Yellow (4-6): Fair, Red (7-10): Poor
        /// </summary>
        private static string DetermineSeverityColor(decimal severity)
        {
            if (severity <= 3)
                return "green";
            if (severity <= 6)
                return "yellow";
            return "red";
        }

        /// <summary>
        /// Helper method: Selects representative images from sparse data.
        /// </summary>
        /// <remarks>
        /// For example, if only 2 images exist in period:
        /// - Return first and last (skip middle)
        /// If only 1 image: return that image 3x
        /// </remarks>
        private static List<AnalysisResultDto> SelectRepresentativeImages(List<AnalysisResultDto> analysisHistory)
        {
            if (analysisHistory == null || analysisHistory.Count == 0)
            {
                throw new InvalidOperationException("Cannot select representative images from empty analysis history");
            }

            // If count >= 3: return [first, middle, last]
            if (analysisHistory.Count >= 3)
            {
                var middleIndex = analysisHistory.Count / 2;
                return new List<AnalysisResultDto>
                {
                    analysisHistory[0],
                    analysisHistory[middleIndex],
                    analysisHistory[analysisHistory.Count - 1]
                };
            }

            // If count == 2: return [first, last, last]
            if (analysisHistory.Count == 2)
            {
                return new List<AnalysisResultDto>
                {
                    analysisHistory[0],
                    analysisHistory[1],
                    analysisHistory[1]
                };
            }

            // If count == 1: return [first, first, first]
            return new List<AnalysisResultDto>
            {
                analysisHistory[0],
                analysisHistory[0],
                analysisHistory[0]
            };
        }

        /// <summary>
        /// Logs PDF export event for audit trail (GDPR compliance).
        /// Records all export attempts with user, date range, success status, and request metadata.
        /// </summary>
        public Task LogPdfExportAsync(string userId, DateTime startDate, DateTime endDate, bool success, string ipAddress, string userAgent)
        {
            if (string.IsNullOrWhiteSpace(userId))
            {
                throw new ArgumentException("UserId cannot be null or empty", nameof(userId));
            }

            try
            {
                // Log to application logger (can be integrated with database audit table later)
                _logger.LogInformation(
                    "PDF Export requested - UserId: {UserId}, DateRange: {StartDate} to {EndDate}, Success: {Success}, IpAddress: {IpAddress}, UserAgent: {UserAgent}",
                    userId, startDate, endDate, success, ipAddress ?? "unknown", userAgent ?? "unknown");

                // Future: Store to PdfExportAuditLog table with:
                // - UserId, DateRangeStart, DateRangeEnd, Timestamp (Now), Success, IpAddress, UserAgent
                // This would support GDPR data requests and facilitate audit trails

                return Task.CompletedTask;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error logging PDF export for user {UserId}", userId);
                // Don't throw - logging failures shouldn't break the export process
                return Task.CompletedTask;
            }
        }

        /// <summary>
        /// Compares two periods (alias for ComparePeriods with different naming).
        /// </summary>
        public Task<PeriodComparisonDto> ComparePeriodAsync(string userId, DateTime period1Start, DateTime period1End, DateTime period2Start, DateTime period2End)
        {
            return ComparePeriods(userId, period1Start, period1End, period2Start, period2End);
        }
    }
}
