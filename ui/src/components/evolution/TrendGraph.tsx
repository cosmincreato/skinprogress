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

export interface TrendData {
  date: string;
  overallSeverity: number;
  acne?: number;
  redness?: number;
  under_eye_bags?: number;
}

export interface TrendGraphProps {
  data: TrendData[];
  dateRangeStart: Date;
  dateRangeEnd: Date;
  isLoading?: boolean;
  error?: string | null;
}

const CustomTooltip: React.FC<any> = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div
        className="border border-skin-border rounded-xl px-3 py-2 shadow-md text-sm"
        style={{ backgroundColor: "rgb(var(--color-surface))" }}
      >
        <p className="text-on-surface-variant text-xs mb-1">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} style={{ color: entry.color }} className="font-medium">
            {entry.name}: {entry.value.toFixed(2)}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

const TrendGraphSkeleton: React.FC = () => (
  <div className="space-y-4">
    <div className="h-80 bg-surface-warm rounded-xl animate-pulse" />
    <div className="flex gap-2 flex-wrap">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="h-8 w-32 bg-surface-warm rounded-xl animate-pulse" />
      ))}
    </div>
  </div>
);

export const TrendGraph: React.FC<TrendGraphProps> = ({
  data,
  dateRangeStart,
  dateRangeEnd,
  isLoading = false,
  error = null,
}) => {
  const [chartType, setChartType] = useState<"line" | "composed">("line");

  const filteredData = useMemo(() => {
    const start = dateRangeStart.getTime();
    const end = dateRangeEnd.getTime();
    return data.filter(item => {
      const itemDate = new Date(item.date).getTime();
      return itemDate >= start && itemDate <= end;
    });
  }, [data, dateRangeStart, dateRangeEnd]);

  const statistics = useMemo(() => {
    if (filteredData.length === 0) return { avgSeverity: 0, maxSeverity: 0, minSeverity: 0, trend: "stable" };
    const severities = filteredData.map(d => d.overallSeverity);
    const avg = severities.reduce((a, b) => a + b) / severities.length;
    const first = severities[0];
    const last = severities[severities.length - 1];
    return {
      avgSeverity: avg,
      maxSeverity: Math.max(...severities),
      minSeverity: Math.min(...severities),
      trend: last < first ? "improving" : last > first ? "worsening" : "stable",
    };
  }, [filteredData]);

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  if (isLoading) return <TrendGraphSkeleton />;

  if (filteredData.length === 0) {
    return (
      <div className="bg-surface-warm border border-skin-border rounded-xl p-8 text-center">
        <p className="text-on-surface-variant text-sm">No data available for the selected date range.</p>
        <p className="text-on-surface-variant/60 text-xs mt-2">Start taking daily selfies to see your skin's progress!</p>
      </div>
    );
  }

  const statCards = [
    { label: "Average Severity", value: `${statistics.avgSeverity.toFixed(1)}/10`, accent: "#C17F60" },
    { label: "Trend", value: statistics.trend, capitalize: true, accent: statistics.trend === "improving" ? "#8B9E88" : statistics.trend === "worsening" ? "#D4607A" : "#B8A89C" },
    { label: "Peak Severity", value: `${statistics.maxSeverity.toFixed(1)}/10`, accent: "#D4607A" },
    { label: "Best Day", value: `${statistics.minSeverity.toFixed(1)}/10`, accent: "#8B9E88" },
  ];

  return (
    <div className="space-y-6">
      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map(card => (
          <div key={card.label} className="bg-surface-warm rounded-xl border border-skin-border p-4">
            <p className="text-xs font-medium text-on-surface-variant uppercase tracking-widest mb-2">{card.label}</p>
            <p
              className={`text-xl font-bold ${card.capitalize ? "capitalize" : ""}`}
              style={{ color: card.accent }}
            >
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {/* Chart type toggle */}
      <div className="flex gap-0.5 p-1 bg-surface-warm rounded-xl border border-skin-border w-fit">
        {(["line", "composed"] as const).map(type => (
          <button
            key={type}
            onClick={() => setChartType(type)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              chartType === type
                ? "bg-surface text-on-surface shadow-sm border border-skin-border"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {type === "line" ? "Line chart" : "Detailed metrics"}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="rounded-xl border border-skin-border p-5" style={{ backgroundColor: "rgb(var(--color-surface))" }}>
        <p className="text-sm font-semibold text-on-surface mb-4">
          {chartType === "line" ? "Severity Over Time" : "Detailed Metrics Breakdown"}
        </p>
        <ResponsiveContainer width="100%" height={300}>
          {chartType === "line" ? (
            <LineChart data={filteredData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(var(--color-on-surface), 0.08)" />
              <XAxis dataKey="date" stroke="rgba(var(--color-on-surface-variant), 0.5)" tick={{ fill: "rgb(var(--color-on-surface-variant))", fontSize: 11 }} />
              <YAxis domain={[0, 10]} stroke="rgba(var(--color-on-surface-variant), 0.5)" tick={{ fill: "rgb(var(--color-on-surface-variant))", fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ color: "rgb(var(--color-on-surface-variant))", fontSize: 12 }} />
              <Line type="monotone" dataKey="overallSeverity" name="Overall" stroke="#C17F60" strokeWidth={2} dot={{ fill: "#C17F60", r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          ) : (
            <ComposedChart data={filteredData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(var(--color-on-surface), 0.08)" />
              <XAxis dataKey="date" stroke="rgba(var(--color-on-surface-variant), 0.5)" tick={{ fill: "rgb(var(--color-on-surface-variant))", fontSize: 11 }} />
              <YAxis domain={[0, 10]} stroke="rgba(var(--color-on-surface-variant), 0.5)" tick={{ fill: "rgb(var(--color-on-surface-variant))", fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ color: "rgb(var(--color-on-surface-variant))", fontSize: 12 }} />
              <Line type="monotone" dataKey="overallSeverity" name="Overall" stroke="#C17F60" strokeWidth={2} dot={false} />
              <Bar dataKey="acne" name="Acne" fill="#D4607A" opacity={0.7} />
              <Bar dataKey="under_eye_bags" name="Dark Circles" fill="#C17F60" opacity={0.7} />
              <Bar dataKey="redness" name="Redness" fill="#8B9E88" opacity={0.7} />
            </ComposedChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Data point info */}
      <p className="text-xs text-on-surface-variant">
        {filteredData.length} data point{filteredData.length !== 1 ? "s" : ""} from{" "}
        {dateRangeStart.toLocaleDateString()} to {dateRangeEnd.toLocaleDateString()}
      </p>
    </div>
  );
};

export default TrendGraph;
