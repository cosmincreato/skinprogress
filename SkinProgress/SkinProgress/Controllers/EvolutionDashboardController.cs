using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SkinProgress.Models.DTOs;
using SkinProgress.Services.Interfaces;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace SkinProgress.Controllers
{
    /// <summary>
    /// Evolution Dashboard Controller
    /// 
    /// SOLID Principles Applied:
    /// - Single Responsibility: Handles HTTP concerns only (routing, auth, response formatting)
    /// - Dependency Inversion: Injects IEvolutionAnalyticsService, not concrete implementation
    /// - Open/Closed: Extensible via service interface without modifying controller
    /// 
    /// Endpoints:
    /// - GET /api/evolution/dashboard - Retrieve trend graphs for date range
    /// - POST /api/evolution/export-pdf - Generate and download PDF report
    /// - POST /api/evolution/compare - Compare two time periods
    /// </summary>
    [ApiController]
    [Route("api/evolution")]
    [Authorize]
    public class EvolutionDashboardController : ControllerBase
    {
        private readonly IEvolutionAnalyticsService _analyticsService;
        private readonly ILogger<EvolutionDashboardController> _logger;

        /// <summary>
        /// Initializes a new instance of EvolutionDashboardController.
        /// Follows Dependency Inversion Principle by accepting interfaces, not concrete types.
        /// </summary>
        /// <param name="analyticsService">Analytics service for dashboard calculations (injected)</param>
        /// <param name="logger">Logger for audit and error tracking (injected)</param>
        public EvolutionDashboardController(
            IEvolutionAnalyticsService analyticsService,
            ILogger<EvolutionDashboardController> logger)
        {
            _analyticsService = analyticsService ?? throw new ArgumentNullException(nameof(analyticsService));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        /// <summary>
        /// Retrieves skin evolution dashboard data (trend graphs) for a user's date range.
        /// 
        /// HTTP GET /api/evolution/dashboard?dateRangeStart=2026-04-02&dateRangeEnd=2026-04-09
        /// 
        /// Response: SkinEvolutionDashboardDto containing analysis history, trend metrics, and heatmaps
        /// Performance Target: < 2 seconds on 4G mobile (SC-001)
        /// </summary>
        /// <param name="dateRangeStart">Start date for analysis history (ISO 8601 format)</param>
        /// <param name="dateRangeEnd">End date for analysis history (ISO 8601 format)</param>
        /// <returns>Dashboard data with severity trends and heatmaps</returns>
        [HttpGet("dashboard")]
        public async Task<IActionResult> GetDashboard(
            [FromQuery] DateTime dateRangeStart,
            [FromQuery] DateTime dateRangeEnd)
        {
            try
            {
                // Validate input
                if (dateRangeEnd < dateRangeStart)
                {
                    _logger.LogWarning("Invalid date range: end date before start date");
                    return BadRequest(new ApiError { Message = "End date cannot be before start date" });
                }

                if (dateRangeEnd > DateTime.Now)
                {
                    _logger.LogWarning("Invalid date range: end date in future");
                    return BadRequest(new ApiError { Message = "End date cannot be in the future" });
                }

                // Extract user ID from JWT claim (set by AuthController)
                var userId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(userId))
                {
                    _logger.LogError("User ID not found in JWT claim");
                    return Unauthorized();
                }

                // Retrieve dashboard data (service handles business logic)
                var dashboard = await _analyticsService.GetDashboardAsync(userId, dateRangeStart, dateRangeEnd);

                return Ok(new ApiResponse<SkinEvolutionDashboardDto>
                {
                    Success = true,
                    Data = dashboard
                });
            }
            catch (ArgumentException ex)
            {
                _logger.LogWarning(ex, "Validation error in GetDashboard");
                return BadRequest(new ApiError { Message = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unexpected error in GetDashboard");
                return StatusCode(500, new ApiError { Message = "Internal server error" });
            }
        }

        /// <summary>
        /// Exports skin progress report as PDF.
        /// 
        /// HTTP POST /api/evolution/export-pdf
        /// Body: { "dateRangeStart": "2026-03-02", "dateRangeEnd": "2026-04-02" }
        /// 
        /// Response: PDF file (application/pdf) with representative images, heatmaps, and severity summary
        /// Performance Target: < 10 seconds (SC-003)
        /// Audit: Logged to PdfExportAuditLog for GDPR compliance (FR-011)
        /// </summary>
        /// <param name="request">Export request with date range</param>
        /// <returns>PDF file download</returns>
        [HttpPost("export-pdf")]
        public async Task<IActionResult> ExportReport([FromBody] ExportPdfRequest request)
        {
            try
            {
                // Validate input
                if (request.DateRangeEnd < request.DateRangeStart)
                {
                    return BadRequest(new ApiError { Message = "End date cannot be before start date" });
                }

                // Extract user ID from JWT
                var userId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(userId))
                {
                    return Unauthorized();
                }

                // Generate PDF (service handles async generation, prevents UI blocking)
                var pdfStream = await _analyticsService.GeneratePdfReportAsync(
                    userId, request.DateRangeStart, request.DateRangeEnd);

                if (pdfStream == null || pdfStream.Length == 0)
                {
                    _logger.LogWarning("PDF generation returned empty stream");
                    return BadRequest(new ApiError { Message = "Failed to generate PDF" });
                }

                // Log export for audit trail (GDPR compliance - FR-011)
                await _analyticsService.LogPdfExportAsync(
                    userId,
                    request.DateRangeStart,
                    request.DateRangeEnd,
                    success: true,
                    ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString() ?? "Unknown",
                    userAgent: Request.Headers["User-Agent"].ToString());

                // Return PDF file
                return File(pdfStream, "application/pdf",
                    $"skin-progress-{request.DateRangeStart:yyyy-MM-dd}-{request.DateRangeEnd:yyyy-MM-dd}.pdf");
            }
            catch (ArgumentException ex)
            {
                _logger.LogWarning(ex, "Validation error in ExportReport");
                return BadRequest(new ApiError { Message = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error generating PDF report");

                // Log failed export attempt
                var userId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
                if (!string.IsNullOrEmpty(userId))
                {
                    await _analyticsService.LogPdfExportAsync(
                        userId, request.DateRangeStart, request.DateRangeEnd,
                        success: false,
                        ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString() ?? "Unknown",
                        userAgent: Request.Headers["User-Agent"].ToString());
                }

                return StatusCode(500, new ApiError { Message = "Failed to generate PDF report" });
            }
        }

        /// <summary>
        /// Compares skin severity between two time periods.
        /// 
        /// HTTP POST /api/evolution/compare
        /// Body: { "period1Start": "2026-03-01", "period1End": "2026-03-15", ... }
        /// 
        /// Response: PeriodComparisonDto with deltas calculated as average-to-average percentage change (FR-007)
        /// Performance Target: < 2 seconds load time
        /// </summary>
        /// <param name="request">Comparison request with two date ranges</param>
        /// <returns>Comparison data with severity deltas</returns>
        [HttpPost("compare")]
        public async Task<IActionResult> ComparePeriods([FromBody] ComparePeriodRequest request)
        {
            try
            {
                // Validate input
                if (request.Period1End < request.Period1Start || request.Period2End < request.Period2Start)
                {
                    return BadRequest(new ApiError { Message = "Invalid date ranges" });
                }

                // Extract user ID from JWT
                var userId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(userId))
                {
                    return Unauthorized();
                }

                // Calculate comparison (service handles business logic)
                var comparison = await _analyticsService.ComparePeriodAsync(
                    userId,
                    request.Period1Start,
                    request.Period1End,
                    request.Period2Start,
                    request.Period2End);

                return Ok(new ApiResponse<PeriodComparisonDto>
                {
                    Success = true,
                    Data = comparison
                });
            }
            catch (ArgumentException ex)
            {
                _logger.LogWarning(ex, "Validation error in ComparePeriods");
                return BadRequest(new ApiError { Message = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in ComparePeriods");
                return StatusCode(500, new ApiError { Message = "Internal server error" });
            }
        }
    }

    /// <summary>
    /// API response wrapper for consistent response formatting.
    /// Implements generic response pattern for type safety.
    /// </summary>
    public class ApiResponse<T>
    {
        /// <summary>Indicates if request was successful</summary>
        public bool Success { get; set; }

        /// <summary>Response data payload</summary>
        public T? Data { get; set; }

        /// <summary>Optional error message</summary>
        public string? Message { get; set; }
    }

    /// <summary>
    /// API error response for error cases.
    /// </summary>
    public class ApiError
    {
        /// <summary>Human-readable error message</summary>
        public string? Message { get; set; }

        /// <summary>Optional error code for client handling</summary>
        public string? Code { get; set; }
    }

    /// <summary>
    /// Request model for PDF export endpoint.
    /// Single Responsibility: Encapsulates export parameters only.
    /// </summary>
    public class ExportPdfRequest
    {
        /// <summary>Start date of analysis range to export</summary>
        public DateTime DateRangeStart { get; set; }

        /// <summary>End date of analysis range to export</summary>
        public DateTime DateRangeEnd { get; set; }
    }

    /// <summary>
    /// Request model for period comparison endpoint.
    /// Single Responsibility: Encapsulates comparison parameters only.
    /// </summary>
    public class ComparePeriodRequest
    {
        /// <summary>Start date of first period</summary>
        public DateTime Period1Start { get; set; }

        /// <summary>End date of first period</summary>
        public DateTime Period1End { get; set; }

        /// <summary>Start date of second period</summary>
        public DateTime Period2Start { get; set; }

        /// <summary>End date of second period</summary>
        public DateTime Period2End { get; set; }
    }
}
