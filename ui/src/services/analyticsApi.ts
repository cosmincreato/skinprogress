/**
 * Analytics API Client
 *
 * Service for communicating with the Evolution Analytics backend endpoints.
 * Handles all HTTP requests for dashboard, PDF export, and period comparison features.
 *
 * Architecture:
 * - Single Responsibility: Encapsulates API communication only
 * - Dependency: None (uses fetch API)
 * - Error Handling: Throws typed errors for controller to handle
 * - Performance: <2s for queries on 4G (SC-001, SC-004)
 *
 * API Endpoints:
 * - GET /api/evolution/dashboard - Retrieve trend data
 * - POST /api/evolution/export-pdf - Generate PDF report
 * - POST /api/evolution/compare - Compare periods
 */

import type { AnalysisResultDto, SkinEvolutionDashboardDto, PeriodComparisonDto } from "../types/evolution";

/**
 * API Error Response
 * Consistent error structure from backend ApiError
 */
export interface ApiErrorResponse {
  message?: string;
  code?: string;
}

/**
 * Generic API Response Wrapper
 * Matches backend ApiResponse<T> structure for type safety
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

/**
 * Query parameters for dashboard endpoint
 */
export interface DashboardQuery {
  dateRangeStart: string;  // ISO 8601 format
  dateRangeEnd: string;    // ISO 8601 format
}

/**
 * Request body for PDF export endpoint
 */
export interface ExportPdfRequest {
  dateRangeStart: string;  // ISO 8601 format
  dateRangeEnd: string;    // ISO 8601 format
}

/**
 * Request body for period comparison endpoint
 */
export interface ComparePeriodRequest {
  period1Start: string;    // ISO 8601 format
  period1End: string;      // ISO 8601 format
  period2Start: string;    // ISO 8601 format
  period2End: string;      // ISO 8601 format
}

/**
 * Custom error class for API failures
 */
export const AnalyticsApiError = (
  statusCode: number,
  message: string,
  code?: string
): Error => {
  const error = new Error(message);
  error.name = "AnalyticsApiError";
  (error as any).statusCode = statusCode;
  (error as any).code = code;
  return error;
}

/**
 * Fetch dashboard data for a date range
 * Used for User Story 1: Trend Graphs
 *
 * Performance Target: <2 seconds on 4G (SC-001)
 *
 * @param startDate - Start date (ISO format: YYYY-MM-DD)
 * @param endDate - End date (ISO format: YYYY-MM-DD)
 * @returns Promise resolving to dashboard data with trend metrics
 * @throws AnalyticsApiError if request fails
 *
 * @example
 * const dashboard = await fetchDashboard(
 *   new Date(Date.now() - 7*24*60*60*1000),  // 7 days ago
 *   new Date()  // today
 * );
 * console.log(dashboard.averageSeverity, dashboard.improvementPercent);
 */
export async function fetchDashboard(
  startDate: Date,
  endDate: Date
): Promise<SkinEvolutionDashboardDto> {
  const startStr = startDate.toISOString().split("T")[0];
  const endStr = endDate.toISOString().split("T")[0];
  const url = `/api/evolution/dashboard?dateRangeStart=${startStr}&dateRangeEnd=${endStr}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAuthToken()}`,
      },
    });

    if (!response.ok) {
      await handleApiError(response);
    }

    const data: ApiResponse<SkinEvolutionDashboardDto> = await response.json();

    if (!data.success || !data.data) {
      throw AnalyticsApiError(
        response.status,
        data.message || "Failed to fetch dashboard data"
      );
    }

    return data.data;
  } catch (error) {
    if (error instanceof Error && error.name === "AnalyticsApiError") {
      throw error;
    }
    throw AnalyticsApiError(
      500,
      "Network error while fetching dashboard data"
    );
  }
}

/**
 * Fetch analysis history for a date range
 * Returns list of individual analysis results with severity metrics
 * Used for graph rendering and data processing
 *
 * @param startDate - Start date (ISO format)
 * @param endDate - End date (ISO format)
 * @returns Promise resolving to list of analysis results
 * @throws AnalyticsApiError if request fails
 */
export async function fetchAnalysisHistory(
  startDate: Date,
  endDate: Date
): Promise<AnalysisResultDto[]> {
  const dashboard = await fetchDashboard(startDate, endDate);
  // Analysis history is typically embedded in dashboard response
  // If separate endpoint needed, add it here
  return dashboard.analysisResults || [];
}

