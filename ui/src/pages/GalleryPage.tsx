import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getAuthToken } from "../services/authService";

type SelfieAngle = "front" | "left" | "right";

interface SelfiePhoto {
  url: string;
  uploadedAt: string;
  angle: SelfieAngle | null;
}

interface SelfieDay {
  date: string;
  photos: SelfiePhoto[];
  isComplete: boolean;
}

interface AngleAnalysis {
  label: string;
  confidence: number;
  scores: Record<string, number>;
  heatmap_target?: string;
  heatmap_overlay_data_url?: string | null;
}

interface SetAnalysis {
  overall_label: string;
  overall_confidence: number;
  overall_scores: Record<string, number>;
  per_angle: Record<string, AngleAnalysis>;
  summary: string;
  disclaimer?: string;
}

type SelfiesApiItem = {
  url?: string;
  uploadedAt?: string;
  angle?: SelfieAngle | null;
  date?: string;
  photos?: SelfiePhoto[];
  isComplete?: boolean;
};

const REQUIRED_ANGLES: SelfieAngle[] = ["front", "left", "right"];

const formatAngleLabel = (angle: SelfieAngle) => {
  if (angle === "left") return "Left side";
  if (angle === "right") return "Right side";
  return "Front";
};

const toUtcDateKey = (dateStr: string) => {
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
};

