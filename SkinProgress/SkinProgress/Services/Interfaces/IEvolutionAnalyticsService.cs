namespace SkinProgress.Services.Interfaces;

using SkinProgress.Models.DTOs;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

/// <summary>
/// Interface for Evolution Analytics Service
/// 
/// Provides methods for:
/// - Retrieving analysis history (trend graphs)
/// - Calculating trend metrics and comparisons
/// - Generating PDF reports
/// - Period-to-period analysis
/// 
/// SOLID Principles:
/// - Abstraction: Defines contract without implementation
/// - Dependency Inversion: Controllers depend on interface, not concrete class
/// </summary>
public interface IEvolutionAnalyticsService
{
    /// <summary>
    /// Retrieves analysis history for a user within a date range.
    /// Used for trend graphs (User Story 1).
    /// </summary>
    /// <param name="userId">User's unique identifier</param>
    /// <param name="startDate">Start of date range (inclusive)</param>
    /// <param name="endDate">End of date range (inclusive)</param>
    /// <returns>List of analysis results with severity metrics</returns>
    /// <exception cref="UnauthorizedAccessException">Thrown if user not authenticated</exception>
    /// <exception cref="ArgumentException">Thrown if date range invalid (startDate > endDate)</exception>
    Task<List<AnalysisResultDto>> GetAnalysisHistoryAsync(string userId, DateTime startDate, DateTime endDate);

    /// <summary>
    /// Retrieves dashboard data including analysis history and basic trend metrics.
    /// Combines GetAnalysisHistoryAsync with metric calculations for dashboard display.
    /// </summary>
    /// <param name="userId">User's unique identifier</param>
    /// <param name="startDate">Start of date range</param>
    /// <param name="endDate">End of date range</param>
    /// <returns>Dashboard DTO with analysis history and calculated trend metrics</returns>
    Task<SkinEvolutionDashboardDto> GetDashboardAsync(string userId, DateTime startDate, DateTime endDate);

    /// <summary>
    /// Calculates trend metrics (improvement percentage, average severity, etc.)
    /// for a date range. Used to populate dashboard statistics.
    /// </summary>
    /// <param name="userId">User's unique identifier</param>
    /// <param name="startDate">Start of date range</param>
    /// <param name="endDate">End of date range</param>
    /// <returns>Dashboard DTO with calculated metrics</returns>
    Task<SkinEvolutionDashboardDto> CalculateTrendMetricsAsync(string userId, DateTime startDate, DateTime endDate);

    /// <summary>
    /// Generates a PDF report of skin progress for a date range.
    /// Includes representative images (first, middle, last) and severity summaries.
    /// Used for User Story 2 (PDF Export).
    /// </summary>
    /// <param name="userId">User's unique identifier</param>
    /// <param name="startDate">Start of date range</param>
    /// <param name="endDate">End of date range</param>
    /// <returns>PDF file content as byte array</returns>
    /// <exception cref="InvalidOperationException">Thrown if insufficient data for report</exception>
    Task<byte[]> GeneratePdfReportAsync(string userId, DateTime startDate, DateTime endDate);

    /// <summary>
    /// Compares metrics between two time periods.
    /// Calculates deltas, improvement percentages, and significance indicators.
    /// Used for User Story 3 (Period Comparison).
    /// </summary>
    /// <param name="userId">User's unique identifier</param>
    /// <param name="period1Start">Start of first period</param>
    /// <param name="period1End">End of first period</param>
    /// <param name="period2Start">Start of second period</param>
    /// <param name="period2End">End of second period</param>
    /// <returns>Period comparison DTO with delta metrics</returns>
    Task<PeriodComparisonDto> ComparePeriods(string userId, DateTime period1Start, DateTime period1End, DateTime period2Start, DateTime period2End);

    /// <summary>
    /// Logs PDF export event for audit trail (GDPR compliance).
    /// Records all export attempts with user, date range, success status, and request metadata.
    /// </summary>
    /// <param name="userId">User who exported the report</param>
    /// <param name="startDate">Start date of exported period</param>
    /// <param name="endDate">End date of exported period</param>
    /// <param name="success">Whether export was successful</param>
    /// <param name="ipAddress">Client IP address</param>
    /// <param name="userAgent">Client user agent string</param>
    Task LogPdfExportAsync(string userId, DateTime startDate, DateTime endDate, bool success, string ipAddress, string userAgent);

    /// <summary>
    /// Alias for ComparePeriods with different naming convention.
    /// Used by controller for period comparison endpoint.
    /// </summary>
    Task<PeriodComparisonDto> ComparePeriodAsync(string userId, DateTime period1Start, DateTime period1End, DateTime period2Start, DateTime period2End);
}
