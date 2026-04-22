import React, { useState, useEffect } from "react";
import type { TrendData } from "../components/evolution/TrendGraph";
import TrendGraph from "../components/evolution/TrendGraph";
import ExportReportButton from "../components/evolution/ExportReportButton";
import PeriodComparison from "../components/evolution/PeriodComparison";
import { getAuthToken } from "../services/authService";
/**
 * Evolution Analysis Dashboard Page
 *
 * SOLID Principles Applied:
 * - Single Responsibility: Container component only manages page structure and routing
 * - Dependency Inversion: Receives API client and analytics service as props or via context
 * - Interface Segregation: Component exposes minimal required props interface
 * - Open/Closed: Extensible for new features (comparison tab, additional metrics) without modification
 *
 * Features:
 * 1. Trend Graphs (User Story 1 - P1)
 * 2. PDF Export (User Story 2 - P1)
 * 3. Period Comparison (User Story 3 - P2)
 *
 * Performance Targets (Constitutional Principle IV):
 * - Graph load: < 2 seconds on 4G mobile (SC-001)
 * - Date-range switching: < 500ms (SC-004)
 * - PDF export: < 10 seconds (SC-003)
 */
export const EvolutionPage: React.FC = () => {
  // Tab state for switching between Trends and Comparison views
  const [activeTab, setActiveTab] = useState<"trends" | "comparison">("trends");

  // Date range filters
  const [dateRangeStart, setDateRangeStart] = useState<Date>(
    new Date(new Date().setDate(new Date().getDate() - 30)), // Default 30 days ago
  );
  const [dateRangeEnd, setDateRangeEnd] = useState<Date>(new Date());

  // Comparison period states (for second tab)
  const [comparisonPeriod1Start, setComparisonPeriod1Start] = useState<Date>(
    new Date(new Date().setDate(new Date().getDate() - 60)),
  );
  const [comparisonPeriod1End, setComparisonPeriod1End] = useState<Date>(
    new Date(new Date().setDate(new Date().getDate() - 30)),
  );
  const [comparisonPeriod2Start, setComparisonPeriod2Start] = useState<Date>(
    new Date(new Date().setDate(new Date().getDate() - 30)),
  );
  const [comparisonPeriod2End, setComparisonPeriod2End] = useState<Date>(
    new Date(),
  );

  // Loading and error states
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Trend data
  const [trendData, setTrendData] = useState<TrendData[]>([]);
  const [comparisonData, setComparisonData] = useState<{
    period1: TrendData[];
    period2: TrendData[];
  }>({ period1: [], period2: [] });

  // Initialize page
  useEffect(() => {
    fetchTrendData();
  }, []);

  /**
   * Formats date for API calls (ISO 8601)
   * Single Responsibility: Date formatting utility
   */
  const formatDateForApi = (date: Date): string => {
    return date.toISOString().split("T")[0];
  };
  /**
   * Fetches trend data for the selected date range
   * Calls API: GET /api/evolution/dashboard?dateRangeStart=...&dateRangeEnd=...
   */
  const fetchTrendData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const token = getAuthToken();
      const response = await fetch(
        `/api/evolution/dashboard?dateRangeStart=${formatDateForApi(dateRangeStart)}&dateRangeEnd=${formatDateForApi(dateRangeEnd)}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch metrics: ${response.statusText}`);
      }

      const apiResponse = await response.json();

      // Transform API response to TrendData format
      const analysisResults = apiResponse.data?.analysisResults || [];
      const transformed = analysisResults.map((result: any) => {
        const acne = result.severityScores?.acne || 0;
        const inflammation = result.severityScores?.inflammation || 0;
        const redness = result.severityScores?.redness || 0;
        const overallSeverity = (acne + inflammation + redness) / 3;

        return {
          date: new Date(result.timestamp).toISOString().split("T")[0],
          overallSeverity,
          acne,
          inflammation,
          redness,
        };
      });

      setTrendData(transformed);
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to load trend data";
      setError(errorMsg);
      setTrendData([]);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Fetches trend data for comparison periods
   */
  const fetchComparisonData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const token = getAuthToken();

      // Fetch period 1
      const response1 = await fetch(
        `/api/evolution/dashboard?dateRangeStart=${formatDateForApi(comparisonPeriod1Start)}&dateRangeEnd=${formatDateForApi(comparisonPeriod1End)}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      );

      // Fetch period 2
      const response2 = await fetch(
        `/api/evolution/dashboard?dateRangeStart=${formatDateForApi(comparisonPeriod2Start)}&dateRangeEnd=${formatDateForApi(comparisonPeriod2End)}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      );

      if (!response1.ok || !response2.ok) {
        throw new Error("Failed to fetch comparison data");
      }

      // Transform both responses
      const transformAnalysisResults = (results: any[]) => {
        return (results || []).map((result: any) => {
          const acne = result.severityScores?.acne || 0;
          const inflammation = result.severityScores?.inflammation || 0;
          const redness = result.severityScores?.redness || 0;
          const overallSeverity = (acne + inflammation + redness) / 3;

          return {
            date: new Date(result.timestamp).toISOString().split("T")[0],
            overallSeverity,
            acne,
            inflammation,
            redness,
          };
        });
      };

      const apiResponse1 = await response1.json();
      const apiResponse2 = await response2.json();

      setComparisonData({
        period1: transformAnalysisResults(apiResponse1.data?.analysisResults),
        period2: transformAnalysisResults(apiResponse2.data?.analysisResults),
      });
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to load comparison data";
      setError(errorMsg);
      setComparisonData({ period1: [], period2: [] });
    } finally {
      setIsLoading(false);
    }
  };
  /**
   * Handles date range change with validation
   * Single Responsibility: Validates and updates date range state
   */
  const handleDateRangeChange = async (start: Date, end: Date) => {
    if (end < start) {
      setError("End date cannot be before start date");
      return;
    }
    if (end > new Date()) {
      setError("End date cannot be in the future");
      return;
    }
    setError(null);
    setDateRangeStart(start);
    setDateRangeEnd(end);

    // Fetch data for new date range
    setIsLoading(true);
    try {
      const token = getAuthToken();
      const response = await fetch(
        `/api/evolution/dashboard?dateRangeStart=${formatDateForApi(start)}&dateRangeEnd=${formatDateForApi(end)}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      );
      if (!response.ok) throw new Error("Failed to fetch metrics");

      const apiResponse = await response.json();
      const analysisResults = apiResponse.data?.analysisResults || [];
      const transformed = analysisResults.map((result: any) => {
        const acne = result.severityScores?.acne || 0;
        const inflammation = result.severityScores?.inflammation || 0;
        const redness = result.severityScores?.redness || 0;
        const overallSeverity = (acne + inflammation + redness) / 3;

        return {
          date: new Date(result.timestamp).toISOString().split("T")[0],
          overallSeverity,
          acne,
          inflammation,
          redness,
        };
      });

      setTrendData(transformed);
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to load data";
      setError(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Switches between Trends and Comparison tabs
   * Single Responsibility: Tab navigation and data loading
   */
  const handleTabChange = async (tab: "trends" | "comparison") => {
    setActiveTab(tab);

    if (tab === "comparison" && comparisonData.period1.length === 0) {
      await fetchComparisonData();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Page Header */}
      <div className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-3xl font-bold text-slate-900">
            Skin Evolution Dashboard
          </h1>
          <p className="mt-2 text-slate-600">
            Track your skin progress over time with visual trends and detailed
            reports
          </p>
        </div>
      </div>

      {/* Page Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Error Alert */}
        {error && (
          <div
            className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg"
            role="alert"
            aria-live="polite"
          >
            <p className="text-red-700 text-sm font-medium">{error}</p>
          </div>
        )}

        {/* Tab Navigation */}
        <div
          className="flex gap-4 mb-8 border-b border-slate-200"
          role="tablist"
        >
          <button
            onClick={() => handleTabChange("trends")}
            className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
              activeTab === "trends"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
            disabled={isLoading}
            role="tab"
            aria-selected={activeTab === "trends"}
            aria-controls="trends-panel"
            aria-label="View trend graphs over time"
          >
            Trend Graphs
          </button>
          <button
            onClick={() => handleTabChange("comparison")}
            className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
              activeTab === "comparison"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
            disabled={isLoading}
            role="tab"
            aria-selected={activeTab === "comparison"}
            aria-controls="comparison-panel"
            aria-label="Compare two time periods"
          >
            Compare Periods
          </button>
        </div>

        {/* Loading Spinner */}
        {isLoading && (
          <div
            className="flex items-center justify-center py-12"
            role="status"
            aria-live="polite"
            aria-busy="true"
          >
            <div className="text-center">
              <div
                className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"
                aria-hidden="true"
              ></div>
              <p className="mt-4 text-slate-600">
                Loading your skin analysis...
              </p>
            </div>
          </div>
        )}

        {/* Tab Content */}
        {!isLoading && (
          <>
            {/* Trends Tab */}
            {activeTab === "trends" && (
              <div
                className="space-y-6"
                id="trends-panel"
                role="tabpanel"
                aria-labelledby="trends-tab"
              >
                {/* Date Range Filter Controls */}
                <div className="bg-white rounded-lg shadow-sm p-6 border border-slate-200">
                  <h2 className="text-lg font-semibold text-slate-900 mb-4">
                    Select Date Range
                  </h2>

                  {/* Quick Filter Buttons */}
                  <div className="flex flex-wrap gap-3 mb-4">
                    <button
                      onClick={() => {
                        const start = new Date();
                        start.setDate(start.getDate() - 7);
                        handleDateRangeChange(start, new Date());
                      }}
                      className="px-4 py-2 bg-blue-50 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors"
                      disabled={isLoading}
                      aria-label="View trends for the last 7 days"
                    >
                      Last 7 Days
                    </button>
                    <button
                      onClick={() => {
                        const start = new Date();
                        start.setDate(start.getDate() - 30);
                        handleDateRangeChange(start, new Date());
                      }}
                      className="px-4 py-2 bg-blue-50 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors"
                      disabled={isLoading}
                      aria-label="View trends for the last 30 days"
                    >
                      Last 30 Days
                    </button>
                    {/* TODO: Add custom date range picker */}
                  </div>

                  <p className="text-sm text-slate-600">
                    {formatDateForApi(dateRangeStart)} to{" "}
                    {formatDateForApi(dateRangeEnd)}
                  </p>
                </div>

                {/* Trend Graph Component */}
                <TrendGraph
                  data={trendData}
                  dateRangeStart={dateRangeStart}
                  dateRangeEnd={dateRangeEnd}
                  isLoading={isLoading}
                  error={null}
                />

                {/* Export PDF Button */}
                <div className="bg-white rounded-lg shadow-sm p-6 border border-slate-200">
                  <h2 className="text-lg font-semibold text-slate-900 mb-4">
                    Download Report
                  </h2>
                  <ExportReportButton
                    dateRangeStart={dateRangeStart}
                    dateRangeEnd={dateRangeEnd}
                    isDisabled={isLoading || trendData.length === 0}
                    onExportStart={() => console.log("Starting export...")}
                    onExportComplete={(success) => {
                      if (success) {
                        setError(null);
                      }
                    }}
                  />
                </div>
              </div>
            )}

            {/* Comparison Tab */}
            {activeTab === "comparison" && (
              <div
                className="space-y-6"
                id="comparison-panel"
                role="tabpanel"
                aria-labelledby="comparison-tab"
              >
                <div className="bg-white rounded-lg shadow-sm p-6 border border-slate-200">
                  <h2 className="text-lg font-semibold text-slate-900 mb-6">
                    Compare Two Periods
                  </h2>

                  {/* Period Selection Controls */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    {/* Period 1 Controls */}
                    <div className="space-y-3">
                      <label className="block text-sm font-semibold text-slate-900">
                        Period 1
                      </label>
                      <input
                        type="date"
                        value={
                          comparisonPeriod1Start.toISOString().split("T")[0]
                        }
                        onChange={(e) =>
                          setComparisonPeriod1Start(new Date(e.target.value))
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        aria-label="Period 1 start date"
                      />
                      <p className="text-xs text-slate-600">to</p>
                      <input
                        type="date"
                        value={comparisonPeriod1End.toISOString().split("T")[0]}
                        onChange={(e) =>
                          setComparisonPeriod1End(new Date(e.target.value))
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        aria-label="Period 1 end date"
                      />
                    </div>

                    {/* Period 2 Controls */}
                    <div className="space-y-3">
                      <label className="block text-sm font-semibold text-slate-900">
                        Period 2
                      </label>
                      <input
                        type="date"
                        value={
                          comparisonPeriod2Start.toISOString().split("T")[0]
                        }
                        onChange={(e) =>
                          setComparisonPeriod2Start(new Date(e.target.value))
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        aria-label="Period 2 start date"
                      />
                      <p className="text-xs text-slate-600">to</p>
                      <input
                        type="date"
                        value={comparisonPeriod2End.toISOString().split("T")[0]}
                        onChange={(e) =>
                          setComparisonPeriod2End(new Date(e.target.value))
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        aria-label="Period 2 end date"
                      />
                    </div>
                  </div>

                  {/* Period Comparison Component */}
                  <PeriodComparison
                    period1Data={comparisonData.period1}
                    period2Data={comparisonData.period2}
                    period1Name={`${comparisonPeriod1Start.toLocaleDateString()} - ${comparisonPeriod1End.toLocaleDateString()}`}
                    period2Name={`${comparisonPeriod2Start.toLocaleDateString()} - ${comparisonPeriod2End.toLocaleDateString()}`}
                    isLoading={isLoading}
                    error={null}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default EvolutionPage;
