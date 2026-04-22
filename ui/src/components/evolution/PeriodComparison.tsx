import React, { useMemo } from "react";

/**
 * PeriodComparison Component
 *
 * SOLID Principles:
 * - Single Responsibility: Compares metrics between two time periods
 * - Dependency Inversion: Receives data as props from parent
 * - Interface Segregation: Minimal props interface
 * - Open/Closed: Extensible for additional metric comparisons
 *
 * Features:
 * - Compare average severity between two time periods
 * - Show improvement/worsening percentages
 * - Display statistical significance indicators
 * - Side-by-side metric breakdown
 *
 * User Story 3: Compare progress across custom time periods
 */

export interface MetricComparison {
  metric: string;
  period1Avg: number;
  period2Avg: number;
  improvement: number; // Positive = improvement, negative = worsening
  improvementPercent: number;
  isSignificant: boolean; // Based on threshold
}

export interface PeriodComparisonProps {
  period1Data: Array<{
    date: string;
    overallSeverity: number;
    [key: string]: any;
  }>;
  period2Data: Array<{
    date: string;
    overallSeverity: number;
    [key: string]: any;
  }>;
  period1Name: string; // e.g., "January 1-15"
  period2Name: string; // e.g., "January 16-31"
  isLoading?: boolean;
  error?: string | null;
}

/**
 * Calculate average of a metric across data points
 */
const calculateAverage = (data: any[], metricKey: string): number => {
  if (data.length === 0) return 0;
  const sum = data.reduce((acc, item) => acc + (item[metricKey] || 0), 0);
  return sum / data.length;
};

/**
 * Determine if improvement is statistically significant
 * Uses simple threshold: > 0.5 point change on 10-point scale
 */
const isSignificantChange = (change: number): boolean => {
  return Math.abs(change) > 0.5;
};

/**
 * PeriodComparison Component
 */
