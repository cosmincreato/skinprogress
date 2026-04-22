import React, { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
} from "recharts";

/**
 * TrendGraph Component
 *
 * SOLID Principles:
 * - Single Responsibility: Renders severity metric trends only
 * - Dependency Inversion: Receives data as props, abstracted from data source
 * - Interface Segregation: Minimal required props (data, dateRange)
 * - Open/Closed: Easily extensible for new metrics without modification
 *
 * Performance Target: < 2 seconds load on 4G (SC-001)
 * Uses ResponsiveContainer for mobile responsiveness
 *
 * Data Structure Expected:
 * [
 *   {
 *     date: "2025-01-01",
 *     overallSeverity: 6.5,
 *     redness: 7.2,
 *     texture: 5.8,
 *     oiliness: 6.1,
 *     driness: 4.9,
 *   },
 *   ...
 * ]
 */

export interface TrendData {
  date: string;
  overallSeverity: number;
  redness?: number;
  texture?: number;
  oiliness?: number;
  driness?: number;
  confidence?: number;
}

export interface TrendGraphProps {
  data: TrendData[];
  dateRangeStart: Date;
  dateRangeEnd: Date;
  isLoading?: boolean;
  error?: string | null;
}

/**
 * Custom tooltip to display metric information
 */
const CustomTooltip: React.FC<any> = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-3 border border-slate-200 rounded shadow-lg">
        <p className="text-sm font-medium text-slate-900">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} style={{ color: entry.color }} className="text-sm">
            {entry.name}: {entry.value.toFixed(2)}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

/**
 * Skeleton loader for graph while data is loading
 */
const TrendGraphSkeleton: React.FC = () => (
  <div className="space-y-4">
    <div className="h-80 bg-slate-100 rounded-lg animate-pulse"></div>
    <div className="flex gap-2 flex-wrap">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="h-8 w-32 bg-slate-100 rounded animate-pulse"
        ></div>
      ))}
    </div>
  </div>
);

/**
 * TrendGraph Component
 * Displays severity metrics as line chart with multiple data series
 *
 * Future Enhancement: Add comparison overlay, export chart as image
 */
