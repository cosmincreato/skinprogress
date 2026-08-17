import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import type { TrendData } from "../components/evolution/TrendGraph";
import TrendGraph from "../components/evolution/TrendGraph";
import ExportReportButton from "../components/evolution/ExportReportButton";
import PeriodComparison from "../components/evolution/PeriodComparison";
import { getAuthToken } from "../services/authService";

export const EvolutionPage: React.FC = () => {
  const navigate = useNavigate();

  const today = new Date();
  const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };

  const [dateRangeStart, setDateRangeStart] = useState<Date>(daysAgo(60));
  const [dateRangeEnd,   setDateRangeEnd]   = useState<Date>(today);

  const [comparisonPeriod1Start, setComparisonPeriod1Start] = useState<Date>(daysAgo(60));
  const [comparisonPeriod1End,   setComparisonPeriod1End]   = useState<Date>(daysAgo(30));
  const [comparisonPeriod2Start, setComparisonPeriod2Start] = useState<Date>(daysAgo(30));
  const [comparisonPeriod2End,   setComparisonPeriod2End]   = useState<Date>(today);

  const chartRef = useRef<HTMLDivElement>(null);

  const [isLoading,        setIsLoading]        = useState(false);
  const [isComparing,      setIsComparing]      = useState(false);
  const [error,            setError]            = useState<string | null>(null);
  const [trendData,        setTrendData]        = useState<TrendData[]>([]);
  const [comparisonData,   setComparisonData]   = useState<{ period1: TrendData[]; period2: TrendData[] } | null>(null);

  const fmt = (d: Date) => d.toISOString().split("T")[0];

  const handleUnauthorized = () => {
    ["jwt", "accessToken", "refreshToken", "userId", "userEmail", "username"].forEach(k =>
      localStorage.removeItem(k)
    );
    navigate("/login");
  };

  const transformResults = (results: any[]): TrendData[] =>
    (results || []).map((r: any) => {
      const acne          = r.severityScores?.acne          || 0;
      const under_eye_bags = r.severityScores?.underEyeBags || 0;
      const redness       = r.severityScores?.redness       || 0;
      return {
        date: new Date(r.timestamp).toISOString().split("T")[0],
        overallSeverity: (acne + under_eye_bags + redness) / 3,
        acne, under_eye_bags, redness,
      };
    });

  const fetchRange = async (start: Date, end: Date): Promise<TrendData[]> => {
    const token = getAuthToken();
    const res = await fetch(
      `/api/evolution/dashboard?dateRangeStart=${fmt(start)}&dateRangeEnd=${fmt(end)}`,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    );
    if (res.status === 401) { handleUnauthorized(); return []; }
    if (!res.ok) throw new Error(`Failed to load data (${res.status})`);
    const json = await res.json();
    return transformResults(json.data?.analysisResults);
  };

  const loadTrend = async (start = dateRangeStart, end = dateRangeEnd) => {
    setIsLoading(true);
    setError(null);
    try {
      setTrendData(await fetchRange(start, end));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load trend data");
      setTrendData([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadComparison = async () => {
    setIsComparing(true);
    setError(null);
    try {
      const [p1, p2] = await Promise.all([
        fetchRange(comparisonPeriod1Start, comparisonPeriod1End),
        fetchRange(comparisonPeriod2Start, comparisonPeriod2End),
      ]);
      setComparisonData({ period1: p1, period2: p2 });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load comparison data");
    } finally {
      setIsComparing(false);
    }
  };

  useEffect(() => { loadTrend(); }, []);

  const handleQuickRange = (days: number) => {
    const start = daysAgo(days);
    const end   = new Date();
    setDateRangeStart(start);
    setDateRangeEnd(end);
    loadTrend(start, end);
  };

  const dateInput = "px-3 py-2 bg-surface-warm border border-skin-border rounded-xl text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition w-full";

  return (
    <div className="bg-background min-h-screen">
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-7">

        {/* Header */}
        <div>
          <h2 className="font-display text-4xl sm:text-5xl text-on-surface">Evolution</h2>
          <p className="text-on-surface-variant text-sm mt-1">Track your skin's progress over time</p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* ── Date range ── */}
        <div className="bg-surface rounded-2xl border border-skin-border p-5 space-y-4">
          <p className="text-xs font-medium text-on-surface-variant uppercase tracking-widest">Date range</p>

          <div className="flex flex-wrap gap-2">
            {[
              { label: "Last 7 days",  days: 7  },
              { label: "Last 30 days", days: 30 },
              { label: "Last 60 days", days: 60 },
              { label: "Last 90 days", days: 90 },
            ].map(({ label, days }) => (
              <button
                key={days}
                onClick={() => handleQuickRange(days)}
                disabled={isLoading}
                className="px-4 py-2 bg-surface-warm border-2 border-skin-border rounded-xl text-xs font-medium text-on-surface hover:bg-primary/8 hover:border-primary/40 hover:text-primary transition disabled:opacity-40"
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[140px]">
              <p className="text-xs text-on-surface-variant mb-1">From</p>
              <input
                type="date"
                value={fmt(dateRangeStart)}
                max={fmt(dateRangeEnd)}
                onChange={e => setDateRangeStart(new Date(e.target.value))}
                className={dateInput}
              />
            </div>
            <div className="flex-1 min-w-[140px]">
              <p className="text-xs text-on-surface-variant mb-1">To</p>
              <input
                type="date"
                value={fmt(dateRangeEnd)}
                min={fmt(dateRangeStart)}
                max={fmt(today)}
                onChange={e => setDateRangeEnd(new Date(e.target.value))}
                className={dateInput}
              />
            </div>
            <button
              onClick={() => loadTrend()}
              disabled={isLoading}
              className="px-5 py-2 bg-bloom hover:bg-bloom-hover text-white text-sm font-semibold rounded-xl shadow-sm disabled:opacity-40 transition"
            >
              Apply
            </button>
          </div>
        </div>

        {/* ── Trend chart + stats ── */}
        <div ref={chartRef} className="bg-surface rounded-2xl border border-skin-border p-5">
          <TrendGraph
            data={trendData}
            dateRangeStart={dateRangeStart}
            dateRangeEnd={dateRangeEnd}
            isLoading={isLoading}
            error={null}
          />
        </div>

        {/* ── Period comparison ── */}
        <div className="bg-surface rounded-2xl border border-skin-border p-5 space-y-5">
          <div>
            <p className="text-xs font-medium text-on-surface-variant uppercase tracking-widest mb-1">Compare periods</p>
            <p className="text-xs text-on-surface-variant">Select two date ranges to compare your skin progress side by side.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <p className="text-sm font-semibold text-on-surface">Period 1</p>
              <input type="date" value={fmt(comparisonPeriod1Start)}
                max={fmt(comparisonPeriod1End)}
                onChange={e => setComparisonPeriod1Start(new Date(e.target.value))}
                className={dateInput} aria-label="Period 1 start" />
              <p className="text-xs text-on-surface-variant text-center">to</p>
              <input type="date" value={fmt(comparisonPeriod1End)}
                min={fmt(comparisonPeriod1Start)} max={fmt(today)}
                onChange={e => setComparisonPeriod1End(new Date(e.target.value))}
                className={dateInput} aria-label="Period 1 end" />
            </div>
            <div className="space-y-3">
              <p className="text-sm font-semibold text-on-surface">Period 2</p>
              <input type="date" value={fmt(comparisonPeriod2Start)}
                max={fmt(comparisonPeriod2End)}
                onChange={e => setComparisonPeriod2Start(new Date(e.target.value))}
                className={dateInput} aria-label="Period 2 start" />
              <p className="text-xs text-on-surface-variant text-center">to</p>
              <input type="date" value={fmt(comparisonPeriod2End)}
                min={fmt(comparisonPeriod2Start)} max={fmt(today)}
                onChange={e => setComparisonPeriod2End(new Date(e.target.value))}
                className={dateInput} aria-label="Period 2 end" />
            </div>
          </div>

          <button
            onClick={loadComparison}
            disabled={isComparing}
            className="px-5 py-2.5 bg-bloom hover:bg-bloom-hover text-white text-sm font-semibold rounded-xl shadow-sm hover:shadow-md disabled:opacity-40 transition"
          >
            {isComparing ? "Comparing…" : "Compare"}
          </button>

          {comparisonData && (
            <PeriodComparison
              period1Data={comparisonData.period1}
              period2Data={comparisonData.period2}
              period1Name={`${comparisonPeriod1Start.toLocaleDateString()} – ${comparisonPeriod1End.toLocaleDateString()}`}
              period2Name={`${comparisonPeriod2Start.toLocaleDateString()} – ${comparisonPeriod2End.toLocaleDateString()}`}
              isLoading={isComparing}
              error={null}
            />
          )}
        </div>

        {/* ── Export ── */}
        <div className="bg-surface rounded-2xl border border-skin-border p-5">
          <p className="text-xs font-medium text-on-surface-variant uppercase tracking-widest mb-4">Export report</p>
          <ExportReportButton
            dateRangeStart={dateRangeStart}
            dateRangeEnd={dateRangeEnd}
            isDisabled={isLoading || trendData.length === 0}
            onExportStart={() => {}}
            onExportComplete={success => { if (success) setError(null); }}
            chartRef={chartRef}
          />
        </div>

      </main>
    </div>
  );
};

export default EvolutionPage;