const formatUtcDateLabel = (dateKey: string) => {
  const parsed = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return dateKey;
  return parsed.toLocaleDateString("default", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
};

const toMonthKeyFromDate = (date: Date) => {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};

const toDateFromMonthKey = (monthKey: string) => {
  const [yearPart, monthPart] = monthKey.split("-");
  const year = Number(yearPart);
  const monthIndex = Number(monthPart) - 1;
  return new Date(Date.UTC(year, monthIndex, 1));
};

const addMonths = (monthKey: string, delta: number) => {
  const monthDate = toDateFromMonthKey(monthKey);
  monthDate.setUTCMonth(monthDate.getUTCMonth() + delta);
  return toMonthKeyFromDate(monthDate);
};

const formatMonthLabel = (monthKey: string) => {
  const monthDate = toDateFromMonthKey(monthKey);
  return monthDate.toLocaleDateString("default", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
};

const formatMonthTickFromDateKey = (dateKey: string) => {
  const parsed = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString("default", {
    month: "short",
    timeZone: "UTC",
  });
};

const getVisibleMonthKeys = (endMonthKey: string, count: number) => {
  const monthKeys: string[] = [];
  for (let index = count - 1; index >= 0; index--) {
    monthKeys.push(addMonths(endMonthKey, -index));
  }
  return monthKeys;
};

const buildContinuousWindowDates = (
  startMonthKey: string,
  endMonthKey: string,
) => {
  const startMonth = toDateFromMonthKey(startMonthKey);
  const endMonth = toDateFromMonthKey(endMonthKey);
  const endLastDay = new Date(
    Date.UTC(endMonth.getUTCFullYear(), endMonth.getUTCMonth() + 1, 0),
  );

  const dateKeys: string[] = [];
  const current = new Date(startMonth);
  while (current <= endLastDay) {
    const year = current.getUTCFullYear();
    const month = String(current.getUTCMonth() + 1).padStart(2, "0");
    const day = String(current.getUTCDate()).padStart(2, "0");
    dateKeys.push(`${year}-${month}-${day}`);
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dateKeys;
};

const buildContributionCells = (
  startMonthKey: string,
  endMonthKey: string,
  rows: number,
) => {
  const dateKeys = buildContinuousWindowDates(startMonthKey, endMonthKey);

  const cells: (string | null)[] = [];
  cells.push(...dateKeys);

  while (cells.length % rows !== 0) {
    cells.push(null);
  }

  return cells;
};

const normalizeSelfieDays = (items: unknown): SelfieDay[] => {
  if (!Array.isArray(items)) return [];

  const dayMap = new Map<string, SelfiePhoto[]>();

  for (const rawItem of items as SelfiesApiItem[]) {
    if (
      rawItem &&
      typeof rawItem === "object" &&
      Array.isArray(rawItem.photos)
    ) {
      const dayDate = rawItem.date ?? rawItem.photos[0]?.uploadedAt;
      if (!dayDate) continue;
      const normalizedDate = toUtcDateKey(dayDate);
      if (!normalizedDate) continue;

      const normalizedPhotos = rawItem.photos.filter(
        (photo) => !!photo?.url && !!photo?.uploadedAt,
      );
      dayMap.set(normalizedDate, normalizedPhotos);
      continue;
    }

    if (rawItem?.url && rawItem?.uploadedAt) {
      const bucketDate = toUtcDateKey(rawItem.uploadedAt);
      if (!bucketDate) continue;
      const currentPhotos = dayMap.get(bucketDate) ?? [];
      currentPhotos.push({
        url: rawItem.url,
        uploadedAt: rawItem.uploadedAt,
        angle: rawItem.angle ?? null,
      });
      dayMap.set(bucketDate, currentPhotos);
    }
  }

  return Array.from(dayMap.entries())
    .map(([date, photos]) => {
      const dayAngles = photos
        .map((photo) => photo.angle)
        .filter(
          (angle): angle is SelfieAngle =>
            angle === "front" || angle === "left" || angle === "right",
        );

      return {
        date,
        photos,
        isComplete: REQUIRED_ANGLES.every((angle) => dayAngles.includes(angle)),
      };
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};

const GalleryPage = () => {
  const VISIBLE_MONTHS = 6;
  const CONTRIBUTION_ROWS = 5;
  const { userId } = useParams<{ userId: string }>();
  const [selfieDays, setSelfieDays] = useState<SelfieDay[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [windowEndMonthKey, setWindowEndMonthKey] = useState(() =>
    toMonthKeyFromDate(new Date()),
  );
  const [loading, setLoading] = useState(true);
  const [analysisByDate, setAnalysisByDate] = useState<
    Record<string, SetAnalysis>
  >({});
  const [analysisLoadingByDate, setAnalysisLoadingByDate] = useState<
    Record<string, boolean>
  >({});
  const [analysisErrorByDate, setAnalysisErrorByDate] = useState<
    Record<string, string>
  >({});
  const navigate = useNavigate();

  useEffect(() => {
    const fetchSelfies = async () => {
      const token = getAuthToken();
      if (!token || !userId) {
        navigate("/login");
        return;
      }

      try {
        setLoading(true);
        let allDays: SelfieDay[] = [];
        let page = 1;
        let hasMore = true;

        while (hasMore) {
          const response = await fetch(
            `/api/users/${userId}/selfies?page=${page}&pageSize=30`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            },
          );

          if (!response.ok) {
            hasMore = false;
            continue;
          }

          const data = await response.json();
          const normalizedPage = normalizeSelfieDays(data?.selfies);
          allDays = [...allDays, ...normalizedPage];

          if (page >= data.totalPages) {
            hasMore = false;
          } else {
            page++;
          }
        }

        setSelfieDays(allDays);
      } catch (error) {
        console.error("Failed to fetch selfies", error);
      } finally {
        setLoading(false);
      }
    };

    fetchSelfies();
  }, [userId, navigate]);

  useEffect(() => {
    if (selfieDays.length === 0) return;
    if (selectedDate) return;
    setSelectedDate(selfieDays[0].date);
    const latestSelfieMonth = selfieDays[0].date.slice(0, 7);
    const currentMonth = toMonthKeyFromDate(new Date());
    setWindowEndMonthKey(
      latestSelfieMonth > currentMonth ? latestSelfieMonth : currentMonth,
    );
  }, [selfieDays, selectedDate]);

  const visibleMonthKeys = useMemo(
    () => getVisibleMonthKeys(windowEndMonthKey, VISIBLE_MONTHS),
    [windowEndMonthKey],
  );

  const windowStartMonthKey = visibleMonthKeys[0];

  const contributionCells = useMemo(
    () =>
      buildContributionCells(
        windowStartMonthKey,
        windowEndMonthKey,
        CONTRIBUTION_ROWS,
      ),
    [windowStartMonthKey, windowEndMonthKey],
  );

  const monthTickLabels = useMemo(() => {
    const columnCount = Math.ceil(contributionCells.length / CONTRIBUTION_ROWS);
    const labels: string[] = [];

    for (let columnIndex = 0; columnIndex < columnCount; columnIndex++) {
      const columnStart = columnIndex * CONTRIBUTION_ROWS;
      const columnCells = contributionCells.slice(
        columnStart,
        columnStart + CONTRIBUTION_ROWS,
      );
      const firstOfMonthCell = columnCells.find(
        (dateKey) => !!dateKey && dateKey.endsWith("-01"),
      );

      if (firstOfMonthCell) {
        labels.push(formatMonthTickFromDateKey(firstOfMonthCell));
      } else {
        labels.push("");
      }
    }

    return labels;
  }, [contributionCells]);

  const selfieDayByDate = useMemo(() => {
    return new Map(selfieDays.map((day) => [day.date, day]));
  }, [selfieDays]);

  const selectedDay = selectedDate
    ? selfieDayByDate.get(selectedDate)
    : undefined;
  const visibleMonthSet = new Set(visibleMonthKeys);
  const monthCompleteCount = selfieDays.filter(
    (day) => day.isComplete && visibleMonthSet.has(day.date.slice(0, 7)),
  ).length;

  const goToMonth = (delta: number) => {
    const nextEndMonthKey = addMonths(windowEndMonthKey, delta);
    setWindowEndMonthKey(nextEndMonthKey);

    const nextVisibleMonths = getVisibleMonthKeys(
      nextEndMonthKey,
      VISIBLE_MONTHS,
    );
    const nextVisibleSet = new Set(nextVisibleMonths);
    if (!nextVisibleSet.has(selectedDate.slice(0, 7))) {
      const firstMonth = nextVisibleMonths[0];
      const firstDayOfWindow = `${firstMonth}-01`;
      const firstSelfieInWindow = selfieDays.find((day) =>
        nextVisibleSet.has(day.date.slice(0, 7)),
      );
      setSelectedDate(firstSelfieInWindow?.date ?? firstDayOfWindow);
    }
  };

  const getPhotoForAngle = (
    photos: SelfiePhoto[] | undefined,
    angle: SelfieAngle,
  ) => (photos ?? []).find((photo) => photo.angle === angle);

  const toApiDate = (rawDate: string) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      return rawDate;
    }

    const parsed = new Date(rawDate);
    if (Number.isNaN(parsed.getTime())) {
      return rawDate;
    }

    return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}-${String(parsed.getUTCDate()).padStart(2, "0")}`;
  };

  const formatLabel = (label: string) => label.replaceAll("_", " ");

  const angleOrder: SelfieAngle[] = ["front", "left", "right"];

  const extractErrorMessage = async (response: Response) => {
    const fallback = `Analysis failed (${response.status}). Please try again.`;

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = await response.json().catch(() => null);
      const message =
        body?.message ||
        body?.detail ||
        body?.details ||
        body?.title ||
        body?.error ||
        body?.errors?.[0];

      return typeof message === "string" && message.trim().length > 0
        ? message
        : fallback;
    }

    const textBody = await response.text().catch(() => "");
    return textBody?.trim() ? textBody.trim() : fallback;
  };

  const handleAnalyzeSet = async (day: SelfieDay) => {
    if (!userId) return;

    if (analysisLoadingByDate[day.date]) {
      return;
    }

    const token = getAuthToken();
    if (!token) {
      navigate("/login");
      return;
    }

    const dateKeyValue = day.date;
    const apiDate = toApiDate(day.date);

    setAnalysisLoadingByDate((prev) => ({ ...prev, [dateKeyValue]: true }));
    setAnalysisErrorByDate((prev) => ({ ...prev, [dateKeyValue]: "" }));

    try {
      const response = await fetch(
        `/api/users/${userId}/selfies/${apiDate}/analyze`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) {
        const message = await extractErrorMessage(response);
        setAnalysisErrorByDate((prev) => ({
          ...prev,
          [dateKeyValue]: message,
        }));
        return;
      }

      const data: SetAnalysis = await response.json();
      setAnalysisByDate((prev) => ({ ...prev, [dateKeyValue]: data }));
    } catch {
      setAnalysisErrorByDate((prev) => ({
        ...prev,
        [dateKeyValue]: "Could not run analysis. Please try again.",
      }));
    } finally {
      setAnalysisLoadingByDate((prev) => ({ ...prev, [dateKeyValue]: false }));
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <header className="bg-surface/50 backdrop-blur-md border-b border-slate-700 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <h1 className="text-2xl sm:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-300 to-blue-300 leading-relaxed">
            Your Daily Pic Sets
          </h1>
          <button
            onClick={() => navigate(`/users/${userId}`)}
            className="w-fit py-2 px-4 sm:px-6 rounded-lg font-semibold transition-all duration-300 bg-slate-600 hover:bg-slate-500 border border-slate-400 text-on-surface text-sm sm:text-base"
          >
            ← Back
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-6">
        {loading ? (
          <div className="text-center py-12">
            <p className="text-on-surface-variant">Loading gallery...</p>
          </div>
        ) : selfieDays.length === 0 ? (
          <div className="bg-surface/50 backdrop-blur border border-slate-700 rounded-2xl p-12 text-center">
            <p className="text-on-surface-variant text-lg">No daily sets yet</p>
            <p className="text-on-surface-variant text-sm mt-2">
              Start by taking your first 3-photo set.
            </p>
          </div>
        ) : (
          <>
            <div className="bg-surface/50 backdrop-blur border border-slate-700 rounded-2xl p-4 sm:p-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <p className="text-on-surface font-semibold">
                    Selfie Calendar
                  </p>
                  <p className="text-on-surface-variant text-sm">
                    {monthCompleteCount} complete day
                    {monthCompleteCount !== 1 ? "s" : ""} in displayed months
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-on-surface-variant">
                  <span>Less</span>
                  <span className="w-3 h-3 rounded-[3px] border border-slate-600 bg-transparent" />
                  <span className="w-3 h-3 rounded-[3px] border border-purple-300/40 bg-purple-500/80" />
                  <span>More</span>
                </div>
              </div>

              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={() => goToMonth(-1)}
                  className="py-1.5 px-3 rounded-lg border border-slate-600 text-sm text-on-surface-variant hover:bg-slate-700/50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ← Previous
                </button>
                <p className="text-on-surface text-sm sm:text-base font-semibold">
                  {formatMonthLabel(visibleMonthKeys[0])} -{" "}
                  {formatMonthLabel(
                    visibleMonthKeys[visibleMonthKeys.length - 1],
                  )}
                </p>
                <button
                  onClick={() => goToMonth(1)}
                  className="py-1.5 px-3 rounded-lg border border-slate-600 text-sm text-on-surface-variant hover:bg-slate-700/50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next →
                </button>
              </div>

              <div className="overflow-x-auto pb-1">
                <div className="inline-grid w-fit grid-flow-col auto-cols-max gap-[1px] mb-1">
                  {monthTickLabels.map((label, index) => (
                    <p
                      key={`month-tick-${index}`}
                      className="w-6 h-4 text-[10px] leading-none text-on-surface-variant"
                    >
                      {label}
                    </p>
                  ))}
                </div>

                <div className="inline-grid w-fit grid-flow-col grid-rows-5 auto-cols-max gap-[1px]">
                  {contributionCells.map((dateKey, index) => {
                    if (!dateKey) {
                      return <div key={`empty-${index}`} className="w-6 h-6" />;
                    }

                    const day = selfieDayByDate.get(dateKey);
                    const isComplete = day?.isComplete ?? false;
                    const isSelected = dateKey === selectedDate;

                    return (
                      <button
                        key={dateKey}
                        onClick={() => setSelectedDate(dateKey)}
                        title={`${formatUtcDateLabel(dateKey)}${isComplete ? " • Complete" : " • No complete set"}`}
                        className={`w-6 h-6 rounded-[3px] border transition-all text-[10px] leading-none inline-flex items-center justify-center ${
                          isComplete
                            ? "bg-purple-500/80 hover:bg-purple-400 border-purple-300/40 text-white"
                            : "bg-transparent hover:bg-slate-700/60 border-slate-600 text-on-surface-variant"
                        } ${isSelected ? "ring-2 ring-blue-300/80" : ""}`}
                        aria-label={`Open ${formatUtcDateLabel(dateKey)}`}
                      >
                        {dateKey.slice(8, 10).replace(/^0/, "")}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="bg-surface/50 backdrop-blur border border-slate-700 rounded-2xl p-4 sm:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-on-surface font-semibold">
                  {selectedDate
                    ? formatUtcDateLabel(selectedDate)
                    : "Select a day"}
                </p>
                <span
                  className={`text-xs px-2 py-1 rounded-full border ${
                    selectedDay?.isComplete
                      ? "bg-purple-500/10 border-purple-500/30 text-purple-300"
                      : "bg-slate-700/40 border-slate-600 text-on-surface-variant"
                  }`}
                >
                  {selectedDay?.isComplete ? "Complete set" : "No complete set"}
                </span>
              </div>

              {selectedDay ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {REQUIRED_ANGLES.map((angle) => {
                      const photo = getPhotoForAngle(selectedDay.photos, angle);
                      return photo ? (
                        <div
                          key={`${selectedDay.date}-${angle}`}
                          className="rounded-xl overflow-hidden border border-slate-700"
                        >
                          <img
                            src={photo.url}
                            alt={`${formatAngleLabel(angle)} selfie`}
                            className="w-full aspect-[4/3] object-cover"
                          />
                          <p className="text-center text-xs py-2 text-on-surface-variant bg-slate-900/60">
                            {formatAngleLabel(angle)}
                          </p>
                        </div>
                      ) : (
                        <div
                          key={`${selectedDay.date}-${angle}`}
                          className="rounded-xl border border-dashed border-slate-600 aspect-[4/3] flex items-center justify-center text-on-surface-variant text-xs"
                        >
                          {formatAngleLabel(angle)} missing
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-2 flex flex-col gap-3">
                    <button
                      onClick={() => handleAnalyzeSet(selectedDay)}
                      disabled={analysisLoadingByDate[selectedDay.date]}
                      className="w-fit py-2 px-4 rounded-lg font-semibold transition-all duration-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-300 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {analysisLoadingByDate[selectedDay.date]
                        ? "Analyzing..."
                        : "Analyze Set"}
                    </button>

                    {analysisErrorByDate[selectedDay.date] && (
                      <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
                        {analysisErrorByDate[selectedDay.date]}
                      </div>
                    )}

                    {analysisByDate[selectedDay.date] && (
                      <div className="p-4 rounded-xl border border-blue-500/30 bg-blue-500/10 space-y-2">
                        <p className="text-on-surface font-semibold">
                          {analysisByDate[selectedDay.date].summary}
                        </p>
                        <p className="text-on-surface-variant text-sm">
                          Overall:{" "}
                          {formatLabel(
                            analysisByDate[selectedDay.date].overall_label,
                          )}{" "}
                          (
                          {(
                            analysisByDate[selectedDay.date]
                              .overall_confidence * 100
                          ).toFixed(1)}
                          %)
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-on-surface-variant">
                          {Object.entries(
                            analysisByDate[selectedDay.date].per_angle,
                          ).map(([angle, result]) => (
                            <p key={`${selectedDay.date}-analysis-${angle}`}>
                              {formatLabel(angle)}: {formatLabel(result.label)}{" "}
                              ({(result.confidence * 100).toFixed(1)}%)
                            </p>
                          ))}
                        </div>

                        {angleOrder.some(
                          (angle) =>
                            !!analysisByDate[selectedDay.date].per_angle[angle]
                              ?.heatmap_overlay_data_url,
                        ) && (
                          <div className="pt-1 space-y-2">
                            <p className="text-xs text-on-surface-variant">
                              Heatmap overlay (highlighted problem areas)
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              {angleOrder.map((angle) => {
                                const result =
                                  analysisByDate[selectedDay.date].per_angle[
                                    angle
                                  ];
                                const overlayUrl =
                                  result?.heatmap_overlay_data_url ?? "";

                                if (!overlayUrl) {
                                  return (
                                    <div
                                      key={`${selectedDay.date}-heatmap-${angle}`}
                                      className="rounded-xl border border-dashed border-slate-600 aspect-[4/3] flex items-center justify-center text-[11px] text-on-surface-variant"
                                    >
                                      {formatAngleLabel(angle)} heatmap
                                      unavailable
                                    </div>
                                  );
                                }

                                return (
                                  <div
                                    key={`${selectedDay.date}-heatmap-${angle}`}
                                    className="rounded-xl overflow-hidden border border-slate-700"
                                  >
                                    <img
                                      src={overlayUrl}
                                      alt={`${formatAngleLabel(angle)} heatmap overlay`}
                                      className="w-full aspect-[4/3] object-cover"
                                    />
                                    <p className="text-center text-[11px] py-2 text-on-surface-variant bg-slate-900/60">
                                      {formatAngleLabel(angle)} heatmap
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {analysisByDate[selectedDay.date].disclaimer && (
                          <p className="text-[11px] text-on-surface-variant">
                            {analysisByDate[selectedDay.date].disclaimer}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-600 p-6 text-sm text-on-surface-variant">
                  No selfie set for this day.
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default GalleryPage;
