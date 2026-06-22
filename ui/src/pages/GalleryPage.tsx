import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Face3DModel } from "../components/Face3DModel";
import { HeatmapOverlay, type Detection } from "../components/HeatmapOverlay";
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
  detections?: Detection[];
}

interface SetAnalysis {
  overall_label: string;
  overall_confidence: number;
  overall_scores: Record<string, number>;
  per_angle: Record<string, AngleAnalysis>;
  summary: string;
  disclaimer?: string;
  metadata?: {
    timestamp?: string;
    status?: string;
    acneSeverity?: number;
    rednessSeverity?: number;
    inflammationSeverity?: number;
  };
}

interface CareRecommendation {
  id: string;
  title: string;
  description: string;
  when: "morning" | "evening" | "lifestyle";
  priority: "urgent" | "recommended" | "optional";
  metric: string;
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
  const [compareMode, setCompareMode] = useState(false);
  const [compareDate, setCompareDate] = useState<string>("");
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [activeTrendMetrics, setActiveTrendMetrics] = useState<string[]>([
    "acne",
    "redness",
  ]);
  const [activeTab, setActiveTab] = useState<"gallery" | "care">("gallery");
  const navigate = useNavigate();

  useEffect(() => {
    const fetchAllAnalyses = async () => {
      if (!userId) return;

      const token = getAuthToken();
      if (!token) return;

      try {
        const response = await fetch(`/api/users/${userId}/analyses`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          console.error("Failed to fetch analyses");
          return;
        }

        const analyses = await response.json();
        console.log("Fetched analyses from backend:", analyses);

        // Convert database records to SetAnalysis format
        const analysisMap: Record<string, SetAnalysis> = {};
        analyses.forEach(
          (analysis: {
            date: string;
            acneSeverity?: number;
            rednessSeverity?: number;
            underEyeBagsSeverity?: number;
            heatmapImageUrl?: string;
            heatmapFrontUrl?: string;
            heatmapLeftUrl?: string;
            heatmapRightUrl?: string;
            detectionsFront?: string | null;
            detectionsLeft?: string | null;
            detectionsRight?: string | null;
            timestamp?: string;
            status?: string;
          }) => {
            console.log(
              `Processing analysis for ${analysis.date}:`,
              `acneSeverity=${analysis.acneSeverity}, rednessSeverity=${analysis.rednessSeverity}, underEyeBagsSeverity=${analysis.underEyeBagsSeverity}`,
              `frontUrl=${analysis.heatmapFrontUrl}, leftUrl=${analysis.heatmapLeftUrl}, rightUrl=${analysis.heatmapRightUrl}`,
            );

            const frontUrl =
              analysis.heatmapFrontUrl || analysis.heatmapImageUrl || undefined;
            const leftUrl = analysis.heatmapLeftUrl || undefined;
            const rightUrl = analysis.heatmapRightUrl || undefined;

            console.log(
              `  Final URLs: front=${frontUrl}, left=${leftUrl}, right=${rightUrl}`,
            );

            const parseDets = (json?: string | null): Detection[] => {
              try { return json ? JSON.parse(json) : []; }
              catch { return []; }
            };
            const frontDets = parseDets(analysis.detectionsFront);
            const leftDets = parseDets(analysis.detectionsLeft);
            const rightDets = parseDets(analysis.detectionsRight);

            const overallScores: Record<string, number> = {
              acne: (analysis.acneSeverity ?? 0) / 10,
              redness: (analysis.rednessSeverity ?? 0) / 10,
            };
            if (analysis.underEyeBagsSeverity != null) {
              overallScores.under_eye_bags = analysis.underEyeBagsSeverity / 10;
            }

            analysisMap[analysis.date] = {
              overall_label: "completed",
              overall_confidence: 1.0,
              overall_scores: overallScores,
              per_angle: {
                front: {
                  label: "completed",
                  confidence: 1.0,
                  scores: overallScores,
                  heatmap_overlay_data_url: frontUrl,
                  detections: frontDets,
                },
                left: {
                  label: "completed",
                  confidence: 1.0,
                  scores: overallScores,
                  heatmap_overlay_data_url: leftUrl,
                  detections: leftDets,
                },
                right: {
                  label: "completed",
                  confidence: 1.0,
                  scores: overallScores,
                  heatmap_overlay_data_url: rightUrl,
                  detections: rightDets,
                },
              },
              summary: "Analysis from database",
              metadata: {
                timestamp: analysis.timestamp,
                status: analysis.status,
                acneSeverity: analysis.acneSeverity,
                rednessSeverity: analysis.rednessSeverity,
              },
            };
          },
        );

        console.log("Analysis map created:", analysisMap);
        setAnalysisByDate(analysisMap);
      } catch (error) {
        console.error("Failed to fetch all analyses:", error);
      }
    };

    fetchAllAnalyses();
  }, [userId]);

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