export const TrendGraph: React.FC<TrendGraphProps> = ({
  data,
  dateRangeStart,
  dateRangeEnd,
  isLoading = false,
  error = null,
}) => {
  const [chartType, setChartType] = useState<"line" | "composed">("line");

  // Filter data by date range
  const filteredData = useMemo(() => {
    const start = dateRangeStart.getTime();
    const end = dateRangeEnd.getTime();

    return data.filter((item) => {
      const itemDate = new Date(item.date).getTime();
      return itemDate >= start && itemDate <= end;
    });
  }, [data, dateRangeStart, dateRangeEnd]);

  // Calculate statistics for display
  const statistics = useMemo(() => {
    if (filteredData.length === 0) {
      return {
        avgSeverity: 0,
        maxSeverity: 0,
        minSeverity: 0,
        trend: "stable",
      };
    }

    const severities = filteredData.map((d) => d.overallSeverity);
    const avg = severities.reduce((a, b) => a + b) / severities.length;
    const max = Math.max(...severities);
    const min = Math.min(...severities);

    // Determine trend (improvement vs worsening)
    const first = severities[0];
    const last = severities[severities.length - 1];
    const trend =
      last < first ? "improving" : last > first ? "worsening" : "stable";

    return {
      avgSeverity: avg,
      maxSeverity: max,
      minSeverity: min,
      trend,
    };
  }, [filteredData]);

  if (error) {
    return (
      <div
        className="bg-red-50 border border-red-200 rounded-lg p-4"
        role="alert"
        aria-live="polite"
      >
        <p className="text-red-700 text-sm">{error}</p>
      </div>
    );
  }

  if (isLoading) {
    return <TrendGraphSkeleton />;
  }

  if (filteredData.length === 0) {
    return (
      <div
        className="bg-slate-50 border border-slate-200 rounded-lg p-8 text-center"
        role="status"
      >
        <p className="text-slate-600">
          No data available for the selected date range.
        </p>
        <p className="text-slate-500 text-sm mt-2">
          Start taking daily selfies to see your skin's progress!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6" aria-label="Skin evolution trend visualization">
      {/* Statistics Summary */}
      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        role="complementary"
        aria-label="Trend statistics summary"
      >
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">
            Average Severity
          </p>
          <p
            className="text-2xl font-bold text-blue-900 mt-2"
            aria-label={`Average severity: ${statistics.avgSeverity.toFixed(1)} out of 10`}
          >
            {statistics.avgSeverity.toFixed(1)}/10
          </p>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
          <p className="text-xs font-semibold text-green-600 uppercase tracking-wide">
            Trend
          </p>
          <p
            className="text-xl font-bold text-green-900 mt-2 capitalize"
            aria-label={`Trend is: ${statistics.trend}`}
          >
            {statistics.trend}
          </p>
        </div>

        <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-4 border border-orange-200">
          <p className="text-xs font-semibold text-orange-600 uppercase tracking-wide">
            Peak Severity
          </p>
          <p
            className="text-2xl font-bold text-orange-900 mt-2"
            aria-label={`Peak severity: ${statistics.maxSeverity.toFixed(1)} out of 10`}
          >
            {statistics.maxSeverity.toFixed(1)}/10
          </p>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
          <p className="text-xs font-semibold text-purple-600 uppercase tracking-wide">
            Best Day
          </p>
          <p
            className="text-2xl font-bold text-purple-900 mt-2"
            aria-label={`Best day severity: ${statistics.minSeverity.toFixed(1)} out of 10`}
          >
            {statistics.minSeverity.toFixed(1)}/10
          </p>
        </div>
      </div>

      {/* Chart Type Toggle */}
      <div
        className="flex gap-2"
        role="group"
        aria-label="Chart display options"
      >
        <button
          onClick={() => setChartType("line")}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            chartType === "line"
              ? "bg-blue-600 text-white"
              : "bg-slate-200 text-slate-700 hover:bg-slate-300"
          }`}
          aria-pressed={chartType === "line"}
          aria-label="Display trends as line chart"
        >
          Line Chart
        </button>
        <button
          onClick={() => setChartType("composed")}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            chartType === "composed"
              ? "bg-blue-600 text-white"
              : "bg-slate-200 text-slate-700 hover:bg-slate-300"
          }`}
          aria-pressed={chartType === "composed"}
          aria-label="Display detailed metric breakdown"
        >
          Detailed Metrics
        </button>
      </div>

      {/* Line Chart - Overall Severity Trend */}
      {chartType === "line" && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">
            Severity Over Time
          </h3>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart
              data={filteredData}
              margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="date"
                stroke="#94a3b8"
                style={{ fontSize: "12px" }}
                tick={{ fill: "#64748b" }}
              />
              <YAxis
                domain={[0, 10]}
                stroke="#94a3b8"
                style={{ fontSize: "12px" }}
                tick={{ fill: "#64748b" }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Line
                type="monotone"
                dataKey="overallSeverity"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ fill: "#3b82f6", r: 4 }}
                activeDot={{ r: 6 }}
                isAnimationActive={true}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Composed Chart - All Metrics */}
      {chartType === "composed" && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">
            Detailed Metrics Breakdown
          </h3>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart
              data={filteredData}
              margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="date"
                stroke="#94a3b8"
                style={{ fontSize: "12px" }}
                tick={{ fill: "#64748b" }}
              />
              <YAxis
                domain={[0, 10]}
                stroke="#94a3b8"
                style={{ fontSize: "12px" }}
                tick={{ fill: "#64748b" }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Line
                type="monotone"
                dataKey="overallSeverity"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
              />
              <Bar dataKey="acne" fill="#ef4444" opacity={0.7} />
              <Bar dataKey="inflammation" fill="#f59e0b" opacity={0.7} />
              <Bar dataKey="redness" fill="#8b5cf6" opacity={0.7} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Data Point Count Info */}
      <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
        <p className="text-sm text-slate-600">
          📊 Analysis based on {filteredData.length} data point
          {filteredData.length !== 1 ? "s" : ""} from{" "}
          {dateRangeStart.toLocaleDateString()} to{" "}
          {dateRangeEnd.toLocaleDateString()}
        </p>
      </div>
    </div>
  );
};

export default TrendGraph;
