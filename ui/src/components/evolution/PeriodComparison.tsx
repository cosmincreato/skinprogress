import React, { useMemo } from "react";

export interface MetricComparison {
  metric: string;
  period1Avg: number;
  period2Avg: number;
  improvement: number;
  improvementPercent: number;
  isSignificant: boolean;
}

export interface PeriodComparisonProps {
  period1Data: Array<{ date: string; overallSeverity: number; [key: string]: any }>;
  period2Data: Array<{ date: string; overallSeverity: number; [key: string]: any }>;
  period1Name: string;
  period2Name: string;
  isLoading?: boolean;
  error?: string | null;
}

const calculateAverage = (data: any[], metricKey: string): number => {
  if (data.length === 0) return 0;
  return data.reduce((acc, item) => acc + (item[metricKey] || 0), 0) / data.length;
};

const isSignificantChange = (change: number): boolean => Math.abs(change) > 0.5;

export const PeriodComparison: React.FC<PeriodComparisonProps> = ({
  period1Data,
  period2Data,
  period1Name,
  period2Name,
  isLoading = false,
  error = null,
}) => {
  const comparisons = useMemo(() => {
    const metrics = ["overallSeverity", "acne", "redness", "under_eye_bags"];
    return metrics
      .map(metric => {
        const avg1 = calculateAverage(period1Data, metric);
        const avg2 = calculateAverage(period2Data, metric);
        const change = avg1 - avg2;
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
      .filter(c => c.period1Avg > 0 || c.period2Avg > 0);
  }, [period1Data, period2Data]);

  const formatMetricName = (metric: string): string => ({
    overallSeverity: "Overall Severity",
    redness: "Redness",
    acne: "Acne",
    under_eye_bags: "Dark Circles",
    texture: "Texture",
    oiliness: "Oiliness",
    driness: "Dryness",
  }[metric] || metric);

  const overallImprovement = useMemo(() => {
    const comp = comparisons.find(c => c.metric === "overallSeverity");
    return comp ? comp.improvement : 0;
  }, [comparisons]);

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-20 bg-surface-warm rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (period1Data.length === 0 || period2Data.length === 0) {
    return (
      <div className="bg-surface-warm border border-skin-border rounded-xl p-8 text-center">
        <p className="text-on-surface-variant text-sm">No data available for one or both periods.</p>
        <p className="text-on-surface-variant/60 text-xs mt-2">Select two different date ranges to compare your skin progress.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Overall summary */}
      <div className={`bg-surface rounded-2xl border p-5 ${
        overallImprovement > 0 ? "border-secondary/40" : overallImprovement < 0 ? "border-bloom/40" : "border-skin-border"
      }`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-on-surface-variant uppercase tracking-widest mb-2">Overall Progress</p>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-bold text-on-surface">{Math.abs(overallImprovement).toFixed(2)}</p>
              <p className="text-sm text-on-surface-variant">point change</p>
            </div>
            <p className={`text-sm font-medium mt-2 ${
              overallImprovement > 0 ? "text-secondary" : overallImprovement < 0 ? "text-bloom" : "text-on-surface-variant"
            }`}>
              {overallImprovement > 0 ? "✨ Your skin is improving!" : overallImprovement < 0 ? "⚠ Skin condition worsened" : "→ No significant change"}
            </p>
          </div>
          <span className="text-4xl">
            {overallImprovement > 0 ? "📈" : overallImprovement < 0 ? "📉" : "➡️"}
          </span>
        </div>
      </div>

      {/* Period info */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-surface-warm border border-primary/30 rounded-xl p-4">
          <p className="text-xs font-medium text-primary uppercase tracking-widest mb-1">Period 1</p>
          <p className="text-sm font-semibold text-on-surface">{period1Name}</p>
          <p className="text-xs text-on-surface-variant mt-1">{period1Data.length} data points</p>
        </div>
        <div className="bg-surface-warm border border-secondary/30 rounded-xl p-4">
          <p className="text-xs font-medium text-secondary uppercase tracking-widest mb-1">Period 2</p>
          <p className="text-sm font-semibold text-on-surface">{period2Name}</p>
          <p className="text-xs text-on-surface-variant mt-1">{period2Data.length} data points</p>
        </div>
      </div>

      {/* Metric comparison */}
      <div className="bg-surface border border-skin-border rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-skin-border bg-surface-warm">
          <p className="text-xs font-medium text-on-surface-variant uppercase tracking-widest">Metric Comparison</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-skin-border">
                <th className="px-5 py-3 text-left text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Metric</th>
                <th className="px-5 py-3 text-center text-xs font-semibold text-primary uppercase tracking-wide">Period 1</th>
                <th className="px-5 py-3 text-center text-xs font-semibold text-secondary uppercase tracking-wide">Period 2</th>
                <th className="px-5 py-3 text-center text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Change</th>
                <th className="px-5 py-3 text-center text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-skin-border">
              {comparisons.map(comp => (
                <tr key={comp.metric} className="hover:bg-surface-warm transition-colors">
                  <td className="px-5 py-3.5 text-sm font-medium text-on-surface">{formatMetricName(comp.metric)}</td>
                  <td className="px-5 py-3.5 text-center">
                    <span className="inline-block bg-primary/10 text-primary px-2.5 py-0.5 rounded-full text-xs font-semibold">
                      {comp.period1Avg.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <span className="inline-block bg-secondary/10 text-secondary px-2.5 py-0.5 rounded-full text-xs font-semibold">
                      {comp.period2Avg.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-center text-sm font-semibold">
                    {comp.improvement > 0 ? (
                      <span className="text-secondary">−{Math.abs(comp.improvement).toFixed(2)}</span>
                    ) : comp.improvement < 0 ? (
                      <span className="text-bloom">+{Math.abs(comp.improvement).toFixed(2)}</span>
                    ) : (
                      <span className="text-on-surface-variant">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    {comp.isSignificant ? (
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        comp.improvement > 0 ? "bg-secondary/10 text-secondary" : "bg-bloom/10 text-bloom"
                      }`}>
                        {comp.improvement > 0 ? "Improving" : "Worsening"}
                      </span>
                    ) : (
                      <span className="inline-block bg-surface-warm text-on-surface-variant px-2.5 py-0.5 rounded-full text-xs font-semibold border border-skin-border">
                        Similar
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="bg-surface-warm border border-skin-border rounded-xl p-4 space-y-1">
        <p className="text-xs font-medium text-on-surface-variant uppercase tracking-widest mb-2">How to read this</p>
        <p className="text-xs text-on-surface-variant">A <span className="text-secondary font-medium">negative change</span> means improvement — lower severity in Period 2.</p>
        <p className="text-xs text-on-surface-variant">Status shows as "Improving" or "Worsening" only when change exceeds 0.5 points.</p>
      </div>
    </div>
  );
};

export default PeriodComparison;