  const analyzedDates = useMemo(
    () => Object.keys(analysisByDate).sort(),
    [analysisByDate],
  );

  const trendData = useMemo(() => {
    return analyzedDates
      .filter((date) => visibleMonthSet.has(date.slice(0, 7)))
      .map((date) => {
        const a = analysisByDate[date];
        const point: Record<string, number | string> = { date };
        Object.entries(a.overall_scores).forEach(([key, val]) => {
          point[key] = +(val * 10).toFixed(1);
        });
        return point;
      });
  }, [analyzedDates, analysisByDate, visibleMonthSet]);

  const compareAnalysis = compareDate ? analysisByDate[compareDate] : undefined;
  const compareDay = compareDate ? selfieDayByDate.get(compareDate) : undefined;

  const recommendations = useMemo((): CareRecommendation[] => {
    if (analyzedDates.length === 0) return [];

    const recentDates = analyzedDates.slice(-7);

    const getAvg = (metric: string) => {
      const vals = recentDates
        .map((d) => analysisByDate[d]?.overall_scores[metric])
        .filter((v): v is number => v != null);
      return vals.length === 0
        ? 0
        : vals.reduce((a, b) => a + b, 0) / vals.length;
    };

    const getTrend = (metric: string) => {
      const vals = recentDates
        .map((d) => analysisByDate[d]?.overall_scores[metric])
        .filter((v): v is number => v != null);
      return vals.length < 2 ? 0 : vals[vals.length - 1] - vals[0];
    };

    const acne = getAvg("acne") * 10;
    const redness = getAvg("redness") * 10;
    const eye = getAvg("under_eye_bags") * 10;
    const acneTrend = getTrend("acne");
    const rednessTrend = getTrend("redness");

    const recs: CareRecommendation[] = [];

    if (acne >= 6) {
      recs.push({
        id: "acne-cleanser",
        title: "Salicylic Acid Cleanser (2%)",
        description:
          "Your acne level is elevated. Use a 2% salicylic acid cleanser twice daily to unclog pores and control excess oil.",
        when: "morning",
        priority: "urgent",
        metric: "acne",
      });
      recs.push({
        id: "acne-spot",
        title: "Benzoyl Peroxide Spot Treatment",
        description:
          "Apply a 2.5–5% benzoyl peroxide treatment to active spots before bed. Start every other night if your skin is sensitive.",
        when: "evening",
        priority: "urgent",
        metric: "acne",
      });
      recs.push({
        id: "acne-pillow",
        title: "Change Pillowcase Twice a Week",
        description:
          "Bacteria and oil accumulate on pillowcases overnight and re-clog pores. Fresh fabric makes a measurable difference.",
        when: "lifestyle",
        priority: "recommended",
        metric: "acne",
      });
    } else if (acne >= 3) {
      recs.push({
        id: "acne-mild",
        title: "Gentle BHA or Niacinamide Cleanser",
        description:
          "Mild acne detected. A low-concentration BHA or niacinamide cleanser will keep pores clear without over-stripping your skin barrier.",
        when: "morning",
        priority: "recommended",
        metric: "acne",
      });
    }

    if (acneTrend > 0.15) {
      recs.push({
        id: "acne-diet",
        title: "Review Diet & Stress Levels",
        description:
          "Acne is trending upward over your recent analyses. High-glycemic foods, dairy, and stress are common triggers — consider keeping a food diary this week.",
        when: "lifestyle",
        priority: "recommended",
        metric: "acne",
      });
    }

    if (redness >= 5) {
      recs.push({
        id: "redness-spf",
        title: "Mineral SPF 30+ Every Morning",
        description:
          "UV light worsens redness and inflammation. Apply a mineral sunscreen (zinc oxide or titanium dioxide) as the last step of your morning routine.",
        when: "morning",
        priority: "urgent",
        metric: "redness",
      });
      recs.push({
        id: "redness-nia",
        title: "Niacinamide 5–10% Serum",
        description:
          "Niacinamide strengthens the skin barrier and visibly reduces redness over 2–4 weeks. Apply after cleansing, before moisturizer.",
        when: "evening",
        priority: "recommended",
        metric: "redness",
      });
      recs.push({
        id: "redness-temp",
        title: "Use Lukewarm Water When Cleansing",
        description:
          "Hot water dilates capillaries and triggers flushing. Switch to lukewarm water when washing your face.",
        when: "lifestyle",
        priority: "recommended",
        metric: "redness",
      });
    } else if (redness >= 3) {
      recs.push({
        id: "redness-fragfree",
        title: "Switch to Fragrance-Free Products",
        description:
          "Moderate redness detected. Fragrance is one of the top skin irritants — switching to fragrance-free cleansers and moisturizers is the easiest first step.",
        when: "morning",
        priority: "recommended",
        metric: "redness",
      });
    }

    if (rednessTrend > 0.15) {
      recs.push({
        id: "redness-patch",
        title: "Patch Test Any New Products",
        description:
          "Redness is trending up in your recent analyses. A new product may be causing irritation — patch test on your inner arm before applying to your face.",
        when: "lifestyle",
        priority: "recommended",
        metric: "redness",
      });
    }

    if (eye >= 4) {
      recs.push({
        id: "eye-sleep",
        title: "Consistent 7–9 Hours of Sleep",
        description:
          "Dark circles are strongly linked to sleep deprivation. Consistent sleep timing — even on weekends — has more impact than total hours alone.",
        when: "lifestyle",
        priority: "urgent",
        metric: "under_eye_bags",
      });
      recs.push({
        id: "eye-cream",
        title: "Caffeine Eye Cream (Morning)",
        description:
          "Caffeine constricts blood vessels and temporarily reduces puffiness. Apply with light tapping motions under the eye after moisturizer.",
        when: "morning",
        priority: "recommended",
        metric: "under_eye_bags",
      });
      recs.push({
        id: "eye-sodium",
        title: "Reduce Sodium to Under 2,300 mg/day",
        description:
          "High sodium causes fluid retention around the eyes. Cutting processed foods and restaurant meals has a quick visible effect.",
        when: "lifestyle",
        priority: "recommended",
        metric: "under_eye_bags",
      });
    } else if (eye >= 2) {
      recs.push({
        id: "eye-elevate",
        title: "Sleep with Head Slightly Elevated",
        description:
          "Mild dark circles noted. An extra pillow helps prevent fluid pooling under the eyes overnight.",
        when: "lifestyle",
        priority: "optional",
        metric: "under_eye_bags",
      });
    }

    recs.push({
      id: "moisturize",
      title: "Lightweight Non-Comedogenic Moisturizer",
      description:
        "Hydration is essential for every skin type. A well-moisturized barrier heals faster and resists both acne and redness.",
      when: "morning",
      priority: "recommended",
      metric: "general",
    });

    if (acne < 3 && redness < 3 && eye < 2) {
      recs.push({
        id: "maintenance",
        title: "Keep Your Current Routine",
        description:
          "Your skin metrics are looking good across the board. Consistency is the most powerful skincare ingredient — keep doing what you're doing.",
        when: "lifestyle",
        priority: "optional",
        metric: "general",
      });
    }

    const order: Record<CareRecommendation["priority"], number> = {
      urgent: 0,
      recommended: 1,
      optional: 2,
    };
    return recs.sort((a, b) => order[a.priority] - order[b.priority]);
  }, [analyzedDates, analysisByDate]);

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