/**
 * Export skin progress report as PDF
 * Used for User Story 2: PDF Export
 *
 * Performance Target: <10 seconds (SC-003)
 *
 * Triggers browser download with filename: skin-progress-YYYY-MM-DD-YYYY-MM-DD.pdf
 *
 * @param startDate - Start date for analysis range
 * @param endDate - End date for analysis range
 * @throws AnalyticsApiError if PDF generation fails
 *
 * @example
 * await exportPdf(
 *   new Date("2026-03-02"),
 *   new Date("2026-04-02")
 * );
 * // Browser downloads: skin-progress-2026-03-02-2026-04-02.pdf
 */
export async function exportPdf(
  startDate: Date,
  endDate: Date
): Promise<void> {
  const startStr = startDate.toISOString().split("T")[0];
  const endStr = endDate.toISOString().split("T")[0];

  const request = {
    dateRangeStart: startStr,
    dateRangeEnd: endStr,
  };

  try {
    const response = await fetch("/api/evolution/export-pdf", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAuthToken()}`,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      await handleApiError(response);
    }

    // Get filename from Content-Disposition header if available
    const contentDisposition = response.headers.get("content-disposition");
    let filename = `skin-progress-${startStr}-${endStr}.pdf`;

    if (contentDisposition) {
      const match = contentDisposition.match(/filename="?([^"]*)"?/);
      if (match) {
        filename = match[1];
      }
    }

    // Convert response to blob and trigger download
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    if (error instanceof Error && error.name === "AnalyticsApiError") {
      throw error;
    }
    throw AnalyticsApiError(500, "Failed to export PDF");
  }
}

/**
 * Compare skin severity between two time periods
 * Used for User Story 3: Period Comparison
 *
 * Performance Target: <2 seconds load time
 *
 * Returns Delta metrics showing improvement/worsening between periods
 *
 * @param period1Start - Start of first period
 * @param period1End - End of first period
 * @param period2Start - Start of second period
 * @param period2End - End of second period
 * @returns Promise resolving to period comparison data with deltas
 * @throws AnalyticsApiError if request fails
 *
 * @example
 * const comparison = await comparePeriods(
 *   new Date("2026-03-01"),
 *   new Date("2026-03-15"),
 *   new Date("2026-03-16"),
 *   new Date("2026-03-31")
 * );
 * console.log(comparison.averageSeverityDelta);  // -15% improvement
 */
export async function comparePeriods(
  period1Start: Date,
  period1End: Date,
  period2Start: Date,
  period2End: Date
): Promise<PeriodComparisonDto> {
  const p1Start = period1Start.toISOString().split("T")[0];
  const p1End = period1End.toISOString().split("T")[0];
  const p2Start = period2Start.toISOString().split("T")[0];
  const p2End = period2End.toISOString().split("T")[0];

  const request = {
    period1Start: p1Start,
    period1End: p1End,
    period2Start: p2Start,
    period2End: p2End,
  };

  try {
    const response = await fetch("/api/evolution/compare", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAuthToken()}`,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      await handleApiError(response);
    }

    const data: ApiResponse<PeriodComparisonDto> = await response.json();

    if (!data.success || !data.data) {
      throw AnalyticsApiError(
        response.status,
        data.message || "Failed to compare periods"
      );
    }

    return data.data;
  } catch (error) {
    if (error instanceof Error && error.name === "AnalyticsApiError") {
      throw error;
    }
    throw AnalyticsApiError(500, "Network error while comparing periods");
  }
}

/**
 * Helper: Get JWT token from localStorage
 * Called by all API methods for authorization
 *
 * @returns JWT token or empty string if not found
 */
function getAuthToken(): string {
  if (typeof window !== "undefined") {
    return localStorage.getItem("jwt") || "";
  }
  return "";
}

/**
 * Helper: Handle API error responses
 * Parses error structure and throws typed exception
 *
 * @param response - HTTP response object
 * @throws AnalyticsApiError with parsed error details
 */
async function handleApiError(response: Response): Promise<never> {
  try {
    const error: ApiErrorResponse = await response.json();
    throw AnalyticsApiError(
      response.status,
      error.message || `HTTP ${response.status}`,
      error.code
    );
  } catch {
    // If response is not JSON (e.g., HTML error page), use generic message
    throw AnalyticsApiError(
      response.status,
      `HTTP ${response.status}: ${response.statusText}`
    );
  }
}
