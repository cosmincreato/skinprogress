import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { TrendData } from "../components/evolution/TrendGraph";
import TrendGraph from "../components/evolution/TrendGraph";
import ExportReportButton from "../components/evolution/ExportReportButton";
import PeriodComparison from "../components/evolution/PeriodComparison";
import { getAuthToken } from "../services/authService";

export const EvolutionPage: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"trends" | "comparison">("trends");
  const [dateRangeStart, setDateRangeStart] = useState<Date>(
    new Date(new Date().setDate(new Date().getDate() - 30)),
  );
  const [dateRangeEnd, setDateRangeEnd] = useState<Date>(new Date());
  const [comparisonPeriod1Start, setComparisonPeriod1Start] = useState<Date>(
    new Date(new Date().setDate(new Date().getDate() - 60)),
  );
  const [comparisonPeriod1End, setComparisonPeriod1End] = useState<Date>(
    new Date(new Date().setDate(new Date().getDate() - 30)),
  );
  const [comparisonPeriod2Start, setComparisonPeriod2Start] = useState<Date>(
    new Date(new Date().setDate(new Date().getDate() - 30)),
  );
  const [comparisonPeriod2End, setComparisonPeriod2End] = useState<Date>(new Date());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trendData, setTrendData] = useState<TrendData[]>([]);
  const [comparisonData, setComparisonData] = useState<{ period1: TrendData[]; period2: TrendData[] }>({ period1: [], period2: [] });

  useEffect(() => { fetchTrendData(); }, []);

  const formatDateForApi = (date: Date): string => date.toISOString().split("T")[0];

  const handleUnauthorized = () => {
    ["jwt", "accessToken", "refreshToken", "userId", "userEmail", "username"].forEach(k =>
      localStorage.removeItem(k)
    );
    navigate("/login");
  };

  const fetchTrendData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const token = getAuthToken();
      const response = await fetch(
        `/api/evolution/dashboard?dateRangeStart=${formatDateForApi(dateRangeStart)}&dateRangeEnd=${formatDateForApi(dateRangeEnd)}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (response.status === 401) { handleUnauthorized(); return; }
      if (!response.ok) throw new Error(`Failed to load trend data (${response.status})`);
      const apiResponse = await response.json();
      setTrendData(transformResults(apiResponse.data?.analysisResults));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load trend data");
      setTrendData([]);
    } finally {
      setIsLoading(false);
    }
  };

  const transformResults = (results: any[]): TrendData[] =>
    (results || []).map((result: any) => {
      const acne = result.severityScores?.acne || 0;
      const under_eye_bags = result.severityScores?.under_eye_bags || 0;
      const redness = result.severityScores?.redness || 0;
      return {
        date: new Date(result.timestamp).toISOString().split("T")[0],
        overallSeverity: (acne + under_eye_bags + redness) / 3,
        acne, under_eye_bags, redness,
      };
    });

  const fetchComparisonData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const token = getAuthToken();
      const [r1, r2] = await Promise.all([
        fetch(`/api/evolution/dashboard?dateRangeStart=${formatDateForApi(comparisonPeriod1Start)}&dateRangeEnd=${formatDateForApi(comparisonPeriod1End)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }),
        fetch(`/api/evolution/dashboard?dateRangeStart=${formatDateForApi(comparisonPeriod2Start)}&dateRangeEnd=${formatDateForApi(comparisonPeriod2End)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }),
      ]);
      if (r1.status === 401 || r2.status === 401) { handleUnauthorized(); return; }
      if (!r1.ok || !r2.ok) throw new Error("Failed to fetch comparison data");
      const [d1, d2] = await Promise.all([r1.json(), r2.json()]);
      setComparisonData({ period1: transformResults(d1.data?.analysisResults), period2: transformResults(d2.data?.analysisResults) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load comparison data");
      setComparisonData({ period1: [], period2: [] });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDateRangeChange = async (start: Date, end: Date) => {
    if (end < start) { setError("End date cannot be before start date"); return; }
    if (end > new Date()) { setError("End date cannot be in the future"); return; }
    setError(null);
    setDateRangeStart(start);
    setDateRangeEnd(end);
    setIsLoading(true);
    try {
      const token = getAuthToken();
      const response = await fetch(
        `/api/evolution/dashboard?dateRangeStart=${formatDateForApi(start)}&dateRangeEnd=${formatDateForApi(end)}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (response.status === 401) { handleUnauthorized(); return; }
      if (!response.ok) throw new Error("Failed to fetch metrics");
      const apiResponse = await response.json();
      setTrendData(transformResults(apiResponse.data?.analysisResults));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setIsLoading(false);
    }
  };

  const handleTabChange = async (tab: "trends" | "comparison") => {
    setActiveTab(tab);
    if (tab === "comparison" && comparisonData.period1.length === 0) await fetchComparisonData();
  };

  const dateInputClass = "px-3 py-2 bg-surface-warm border border-skin-border rounded-xl text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition w-full";

  return (
    <div className="bg-background min-h-screen">
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-7">

        {/* ── Page header ── */}
        <div>
          <h2 className="font-display text-4xl sm:text-5xl text-on-surface">Evolution</h2>
          <p className="text-on-surface-variant text-sm mt-1">Track your skin's progress over time</p>
        </div>

        {/* ── Error ── */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* ── Tab bar ── */}
        <div className="flex gap-0.5 p-1 bg-surface-warm rounded-xl border border-skin-border w-fit" role="tablist">
          {(["trends", "comparison"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => handleTabChange(tab)}
              disabled={isLoading}
              role="tab"
              aria-selected={activeTab === tab}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab
                  ? "bg-surface text-on-surface shadow-sm border border-skin-border"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              {tab === "trends" ? "Trends" : "Compare periods"}
            </button>
          ))}
        </div>

        {/* ── Loading ── */}
        {isLoading && (
          <div className="flex items-center justify-center py-16" role="status">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              <p className="text-sm text-on-surface-variant">Loading your analysis…</p>
            </div>
          </div>
        )}

        {!isLoading && (
          <>
            {/* ── Trends tab ── */}
            {activeTab === "trends" && (
              <div className="space-y-6">
                {/* Date range */}
                <div className="bg-surface rounded-2xl border border-skin-border p-5">
                  <p className="text-xs font-medium text-on-surface-variant uppercase tracking-widest mb-4">Date range</p>
                  <div className="flex flex-wrap gap-3 mb-4">
                    {[
                      { label: "Last 7 days",  days: 7  },
                      { label: "Last 30 days", days: 30 },
                    ].map(({ label, days }) => (
                      <button
                        key={days}
                        onClick={() => {
                          const start = new Date();
                          start.setDate(start.getDate() - days);
                          handleDateRangeChange(start, new Date());
                        }}
                        disabled={isLoading}
                        className="px-4 py-2 bg-surface-warm border-2 border-skin-border rounded-xl text-xs font-medium text-on-surface hover:bg-primary/8 hover:border-primary/40 hover:text-primary"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-on-surface-variant">
                    {formatDateForApi(dateRangeStart)} → {formatDateForApi(dateRangeEnd)}
                  </p>
                </div>

                {/* Chart */}
                <div className="bg-surface rounded-2xl border border-skin-border p-5">
                  <TrendGraph
                    data={trendData}
                    dateRangeStart={dateRangeStart}
                    dateRangeEnd={dateRangeEnd}
                    isLoading={isLoading}
                    error={null}
                  />
                </div>

                {/* Export */}
                <div className="bg-surface rounded-2xl border border-skin-border p-5">
                  <p className="text-xs font-medium text-on-surface-variant uppercase tracking-widest mb-4">Export report</p>
                  <ExportReportButton
                    dateRangeStart={dateRangeStart}
                    dateRangeEnd={dateRangeEnd}
                    isDisabled={isLoading || trendData.length === 0}
                    onExportStart={() => {}}
                    onExportComplete={success => { if (success) setError(null); }}
                  />
                </div>
              </div>
            )}

            {/* ── Comparison tab ── */}
            {activeTab === "comparison" && (
              <div className="space-y-6">
                <div className="bg-surface rounded-2xl border border-skin-border p-5">
                  <p className="text-xs font-medium text-on-surface-variant uppercase tracking-widest mb-5">Select periods</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div className="space-y-3">
                      <p className="text-sm font-semibold text-on-surface">Period 1</p>
                      <input type="date" value={comparisonPeriod1Start.toISOString().split("T")[0]}
                        onChange={e => setComparisonPeriod1Start(new Date(e.target.value))}
                        className={dateInputClass} aria-label="Period 1 start date" />
                      <p className="text-xs text-on-surface-variant text-center">to</p>
                      <input type="date" value={comparisonPeriod1End.toISOString().split("T")[0]}
                        onChange={e => setComparisonPeriod1End(new Date(e.target.value))}
                        className={dateInputClass} aria-label="Period 1 end date" />
                    </div>
                    <div className="space-y-3">
                      <p className="text-sm font-semibold text-on-surface">Period 2</p>
                      <input type="date" value={comparisonPeriod2Start.toISOString().split("T")[0]}
                        onChange={e => setComparisonPeriod2Start(new Date(e.target.value))}
                        className={dateInputClass} aria-label="Period 2 start date" />
                      <p className="text-xs text-on-surface-variant text-center">to</p>
                      <input type="date" value={comparisonPeriod2End.toISOString().split("T")[0]}
                        onChange={e => setComparisonPeriod2End(new Date(e.target.value))}
                        className={dateInputClass} aria-label="Period 2 end date" />
                    </div>
                  </div>
                  <button
                    onClick={fetchComparisonData}
                    disabled={isLoading}
                    className="px-5 py-2.5 bg-bloom hover:bg-bloom-hover text-white text-sm font-semibold rounded-xl shadow-sm hover:shadow-md disabled:opacity-50"
                  >
                    Compare
                  </button>
                </div>

                <PeriodComparison
                  period1Data={comparisonData.period1}
                  period2Data={comparisonData.period2}
                  period1Name={`${comparisonPeriod1Start.toLocaleDateString()} – ${comparisonPeriod1End.toLocaleDateString()}`}
                  period2Name={`${comparisonPeriod2Start.toLocaleDateString()} – ${comparisonPeriod2End.toLocaleDateString()}`}
                  isLoading={isLoading}
                  error={null}
                />
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default EvolutionPage;