export const PeriodComparison: React.FC<PeriodComparisonProps> = ({
  period1Data,
  period2Data,
  period1Name,
  period2Name,
  isLoading = false,
  error = null,
}) => {
  // Calculate metric comparisons
  const comparisons = useMemo(() => {
    const metrics = ["overallSeverity", "acne", "inflammation", "redness"];

    return metrics
      .map((metric) => {
        const avg1 = calculateAverage(period1Data, metric);
        const avg2 = calculateAverage(period2Data, metric);
        const change = avg1 - avg2; // Positive = improvement (lower severity)
        const percent = avg1 !== 0 ? ((change / avg1) * 100).toFixed(1) : "0";

        return {
          metric,
          period1Avg: avg1,
          period2Avg: avg2,
          improvement: change,
          improvementPercent: parseFloat(percent),
          isSignificant: isSignificantChange(change),
        };
      })
      .filter((c) => c.period1Avg > 0 || c.period2Avg > 0); // Filter out empty metrics
  }, [period1Data, period2Data]);

  // Format metric display name
  const formatMetricName = (metric: string): string => {
    const names: { [key: string]: string } = {
      overallSeverity: "Overall Severity",
      redness: "Redness",
      texture: "Texture",
      oiliness: "Oiliness",
      driness: "Dryness",
    };
    return names[metric] || metric;
  };

  // Get metric icon
  const getMetricIcon = (metric: string): string => {
    const icons: { [key: string]: string } = {
      overallSeverity: "📊",
      redness: "🔴",
      texture: "📈",
      oiliness: "💧",
      driness: "🏜️",
    };
    return icons[metric] || "📌";
  };

  // Calculate overall improvement
  const overallImprovement = useMemo(() => {
    const overallSevComp = comparisons.find(
      (c) => c.metric === "overallSeverity",
    );
    return overallSevComp ? overallSevComp.improvement : 0;
  }, [comparisons]);

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-700 text-sm">{error}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-24 bg-slate-100 rounded-lg animate-pulse"
          ></div>
        ))}
      </div>
    );
  }

  if (period1Data.length === 0 || period2Data.length === 0) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-8 text-center">
        <p className="text-slate-600">
          No data available for one or both periods.
        </p>
        <p className="text-slate-500 text-sm mt-2">
          Select two different date ranges to compare your skin progress.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overall Summary Card */}
      <div
        className={`rounded-lg shadow-sm border p-6 ${
          overallImprovement > 0
            ? "bg-gradient-to-br from-green-50 to-emerald-50 border-green-200"
            : overallImprovement < 0
              ? "bg-gradient-to-br from-orange-50 to-red-50 border-orange-200"
              : "bg-gradient-to-br from-slate-50 to-slate-100 border-slate-200"
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-600 uppercase tracking-wide">
              Overall Progress
            </p>
            <div className="mt-2 flex items-baseline gap-2">
              <p className="text-3xl font-bold text-slate-900">
                {Math.abs(overallImprovement).toFixed(2)}
              </p>
              <p className="text-lg font-semibold text-slate-600">
                point change
              </p>
            </div>
            {overallImprovement > 0 && (
              <p className="text-sm text-green-700 font-medium mt-2">
                ✨ Your skin is improving!
              </p>
            )}
            {overallImprovement < 0 && (
              <p className="text-sm text-orange-700 font-medium mt-2">
                ⚠️ Skin condition worsened
              </p>
            )}
            {overallImprovement === 0 && (
              <p className="text-sm text-slate-700 font-medium mt-2">
                ➡️ No significant change
              </p>
            )}
          </div>
          <div className="text-5xl">
            {overallImprovement > 0
              ? "📈"
              : overallImprovement < 0
                ? "📉"
                : "➡️"}
          </div>
        </div>
      </div>

      {/* Period Info Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">
            Period 1
          </p>
          <p className="text-lg font-bold text-blue-900 mt-2">{period1Name}</p>
          <p className="text-sm text-blue-700 mt-2">
            {period1Data.length} data points
          </p>
        </div>

        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <p className="text-xs font-semibold text-purple-600 uppercase tracking-wide">
            Period 2
          </p>
          <p className="text-lg font-bold text-purple-900 mt-2">
            {period2Name}
          </p>
          <p className="text-sm text-purple-700 mt-2">
            {period2Data.length} data points
          </p>
        </div>
      </div>

      {/* Metric Comparison Table */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
          <h3 className="text-lg font-semibold text-slate-900">
            Metric Comparison
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wide">
                  Metric
                </th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-slate-700 uppercase tracking-wide">
                  {period1Name}
                </th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-slate-700 uppercase tracking-wide">
                  {period2Name}
                </th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-slate-700 uppercase tracking-wide">
                  Change
                </th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-slate-700 uppercase tracking-wide">
                  Trend
                </th>
              </tr>
            </thead>
            <tbody>
              {comparisons.map((comp, idx) => (
                <tr
                  key={comp.metric}
                  className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}
                >
                  <td className="px-6 py-4 text-sm font-medium text-slate-900">
                    <span className="mr-2">{getMetricIcon(comp.metric)}</span>
                    {formatMetricName(comp.metric)}
                  </td>
                  <td className="px-6 py-4 text-center text-sm text-slate-600">
                    <div className="inline-block bg-blue-100 text-blue-900 px-3 py-1 rounded-full font-semibold">
                      {comp.period1Avg.toFixed(2)}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center text-sm text-slate-600">
                    <div className="inline-block bg-purple-100 text-purple-900 px-3 py-1 rounded-full font-semibold">
                      {comp.period2Avg.toFixed(2)}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center text-sm font-semibold">
                    {comp.improvement > 0 ? (
                      <span className="text-green-700">
                        −{Math.abs(comp.improvement).toFixed(2)}
                      </span>
                    ) : comp.improvement < 0 ? (
                      <span className="text-red-700">
                        +{Math.abs(comp.improvement).toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-slate-600">0</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {comp.isSignificant ? (
                      <div className="inline-block bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-semibold">
                        {comp.improvement > 0 ? "✓ Improving" : "⚠ Worsening"}
                      </div>
                    ) : (
                      <div className="inline-block bg-slate-100 text-slate-700 px-3 py-1 rounded-full text-xs font-semibold">
                        Similar
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Explanation */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm font-medium text-blue-900 mb-2">
          📌 How to Read This Comparison
        </p>
        <ul className="space-y-1 text-sm text-blue-800">
          <li>
            <strong>Change:</strong> Negative number means improvement (lower
            severity), positive means worsening
          </li>
          <li>
            <strong>Trend:</strong> "Improving" appears only when change is
            significant (&gt; 0.5 points)
          </li>
          <li>
            <strong>Percentages:</strong> Show the relative change compared to
            Period 1 baseline
          </li>
        </ul>
      </div>
    </div>
  );
};

export default PeriodComparison;
