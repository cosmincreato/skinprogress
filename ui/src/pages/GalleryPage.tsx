import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";

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
  const { userId } = useParams<{ userId: string }>();
  const [selfieDays, setSelfieDays] = useState<SelfieDay[]>([]);
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
      const token = localStorage.getItem("jwt");
      if (!token || !userId) {
        navigate("/auth");
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

    const token = localStorage.getItem("jwt");
    if (!token) {
      navigate("/auth");
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

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {loading ? (
          <div className="text-center py-12">
            <p className="text-on-surface-variant">Loading gallery...</p>
          </div>
        ) : selfieDays.length === 0 ? (
          <div className="bg-surface/50 backdrop-blur border border-slate-700 rounded-2xl p-12 text-center">
            <p className="text-4xl mb-4">📷</p>
            <p className="text-on-surface-variant text-lg">No daily sets yet</p>
            <p className="text-on-surface-variant text-sm mt-2">
              Start by taking your first 3-photo set.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-on-surface-variant text-sm">
              {selfieDays.length} daily set{selfieDays.length !== 1 ? "s" : ""}
            </p>

            {selfieDays.map((day, index) => (
              <div
                key={`${day.date}-${index}`}
                className="bg-surface/50 backdrop-blur border border-slate-700 rounded-2xl p-4 sm:p-6"
              >
                <div className="flex items-center justify-between mb-4">
                  <p className="text-on-surface font-semibold">
                    {formatUtcDateLabel(day.date)}
                  </p>
                  <span
                    className={`text-xs px-2 py-1 rounded-full border ${
                      day.isComplete
                        ? "bg-green-500/10 border-green-500/30 text-green-300"
                        : "bg-yellow-500/10 border-yellow-500/30 text-yellow-300"
                    }`}
                  >
                    {day.isComplete ? "Complete" : "Incomplete"}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {REQUIRED_ANGLES.map((angle) => {
                    const photo = getPhotoForAngle(day.photos, angle);
                    return photo ? (
                      <div
                        key={`${day.date}-${angle}`}
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
                        key={`${day.date}-${angle}`}
                        className="rounded-xl border border-dashed border-slate-600 aspect-[4/3] flex items-center justify-center text-on-surface-variant text-xs"
                      >
                        {formatAngleLabel(angle)} missing
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 flex flex-col gap-3">
                  <button
                    onClick={() => handleAnalyzeSet(day)}
                    disabled={analysisLoadingByDate[day.date]}
                    className="w-fit py-2 px-4 rounded-lg font-semibold transition-all duration-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-300 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {analysisLoadingByDate[day.date]
                      ? "Analyzing..."
                      : "Analyze Set"}
                  </button>

                  {analysisErrorByDate[day.date] && (
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
                      {analysisErrorByDate[day.date]}
                    </div>
                  )}

                  {analysisByDate[day.date] && (
                    <div className="p-4 rounded-xl border border-blue-500/30 bg-blue-500/10 space-y-2">
                      <p className="text-on-surface font-semibold">
                        {analysisByDate[day.date].summary}
                      </p>
                      <p className="text-on-surface-variant text-sm">
                        Overall:{" "}
                        {formatLabel(analysisByDate[day.date].overall_label)} (
                        {(
                          analysisByDate[day.date].overall_confidence * 100
                        ).toFixed(1)}
                        %)
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-on-surface-variant">
                        {Object.entries(analysisByDate[day.date].per_angle).map(
                          ([angle, result]) => (
                            <p key={`${day.date}-analysis-${angle}`}>
                              {formatLabel(angle)}: {formatLabel(result.label)}{" "}
                              ({(result.confidence * 100).toFixed(1)}%)
                            </p>
                          ),
                        )}
                      </div>
                      {analysisByDate[day.date].disclaimer && (
                        <p className="text-[11px] text-on-surface-variant">
                          {analysisByDate[day.date].disclaimer}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default GalleryPage;