  const METRIC_COLORS: Record<string, string> = {
    acne: "#f87171",
    redness: "#c084fc",
    under_eye_bags: "#60a5fa",
    inflammation: "#fb923c",
  };

  const METRIC_LABEL: Record<string, string> = {
    acne: "Acne",
    redness: "Redness",
    under_eye_bags: "Dark Circles",
    inflammation: "Inflammation",
  };

  const MONTH_COLORS: Record<number, { bg: string; text: string; border: string }> = {
    1: { bg: "#7B8B9C", text: "white", border: "#5B6B7C" }, // January - soft steel blue
    2: { bg: "#D4607A", text: "white", border: "#B84060" }, // February - bloom light
    3: { bg: "#8B9E88", text: "white", border: "#6B7E68" }, // March - sage
    4: { bg: "#C5A892", text: "white", border: "#A58872" }, // April - soft taupe
    5: { bg: "#B8A89C", text: "white", border: "#988C7C" }, // May - warm gray
    6: { bg: "#D4A574", text: "white", border: "#B48554" }, // June - warm gold
    7: { bg: "#C17F60", text: "white", border: "#A15F40" }, // July - terracotta
    8: { bg: "#E87894", text: "white", border: "#C85874" }, // August - bloom dark
    9: { bg: "#A88070", text: "white", border: "#886050" }, // September - rust
    10: { bg: "#C87555", text: "white", border: "#A85535" }, // October - burnt sienna
    11: { bg: "#6B8070", text: "white", border: "#4B6050" }, // November - deep sage
    12: { bg: "#5B7B9C", text: "white", border: "#3B5B7C" }, // December - deep blue
  };

  return (
    <div className="bg-background min-h-screen">
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-6">

        {/* Page header */}
        <div>
          <h2 className="font-display text-4xl sm:text-5xl text-on-surface">Gallery</h2>
          <p className="text-on-surface-variant text-sm mt-1">Your daily photo sets</p>
        </div>

        <div className="flex gap-0.5 p-1 bg-surface-warm rounded-xl border border-skin-border w-fit">
          {(["gallery", "care"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab
                  ? "bg-surface text-on-surface shadow-sm border border-skin-border"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              {tab === "gallery" ? "Gallery" : "Recommended care"}
            </button>
          ))}
        </div>

        {activeTab === "gallery" &&
          (loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                <p className="text-sm text-on-surface-variant">Loading gallery…</p>
              </div>
            </div>
          ) : selfieDays.length === 0 ? (
            <div className="bg-surface border border-dashed border-skin-border rounded-2xl p-12 text-center">
              <p className="text-on-surface-variant text-sm">
                No daily sets yet — start by taking your first 3-photo set.
              </p>
            </div>
          ) : (
            <>
              <div className="bg-surface border border-skin-border rounded-2xl p-4 sm:p-6">
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
                    <span className="w-3 h-3 rounded-[3px] border border-skin-border bg-surface-warm" />
                    <span className="w-3 h-3 rounded-[3px] border border-bloom bg-bloom" />
                    <span>More</span>
                  </div>
                </div>

                <div className="flex items-center justify-between mb-4">
                  <button
                    onClick={() => goToMonth(-1)}
                    className="py-1.5 px-3 rounded-lg border-2 border-skin-border bg-surface-warm text-sm text-on-surface hover:bg-primary/8 hover:border-primary/40 hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    ← Previous
                  </button>
                  <p className="text-on-surface text-sm sm:text-base font-medium">
                    {formatMonthLabel(visibleMonthKeys[0])} —{" "}
                    {formatMonthLabel(
                      visibleMonthKeys[visibleMonthKeys.length - 1],
                    )}
                  </p>
                  <button
                    onClick={() => goToMonth(1)}
                    className="py-1.5 px-3 rounded-lg border-2 border-skin-border bg-surface-warm text-sm text-on-surface hover:bg-primary/8 hover:border-primary/40 hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next →
                  </button>
                </div>

                <div className="overflow-x-auto pb-1">
                  <div className="inline-grid w-fit grid-flow-col auto-cols-max gap-[1px] mb-1">
                    {monthTickLabels.map((label, columnIndex) => {
                      let monthNum = 1;
                      if (label) {
                        const columnStart = columnIndex * 5;
                        const columnCells = contributionCells.slice(columnStart, columnStart + 5);
                        const firstOfMonthCell = columnCells.find(
                          (dateKey) => !!dateKey && dateKey.endsWith("-01"),
                        );
                        if (firstOfMonthCell) {
                          monthNum = parseInt(firstOfMonthCell.split("-")[1], 10);
                        }
                      }
                      const monthColor = MONTH_COLORS[monthNum];
                      return label ? (
                        <div
                          key={`month-tick-${columnIndex}`}
                          className="w-6 h-5 text-[9px] font-semibold leading-none flex items-center justify-center rounded px-0.5 border"
                          style={{
                            backgroundColor: monthColor.bg,
                            color: monthColor.text,
                            borderColor: monthColor.border,
                          }}
                          title={label}
                        >
                          {label}
                        </div>
                      ) : (
                        <div key={`month-tick-${columnIndex}`} className="w-6 h-5" />
                      );
                    })}
                  </div>

                  <div className="inline-grid w-fit grid-flow-col grid-rows-5 auto-cols-max gap-[1px]">
                    {contributionCells.map((dateKey, index) => {
                      if (!dateKey) {
                        return (
                          <div key={`empty-${index}`} className="w-6 h-6" />
                        );
                      }

                      const day = selfieDayByDate.get(dateKey);
                      const isComplete = day?.isComplete ?? false;
                      const isSelected = dateKey === selectedDate;
                      const monthNum = parseInt(dateKey.split("-")[1], 10);
                      const monthColor = MONTH_COLORS[monthNum];
                      const isHovered = hoveredDate === dateKey;

                      return (
                        <div key={dateKey} className="relative w-6 h-6">
                          {isHovered && (
                            <div
                              className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 text-on-surface text-[11px] font-medium px-2.5 py-1.5 rounded-md border border-skin-border shadow-md whitespace-nowrap pointer-events-none z-50"
                              style={{ backgroundColor: "rgb(var(--color-surface))" }}
                            >
                              {formatUtcDateLabel(dateKey)}
                            </div>
                          )}
                          <button
                            onClick={() => setSelectedDate(dateKey)}
                            onMouseEnter={() => setHoveredDate(dateKey)}
                            onMouseLeave={() => setHoveredDate(null)}
                            className={`w-6 h-6 rounded-[3px] border transition-all text-[10px] leading-none inline-flex items-center justify-center hover:scale-110 hover:shadow-md ${
                              isComplete
                                ? "bg-bloom hover:bg-bloom-hover text-white"
                                : "bg-surface-warm hover:bg-surface text-on-surface-variant"
                            } ${isSelected ? "ring-2 ring-primary/60" : ""}`}
                            style={{
                              borderColor: monthColor.border,
                              borderWidth: "1px",
                            }}
                            aria-label={`Open ${formatUtcDateLabel(dateKey)}`}
                          >
                            {dateKey.slice(8, 10).replace(/^0/, "")}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {trendData.length >= 2 && (
                <div className="bg-surface border border-skin-border rounded-2xl p-4 sm:p-6">
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <div>
                      <p className="text-on-surface font-semibold">Trends</p>
                      <p className="text-on-surface-variant text-xs">
                        {trendData.length} analyzed day
                        {trendData.length !== 1 ? "s" : ""} in view
                      </p>
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      {Object.keys(METRIC_COLORS)
                        .filter((k) => trendData.some((d) => k in d))
                        .map((metric) => {
                          const active = activeTrendMetrics.includes(metric);
                          return (
                            <button
                              key={metric}
                              onClick={() =>
                                setActiveTrendMetrics((prev) =>
                                  active
                                    ? prev.filter((m) => m !== metric)
                                    : [...prev, metric],
                                )
                              }
                              className="text-xs px-2.5 py-1 rounded-full border transition-all"
                              style={{
                                backgroundColor: active
                                  ? METRIC_COLORS[metric] + "33"
                                  : "transparent",
                                borderColor: active
                                  ? METRIC_COLORS[metric]
                                  : "#E8DDD4",
                                color: active
                                  ? METRIC_COLORS[metric]
                                  : "#8C7B6E",
                              }}
                            >
                              {METRIC_LABEL[metric] ?? formatLabel(metric)}
                            </button>
                          );
                        })}
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart
                      data={trendData}
                      margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#E8DDD4" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 10, fill: "#8C7B6E" }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value: string) => value.slice(5)}
                      />
                      <YAxis
                        domain={[0, 10]}
                        tick={{ fontSize: 10, fill: "#8C7B6E" }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "#FFFFFF",
                          border: "1px solid #E8DDD4",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                        labelStyle={{ color: "#3D2B20", marginBottom: 4 }}
                        formatter={(value: number, name: string) => [
                          `${value}/10`,
                          METRIC_LABEL[name] ?? formatLabel(name),
                        ]}
                        labelFormatter={(label: string) =>
                          formatUtcDateLabel(label)
                        }
                      />
                      {activeTrendMetrics.map((metric) => (
                        <Line
                          key={metric}
                          type="monotone"
                          dataKey={metric}
                          stroke={METRIC_COLORS[metric]}
                          strokeWidth={2}
                          dot={{
                            r: 3,
                            fill: METRIC_COLORS[metric],
                            strokeWidth: 0,
                          }}
                          activeDot={{ r: 5 }}
                          connectNulls
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="bg-surface border border-skin-border rounded-2xl p-4 sm:p-6 space-y-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-on-surface font-semibold">
                      {selectedDate
                        ? formatUtcDateLabel(selectedDate)
                        : "Select a day"}
                    </p>
                    {selectedDate && analysisByDate[selectedDate] && (
                      <button
                        onClick={() => {
                          setCompareMode((prev) => !prev);
                          setCompareDate("");
                        }}
                        className="text-xs px-2.5 py-1 rounded-full border transition-all"
                        style={{
                          backgroundColor: compareMode
                            ? "#10b98133"
                            : "transparent",
                          borderColor: compareMode ? "#10b981" : "#475569",
                          color: compareMode ? "#6ee7b7" : "#94a3b8",
                        }}
                      >
                        {compareMode ? "✕ Exit Compare" : "Compare"}
                      </button>
                    )}
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded-full border ${
                      selectedDay?.isComplete
                        ? "bg-bloom/10 border-bloom/30 text-bloom"
                        : "bg-surface-warm border-skin-border text-on-surface-variant"
                    }`}
                  >
                    {selectedDay?.isComplete
                      ? "Complete set"
                      : "No complete set"}
                  </span>
                </div>

                {compareMode && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="text-xs text-on-surface-variant">
                      Compare with:
                    </label>
                    <select
                      value={compareDate}
                      onChange={(e) => setCompareDate(e.target.value)}
                      className="appearance-none bg-surface-warm border border-skin-border rounded-lg px-2 py-1 text-sm text-on-surface focus:outline-none cursor-pointer"
                    >
                      <option value="">Select a date…</option>
                      {analyzedDates
                        .filter((d) => d !== selectedDate)
                        .map((d) => (
                          <option key={d} value={d}>
                            {formatUtcDateLabel(d)}
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                {selectedDay ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {REQUIRED_ANGLES.map((angle) => {
                        const photo = getPhotoForAngle(
                          selectedDay.photos,
                          angle,
                        );
                        return photo ? (
                          <div
                            key={`${selectedDay.date}-${angle}`}
                            className="relative rounded-xl overflow-hidden border border-skin-border"
                          >
                            <img
                              src={photo.url}
                              alt={`${formatAngleLabel(angle)} selfie`}
                              className="w-full aspect-[4/3] object-cover"
                            />
                            <p className="absolute bottom-0 inset-x-0 text-center text-xs py-1.5 text-white bg-black/30">
                              {formatAngleLabel(angle)}
                            </p>
                          </div>
                        ) : (
                          <div
                            key={`${selectedDay.date}-${angle}`}
                            className="rounded-xl border border-dashed border-skin-border aspect-[4/3] flex items-center justify-center text-on-surface-variant text-xs bg-surface-warm"
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
                        className="w-fit py-2 px-4 rounded-lg font-semibold bg-bloom hover:bg-bloom-hover text-white text-sm shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
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
                        <div className="rounded-2xl border border-skin-border bg-surface-warm p-4 space-y-4">
                          {analysisByDate[selectedDay.date].summary !==
                            "Analysis from database" && (
                            <p className="text-on-surface-variant text-sm leading-relaxed">
                              {analysisByDate[selectedDay.date].summary}
                            </p>
                          )}

                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {Object.entries(
                              analysisByDate[selectedDay.date].overall_scores,
                            ).map(([key, score]) => {
                              const color = METRIC_COLORS[key] ?? "#94a3b8";
                              const label =
                                METRIC_LABEL[key] ?? formatLabel(key);
                              const display = score * 10;
                              return (
                                <div
                                  key={`${selectedDay.date}-score-${key}`}
                                  className="rounded-xl bg-surface border border-skin-border p-3 space-y-2"
                                  style={{ borderLeft: `3px solid ${color}` }}
                                >
                                  <div className="flex items-center gap-1.5">
                                    <span
                                      className="w-2 h-2 rounded-full flex-shrink-0"
                                      style={{ backgroundColor: color }}
                                    />
                                    <p className="text-[11px] text-on-surface-variant uppercase tracking-wide leading-none">
                                      {label}
                                    </p>
                                  </div>
                                  <p
                                    className="text-2xl font-bold leading-none"
                                    style={{ color }}
                                  >
                                    {display.toFixed(0)}
                                    <span className="text-sm font-normal text-on-surface-variant ml-0.5">
                                      /10
                                    </span>
                                  </p>
                                  <div className="h-1.5 rounded-full bg-skin-border overflow-hidden">
                                    <div
                                      className="h-full rounded-full"
                                      style={{
                                        width: `${display * 10}%`,
                                        backgroundColor: color,
                                        opacity: 0.75,
                                      }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          <div className="space-y-1 pt-1">
                            <p className="text-xs font-medium text-on-surface-variant">
                              3D Skin Map
                            </p>
                            <Face3DModel
                              scores={analysisByDate[selectedDay.date].overall_scores}
                              frontPhotoUrl={getPhotoForAngle(selectedDay.photos, "front")?.url}
                              detections={analysisByDate[selectedDay.date].per_angle?.front?.detections ?? []}
                              perAngle={analysisByDate[selectedDay.date].per_angle}
                            />
                          </div>

                          <div className="space-y-2 pt-1">
                              <p className="text-xs font-medium text-on-surface-variant">
                                {angleOrder.some(
                                  (angle) =>
                                    !!analysisByDate[selectedDay.date].per_angle[angle]?.heatmap_overlay_data_url,
                                )
                                  ? "Problem area heatmaps"
                                  : "Analyzed selfies"}
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                {angleOrder.map((angle) => {
                                  const angleData = analysisByDate[selectedDay.date].per_angle[angle];
                                  const overlayUrl = angleData?.heatmap_overlay_data_url ?? "";
                                  const rawUrl = getPhotoForAngle(selectedDay.photos, angle)?.url ?? "";
                                  const imageUrl = overlayUrl || rawUrl;
                                  const detections = overlayUrl ? (angleData?.detections ?? []) : [];
                                  return imageUrl ? (
                                    <HeatmapOverlay
                                      key={`${selectedDay.date}-heatmap-${angle}`}
                                      imageUrl={imageUrl}
                                      detections={detections}
                                      angleLabel={formatAngleLabel(angle)}
                                    />
                                  ) : (
                                    <div
                                      key={`${selectedDay.date}-heatmap-${angle}`}
                                      className="rounded-xl border border-dashed border-skin-border aspect-[4/3] flex items-center justify-center text-[11px] text-on-surface-variant bg-surface-warm"
                                    >
                                      {formatAngleLabel(angle)} unavailable
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                          {analysisByDate[selectedDay.date].disclaimer && (
                            <p className="text-[11px] text-on-surface-variant/60 leading-relaxed">
                              {analysisByDate[selectedDay.date].disclaimer}
                            </p>
                          )}
                        </div>
                      )}

                      {compareMode && compareDate && compareAnalysis && (
                        <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-4">
                          <p className="text-on-surface font-semibold text-sm">
                            {formatUtcDateLabel(selectedDay.date)} vs{" "}
                            {formatUtcDateLabel(compareDate)}
                          </p>

                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {Array.from(
                              new Set([
                                ...Object.keys(
                                  analysisByDate[selectedDay.date]
                                    .overall_scores,
                                ),
                                ...Object.keys(compareAnalysis.overall_scores),
                              ]),
                            ).map((key) => {
                              const scoreA =
                                analysisByDate[selectedDay.date].overall_scores[
                                  key
                                ] ?? 0;
                              const scoreB =
                                compareAnalysis.overall_scores[key] ?? 0;
                              const delta = (scoreB - scoreA) * 10;
                              const improved = delta < -0.05;
                              const worsened = delta > 0.05;
                              return (
                                <div
                                  key={key}
                                  className="bg-surface border border-skin-border rounded-lg p-3 space-y-1"
                                >
                                  <p className="text-[10px] text-on-surface-variant uppercase tracking-wide">
                                    {METRIC_LABEL[key] ?? formatLabel(key)}
                                  </p>
                                  <div className="flex items-center justify-between gap-1">
                                    <div className="text-center">
                                      <p className="text-[10px] text-blue-300">
                                        {formatUtcDateLabel(
                                          selectedDay.date,
                                        ).slice(0, 6)}
                                      </p>
                                      <p className="text-sm font-bold text-on-surface">
                                        {(scoreA * 10).toFixed(0)}/10
                                      </p>
                                    </div>
                                    <p
                                      className="text-xs font-bold"
                                      style={{
                                        color: improved
                                          ? "#4ade80"
                                          : worsened
                                            ? "#f87171"
                                            : "#94a3b8",
                                      }}
                                    >
                                      {delta > 0 ? "+" : ""}
                                      {delta.toFixed(1)}
                                      {improved ? " ↓" : worsened ? " ↑" : ""}
                                    </p>
                                    <div className="text-center">
                                      <p className="text-[10px] text-bloom">
                                        {formatUtcDateLabel(compareDate).slice(
                                          0,
                                          6,
                                        )}
                                      </p>
                                      <p className="text-sm font-bold text-on-surface">
                                        {(scoreB * 10).toFixed(0)}/10
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          <div className="space-y-3">
                              <p className="text-xs text-on-surface-variant">
                                {angleOrder.some(
                                  (angle) =>
                                    !!analysisByDate[selectedDay.date].per_angle[angle]?.heatmap_overlay_data_url ||
                                    !!compareAnalysis.per_angle[angle]?.heatmap_overlay_data_url,
                                )
                                  ? "Heatmap comparison"
                                  : "Photo comparison"}
                              </p>
                              {angleOrder.map((angle) => {
                                const heatmapA =
                                  analysisByDate[selectedDay.date].per_angle[angle]?.heatmap_overlay_data_url;
                                const heatmapB =
                                  compareAnalysis.per_angle[angle]?.heatmap_overlay_data_url;
                                const rawA = getPhotoForAngle(selectedDay.photos, angle)?.url;
                                const rawB = getPhotoForAngle(compareDay?.photos, angle)?.url;
                                const urlA = heatmapA || rawA;
                                const urlB = heatmapB || rawB;
                                if (!urlA && !urlB) return null;
                                return (
                                  <div key={angle}>
                                    <p className="text-[11px] text-on-surface-variant mb-1.5">
                                      {formatAngleLabel(angle)}
                                    </p>
                                    <div className="grid grid-cols-2 gap-2">
                                      <div className="relative rounded-xl overflow-hidden border border-primary/30">
                                        {urlA ? (
                                          <>
                                            <img
                                              src={urlA}
                                              alt={`${formatAngleLabel(angle)} ${heatmapA ? "heatmap" : "selfie"}`}
                                              className="w-full aspect-[4/3] object-cover"
                                            />
                                            <p className="absolute bottom-0 inset-x-0 text-center text-[10px] py-1 text-white bg-black/30">
                                              {formatUtcDateLabel(selectedDay.date)}
                                            </p>
                                          </>
                                        ) : (
                                          <div className="aspect-[4/3] flex items-center justify-center text-[10px] text-on-surface-variant border border-dashed border-skin-border rounded-xl bg-surface-warm">
                                            No photo
                                          </div>
                                        )}
                                      </div>
                                      <div className="relative rounded-xl overflow-hidden border border-bloom/30">
                                        {urlB ? (
                                          <>
                                            <img
                                              src={urlB}
                                              alt={`${formatAngleLabel(angle)} ${heatmapB ? "heatmap" : "selfie"}`}
                                              className="w-full aspect-[4/3] object-cover"
                                            />
                                            <p className="absolute bottom-0 inset-x-0 text-center text-[10px] py-1 text-white bg-black/30">
                                              {formatUtcDateLabel(compareDate)}
                                            </p>
                                          </>
                                        ) : (
                                          <div className="aspect-[4/3] flex items-center justify-center text-[10px] text-on-surface-variant border border-dashed border-skin-border rounded-xl bg-surface-warm">
                                            No photo
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                          {compareMode &&
                            compareDate &&
                            !compareDay?.isComplete && (
                              <p className="text-[11px] text-on-surface-variant">
                                Note: the comparison date has no complete photo
                                set.
                              </p>
                            )}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="rounded-xl border border-dashed border-skin-border p-6 text-sm text-on-surface-variant bg-surface-warm">
                    No selfie set for this day.
                  </div>
                )}
              </div>
            </>
          ))}

        {activeTab === "care" && (
          <div className="space-y-6">
            <div className="bg-surface border border-skin-border rounded-2xl p-4 sm:p-6">
              <p className="text-on-surface font-semibold mb-1">
                Your Skin Summary
              </p>
              <p className="text-on-surface-variant text-sm mb-3">
                Based on your last {Math.min(7, analyzedDates.length)} analysis
                {Math.min(7, analyzedDates.length) !== 1 ? "es" : ""}.
              </p>
              {analyzedDates.length === 0 ? (
                <p className="text-on-surface-variant text-sm">
                  Analyze at least one day to get personalized recommendations.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(
                    analysisByDate[analyzedDates[analyzedDates.length - 1]]
                      ?.overall_scores ?? {},
                  ).map(([key, val]) => (
                    <div
                      key={key}
                      className="flex items-center gap-1.5 bg-surface-warm border border-skin-border rounded-full px-3 py-1"
                    >
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{
                          backgroundColor: METRIC_COLORS[key] ?? "#94a3b8",
                        }}
                      />
                      <span className="text-xs text-on-surface-variant">
                        {METRIC_LABEL[key] ?? formatLabel(key)}
                      </span>
                      <span className="text-xs font-semibold text-on-surface">
                        {(val * 10).toFixed(0)}/10
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {recommendations.length === 0 ? (
              <div className="bg-surface border border-skin-border rounded-2xl p-8 text-center">
                <p className="text-on-surface-variant text-sm">
                  Analyze at least one day to get personalized recommendations.
                </p>
              </div>
            ) : (
              (["morning", "evening", "lifestyle"] as const).map((when) => {
                const group = recommendations.filter((r) => r.when === when);
                if (group.length === 0) return null;
                const groupLabel = {
                  morning: "Morning Routine",
                  evening: "Evening Routine",
                  lifestyle: "Lifestyle",
                }[when];
                return (
                  <div key={when} className="space-y-3">
                    <p className="text-on-surface font-semibold">
                      {groupLabel}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {group.map((rec) => {
                        const cardStyle = {
                          urgent: {
                            border: "border-bloom/30",
                            bg: "bg-bloom/5",
                            color: "#D4607A",
                          },
                          recommended: {
                            border: "border-secondary/30",
                            bg: "bg-secondary/5",
                            color: "#8B9E88",
                          },
                          optional: {
                            border: "border-skin-border",
                            bg: "bg-surface-warm",
                            color: "#64748b",
                          },
                        }[rec.priority];
                        return (
                          <div
                            key={rec.id}
                            className={`rounded-xl border p-4 space-y-2 ${cardStyle.border} ${cardStyle.bg}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-on-surface font-medium text-sm leading-tight">
                                {rec.title}
                              </p>
                              <span
                                className="text-[10px] px-2 py-0.5 rounded-full border flex-shrink-0"
                                style={{
                                  borderColor: cardStyle.color,
                                  color: cardStyle.color,
                                  backgroundColor: cardStyle.color + "18",
                                }}
                              >
                                {rec.priority}
                              </span>
                            </div>
                            <p className="text-on-surface-variant text-xs leading-relaxed">
                              {rec.description}
                            </p>
                            {rec.metric !== "general" && (
                              <div className="flex items-center gap-1.5 pt-1">
                                <span
                                  className="w-1.5 h-1.5 rounded-full"
                                  style={{
                                    backgroundColor:
                                      METRIC_COLORS[rec.metric] ?? "#94a3b8",
                                  }}
                                />
                                <span className="text-[10px] text-on-surface-variant">
                                  {METRIC_LABEL[rec.metric] ??
                                    formatLabel(rec.metric)}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default GalleryPage;
