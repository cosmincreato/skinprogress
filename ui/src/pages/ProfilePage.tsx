import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import SelfieCamera, {
  type SelfieCameraHandle,
} from "../components/SelfieCamera";
import { getAuthToken } from "../services/authService";
import { habitsService } from "../services/habitsService";

interface User {
  id: string;
  username: string;
  email: string;
  role: string;
  profilePictureUrl: string;
  lastSelfieAt: string | null;
}

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

type HabitKey = "cleaning" | "hydration" | "spf";

type HabitDayRecord = Record<HabitKey, boolean>;

type SelfiesApiItem = {
  url?: string;
  uploadedAt?: string;
  angle?: SelfieAngle | null;
  date?: string;
  photos?: SelfiePhoto[];
  isComplete?: boolean;
};

const REQUIRED_ANGLES: SelfieAngle[] = ["front", "left", "right"];

const DAILY_HABITS: { key: HabitKey; label: string }[] = [
  { key: "cleaning", label: "Cleanse" },
  { key: "hydration", label: "Hydrate" },
  { key: "spf", label: "SPF" },
];

const getLocalDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Get today's date key using UTC (consistent with database storage)
const getTodayDateKeyUTC = (): string => {
  const date = new Date();
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Get a UTC date key for any date
const getUTCDateKey = (date: Date): string => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Parse a database date string (ISO 8601) and return date key
const parseDatabaseDateKey = (dateString: string): string => {
  // Parse ISO date string and extract just the date part without timezone conversion
  const date = new Date(dateString);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const createEmptyHabitRecord = (): HabitDayRecord => ({
  cleaning: false,
  hydration: false,
  spf: false,
});

const createCompletedHabitRecord = (): HabitDayRecord => ({
  cleaning: true,
  hydration: true,
  spf: true,
});

const createTwoDayHabitSeed = (): Record<string, HabitDayRecord> => {
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  const twoDaysAgo = new Date();
  twoDaysAgo.setUTCDate(twoDaysAgo.getUTCDate() - 2);

  return {
    [getUTCDateKey(yesterday)]: createCompletedHabitRecord(),
    [getUTCDateKey(twoDaysAgo)]: createCompletedHabitRecord(),
  };
};

const isHabitDayComplete = (record: HabitDayRecord) =>
  record.cleaning && record.hydration && record.spf;

const calculateHabitStreak = (entries: Record<string, HabitDayRecord>) => {
  const hasCompleteEntry = (offsetDays: number) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - offsetDays);
    const entry = entries[getUTCDateKey(date)];
    return entry ? isHabitDayComplete(entry) : false;
  };

  const startOffset = hasCompleteEntry(0) ? 0 : 1;
  if (!hasCompleteEntry(startOffset)) return 0;

  let streak = 0;
  while (hasCompleteEntry(startOffset + streak)) {
    streak++;
  }

  return streak;
};

const getUserIdFromToken = () => {
  const token = localStorage.getItem("jwt");
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload[
      "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"
    ];
  } catch {
    return null;
  }
};

const formatAngleLabel = (angle: SelfieAngle) => {
  if (angle === "left") return "Left side";
  if (angle === "right") return "Right side";
  return "Front";
};

const dateKey = (dateStr: string) => new Date(dateStr).toDateString();

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

      const normalizedPhotos = rawItem.photos.filter(
        (photo) => !!photo?.url && !!photo?.uploadedAt,
      );
      dayMap.set(dateKey(dayDate), normalizedPhotos);
      continue;
    }

    if (rawItem?.url && rawItem?.uploadedAt) {
      const bucketDate = dateKey(rawItem.uploadedAt);
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

const ProfilePage = () => {
  const { userId } = useParams<{ userId: string }>();
  const [user, setUser] = useState<User | null>(null);
  const [selfie, setSelfie] = useState<string | null>(null);
  const [selfieDays, setSelfieDays] = useState<SelfieDay[]>([]);
  const [totalSets, setTotalSets] = useState(0);
  const [hasTakenDailySelfie, setHasTakenDailySelfie] = useState(false);
  const [completedAnglesToday, setCompletedAnglesToday] = useState<
    SelfieAngle[]
  >([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [habitEntries, setHabitEntries] = useState<
    Record<string, HabitDayRecord>
  >({});
  const [userBadges, setUserBadges] = useState<any[]>([]);
  const [habitsLoading, setHabitsLoading] = useState(false);
  const selfieCameraRef = useRef<SelfieCameraHandle>(null);
  const navigate = useNavigate();
  const currentUserId = getUserIdFromToken();
  const todayHabitKey = getTodayDateKeyUTC();

  const todayHabits = habitEntries[todayHabitKey] ?? createEmptyHabitRecord();
  const completedHabitDays = Object.values(habitEntries).filter((entry) =>
    isHabitDayComplete(entry),
  ).length;
  const habitStreak = calculateHabitStreak(habitEntries);

  const badges = [
    {
      title: "Consistency 3 Days",
      description: "Complete your routine for 3 days in a row",
      unlocked:
        habitStreak >= 3 ||
        userBadges.some((b) => b.badgeCode === "CONSISTENCY_3"),
    },
    {
      title: "Consistency 7 Days",
      description: "Complete your routine for 7 days in a row",
      unlocked:
        habitStreak >= 7 ||
        userBadges.some((b) => b.badgeCode === "CONSISTENCY_7"),
    },
    {
      title: "Progress 10 Days",
      description: "Complete 10 total days",
      unlocked:
        completedHabitDays >= 10 ||
        userBadges.some((b) => b.badgeCode === "PROGRESS_10"),
    },
    {
      title: "Progress 30 Days",
      description: "Complete 30 total days",
      unlocked:
        completedHabitDays >= 30 ||
        userBadges.some((b) => b.badgeCode === "PROGRESS_30"),
    },
  ];

  const calculateStreak = () => {
    const completeDays = selfieDays
      .filter((day) => (day.photos?.length ?? 0) > 0)
      .map((day) => new Date(day.date));

    if (completeDays.length === 0) return 0;

    completeDays.sort((a, b) => b.getTime() - a.getTime());

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const mostRecentDate = new Date(completeDays[0]);
    mostRecentDate.setHours(0, 0, 0, 0);

    const daysSinceLastSet = Math.floor(
      (today.getTime() - mostRecentDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (daysSinceLastSet > 1) {
      return 0;
    }

    let streak = 1;
    for (let i = 0; i < completeDays.length - 1; i++) {
      const currentDate = new Date(completeDays[i]);
      currentDate.setHours(0, 0, 0, 0);

      const nextDate = new Date(completeDays[i + 1]);
      nextDate.setHours(0, 0, 0, 0);

      const diffTime = currentDate.getTime() - nextDate.getTime();
      const diffDays = diffTime / (1000 * 60 * 60 * 24);

      if (diffDays === 1) {
        streak++;
      } else {
        break;
      }
    }

    return streak;
  };

  const fetchSelfieDays = useCallback(async () => {
    const token = getAuthToken();
    if (!token || !userId) return;

    try {
      const response = await fetch(
        `/api/users/${userId}/selfies?page=1&pageSize=1`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) return;

      const data = await response.json();
      const days = normalizeSelfieDays(data?.selfies);
      setSelfieDays(days);
      setTotalSets(data?.totalPages ?? 0);

      const today = new Date().toDateString();
      const todayEntry = days.find((day) => dateKey(day.date) === today);

      const todayAngles = (
        todayEntry?.photos
          .map((photo) => photo.angle)
          .filter(
            (angle): angle is SelfieAngle =>
              angle === "front" || angle === "left" || angle === "right",
          ) ?? []
      ).filter((angle, index, arr) => arr.indexOf(angle) === index);

      setCompletedAnglesToday(todayAngles);
      setHasTakenDailySelfie(todayAngles.length === REQUIRED_ANGLES.length);
    } catch (error) {
      console.error("Failed to fetch selfies", error);
    }
  }, [userId]);

  useEffect(() => {
    const fetchUser = async () => {
      const token = localStorage.getItem("jwt");
      if (!token) return;

      try {
        const response = await fetch(`/api/users/${userId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const userData = await response.json();
          setUser(userData);
        } else {
          localStorage.removeItem("jwt");
          localStorage.removeItem("accessToken");
          navigate("/login");
        }
      } catch (error) {
        console.error("Failed to fetch user", error);
      }
    };

    fetchUser();
  }, [userId, navigate]);

  useEffect(() => {
    fetchSelfieDays();
  }, [fetchSelfieDays]);

  // Fetch habits and badges from database
  useEffect(() => {
    const loadHabitsAndBadges = async () => {
      try {
        setHabitsLoading(true);

        // Initialize habits if not already done
        try {
          console.log("DEBUG: Initializing habits...");
          await habitsService.initializeHabits();
          console.log("DEBUG: Habits initialized successfully");
        } catch (e) {
          console.error("ERROR: Failed to initialize habits", e);
        }

        // Fetch last 60 days of habit data for calculations
        const endDate = new Date();
        const startDate = new Date();
        startDate.setUTCDate(startDate.getUTCDate() - 60);

        try {
          const habitRange = await habitsService.getHabitRange(
            startDate,
            endDate,
          );

          // Convert to the same format as our local state
          const habitMap: Record<string, HabitDayRecord> = {};
          habitRange.forEach((day) => {
            // Use UTC date parsing to avoid timezone issues
            const dateStr = parseDatabaseDateKey(day.date);
            habitMap[dateStr] = {
              cleaning: day.habits.some(
                (h) => h.habitName === "Cleanse" && h.isCompleted,
              ),
              hydration: day.habits.some(
                (h) => h.habitName === "Hydrate" && h.isCompleted,
              ),
              spf: day.habits.some(
                (h) => h.habitName === "SPF" && h.isCompleted,
              ),
            };
          });

          setHabitEntries(habitMap);
        } catch (e) {
          console.warn("Failed to fetch habit range, using empty habits", e);
          setHabitEntries({});
        }

        // Fetch user badges
        try {
          const badges = await habitsService.getUserBadges();
          setUserBadges(badges);
        } catch (e) {
          console.warn("Failed to fetch badges, using empty badges", e);
          setUserBadges([]);
        }
      } catch (error) {
        console.error("Failed to load habits and badges", error);
      } finally {
        setHabitsLoading(false);
      }
    };

    loadHabitsAndBadges();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("jwt");
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("userId");
    localStorage.removeItem("userEmail");
    navigate("/login");
  };

  const handleSelfieCapture = (image: string) => {
    setSelfie(image || null);
    setUploadError(null);
  };

  const handleRetakeSelfie = useCallback(() => {
    selfieCameraRef.current?.resetCapture();
    setSelfie(null);
    setUploadError(null);
  }, []);

  const handleHabitToggle = async (habit: HabitKey) => {
    const habitNames: Record<HabitKey, string> = {
      cleaning: "Cleanse",
      hydration: "Hydrate",
      spf: "SPF",
    };

    // Update local state first for immediate UI feedback
    setHabitEntries((prev) => {
      const current = prev[todayHabitKey] ?? createEmptyHabitRecord();
      const next: Record<string, HabitDayRecord> = {
        ...prev,
        [todayHabitKey]: {
          ...current,
          [habit]: !current[habit],
        },
      };
      return next;
    });

    // Save to database immediately
    try {
      const habitName = habitNames[habit];
      await habitsService.completeHabit(habitName);
      console.log("DEBUG: Saved habit:", habitName);
    } catch (error) {
      console.error("Failed to save habit:", error);
    }
  };

  const nextRequiredAngle = REQUIRED_ANGLES.find(
    (angle) => !completedAnglesToday.includes(angle),
  );

  const handleUpload = async () => {
    if (!selfie || !nextRequiredAngle) return;

    setUploadError(null);
    setUploading(true);

    const token = localStorage.getItem("jwt");
    const formData = new FormData();
    const blob = await fetch(selfie).then((res) => res.blob());
    formData.append("file", blob, `${nextRequiredAngle}-selfie.jpg`);
    formData.append("angle", nextRequiredAngle);

    try {
      const response = await fetch("/api/users/selfie", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (response.ok) {
        await fetchSelfieDays();
        selfieCameraRef.current?.resetCapture();
        setSelfie(null);
      } else {
        const errorData = await response.json().catch(() => null);
        setUploadError(
          errorData?.message || "Failed to upload selfie. Please try again.",
        );
      }
    } catch (error) {
      setUploadError("An error occurred during upload. Please try again.");
      console.error("Failed to upload selfie", error);
    } finally {
      setUploading(false);
    }
  };

  const handleRestartSelfies = async () => {
    setRestarting(true);
    setUploadError(null);
    try {
      console.log("Starting to delete today's selfies...");
      await habitsService.deleteTodaysSelfies();
      console.log("Selfies deleted successfully, fetching updated data...");
      await fetchSelfieDays();
      console.log("Fetch complete, resetting UI state...");
      setHasTakenDailySelfie(false);
      setCompletedAnglesToday([]);
      setSelfie(null);
      selfieCameraRef.current?.resetCapture();
      console.log("Restart completed successfully");
    } catch (error) {
      console.error("Failed to restart selfies:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to restart selfies. Please try again.";
      setUploadError(errorMessage);
    } finally {
      setRestarting(false);
    }
  };

  const getPhotoForAngle = (
    photos: SelfiePhoto[] | undefined,
    angle: SelfieAngle,
  ) => (photos ?? []).find((photo) => photo.angle === angle);

  const latestSelfieDay = selfieDays[0] ?? null;

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-on-surface flex justify-center items-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
          <p className="text-on-surface-variant">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 font-sans">
      <header className="bg-surface/50 backdrop-blur-md border-b border-slate-700 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-300 to-blue-300 leading-relaxed">
              SkinProgress
            </h1>
          </div>
          <button
            onClick={handleLogout}
            className="w-fit py-2 px-4 sm:px-6 rounded-lg font-semibold transition-all duration-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 text-sm sm:text-base"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-8">
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="sm:col-span-1">
            <div className="bg-surface/50 backdrop-blur border border-slate-700 rounded-2xl p-6 text-center hover:border-purple-500/50 transition-colors">
              <img
                className="w-32 h-32 mx-auto rounded-2xl object-cover mb-4 ring-2 ring-purple-500/50"
                src={
                  user.profilePictureUrl || "https://via.placeholder.com/150"
                }
                onError={(event) => {
                  event.currentTarget.src = "https://via.placeholder.com/150";
                }}
                alt="Profile"
              />
              <h2 className="text-2xl font-bold text-on-surface mb-1">
                {user.username}
              </h2>
              <p className="text-on-surface-variant text-sm break-all">
                {user.email}
              </p>
            </div>
          </div>

          <div className="sm:col-span-2 grid grid-cols-2 gap-4">
            <div className="bg-surface/50 backdrop-blur border border-slate-700 rounded-2xl p-6 hover:border-blue-500/50 transition-colors">
              <p className="text-on-surface-variant text-sm uppercase tracking-wide mb-2">
                Daily Sets
              </p>
              <p className="text-4xl font-bold text-blue-400">{totalSets}</p>
            </div>
            <div className="bg-surface/50 backdrop-blur border border-slate-700 rounded-2xl p-6 hover:border-purple-500/50 transition-colors">
              <p className="text-on-surface-variant text-sm uppercase tracking-wide mb-2">
                Streak Status
              </p>
              <p className="text-4xl font-bold text-purple-400">
                {calculateStreak()}
              </p>
            </div>
          </div>
        </section>

        {currentUserId === userId && !hasTakenDailySelfie && (
          <section className="bg-surface/50 backdrop-blur border border-slate-700 rounded-2xl p-6 sm:p-8 hover:border-purple-500/50 transition-colors">
            <div className="mb-6">
              <h3 className="text-2xl font-bold text-on-surface mb-2">
                Daily Selfie
              </h3>
              <p className="text-on-surface-variant text-sm">
                Take one selfie for today.
              </p>
            </div>

            <SelfieCamera
              ref={selfieCameraRef}
              onCapture={handleSelfieCapture}
            />

            {selfie && nextRequiredAngle && (
              <div className="mt-6 space-y-3">
                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="w-full py-3 px-4 rounded-xl font-semibold transition-all duration-300 text-white bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base flex items-center justify-center gap-2"
                >
                  <span>{uploading ? "Uploading..." : "✓ Upload Selfie"}</span>
                </button>
                <button
                  type="button"
                  onClick={handleRetakeSelfie}
                  disabled={uploading}
                  className="w-full py-3 px-4 rounded-xl font-semibold transition-all duration-300 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-on-surface disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
                >
                  Retake
                </button>
              </div>
            )}

            {uploadError && (
              <div className="mt-4 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
                {uploadError}
              </div>
            )}
          </section>
        )}

        {completedAnglesToday.length > 0 && currentUserId === userId && (
          <section
            className={`rounded-2xl p-6 sm:p-8 ${
              hasTakenDailySelfie
                ? "bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/30"
                : "bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-blue-500/30"
            }`}
          >
            <div className="text-center mb-6">
              <h3
                className={`text-2xl font-bold mb-2 ${
                  hasTakenDailySelfie ? "text-green-300" : "text-blue-300"
                }`}
              >
                {hasTakenDailySelfie
                  ? "Daily Selfie Complete"
                  : `Selfies in Progress (${completedAnglesToday.length}/3)`}
              </h3>
              <p className="text-on-surface-variant">
                {hasTakenDailySelfie
                  ? "Come back tomorrow to continue your progress tracking."
                  : `You've taken the ${completedAnglesToday.map((a) => (a === "front" ? "front" : a === "left" ? "left side" : "right side")).join(", ")} selfie${completedAnglesToday.length > 1 ? "s" : ""}.`}
              </p>
            </div>
            <button
              onClick={handleRestartSelfies}
              disabled={restarting}
              className="w-full py-3 px-4 rounded-xl font-semibold transition-all duration-300 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm sm:text-base"
            >
              {restarting ? "Restarting..." : "Restart Today's Selfies"}
            </button>
          </section>
        )}

        {currentUserId === userId && (
          <section className="bg-surface/50 backdrop-blur border border-slate-700 rounded-2xl p-6 sm:p-8 hover:border-purple-500/50 transition-colors space-y-6">
            <div>
              <h3 className="text-2xl font-bold text-on-surface mb-2">
                Habit Tracker
              </h3>
              <p className="text-on-surface-variant text-sm">
                Check your daily routine: cleanse, hydrate, and SPF.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {DAILY_HABITS.map((habit) => {
                const checked = todayHabits[habit.key];

                return (
                  <label
                    key={habit.key}
                    className={`flex items-center justify-between rounded-xl border p-4 cursor-pointer transition-colors ${
                      checked
                        ? "border-green-500/40 bg-green-500/10"
                        : "border-slate-700 bg-slate-800/40 hover:border-slate-500"
                    }`}
                  >
                    <span className="text-on-surface font-medium">
                      {habit.label}
                    </span>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => handleHabitToggle(habit.key)}
                      className="h-4 w-4 accent-green-500"
                    />
                  </label>
                );
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
                <p className="text-on-surface-variant text-sm mb-1">Streak</p>
                <p className="text-2xl font-bold text-purple-300">
                  {habitStreak} days
                </p>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
                <p className="text-on-surface-variant text-sm mb-1">
                  Completed Days
                </p>
                <p className="text-2xl font-bold text-blue-300">
                  {completedHabitDays}
                </p>
              </div>
            </div>

            <div>
              <h4 className="text-lg font-semibold text-on-surface mb-4">
                Badges
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {badges.map((badge) => (
                  <div
                    key={badge.title}
                    className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all duration-300 ${
                      badge.unlocked
                        ? "bg-gradient-to-r from-emerald-500/20 to-blue-500/10 border-emerald-400/50 hover:border-emerald-400 shadow-lg shadow-emerald-500/10"
                        : "bg-slate-800/50 border-slate-600/50 opacity-60"
                    }`}
                  >
                    {/* Badge Circle */}
                    <div
                      className={`flex-shrink-0 w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold border-4 relative ${
                        badge.unlocked
                          ? "bg-gradient-to-br from-emerald-400 to-blue-400 border-emerald-300 shadow-lg shadow-emerald-400/50"
                          : "bg-gradient-to-br from-slate-700 to-slate-800 border-slate-600 shadow-lg shadow-slate-900/50"
                      }`}
                    >
                      {badge.unlocked ? (
                        <span>🏆</span>
                      ) : (
                        <span className="text-slate-500">🔒</span>
                      )}
                      {/* Shine effect for unlocked badges */}
                      {badge.unlocked && (
                        <div className="absolute top-1 right-1 w-3 h-3 bg-white rounded-full opacity-60"></div>
                      )}
                    </div>

                    {/* Badge Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-on-surface font-bold text-sm">
                        {badge.title}
                      </p>
                      <p className="text-on-surface-variant text-xs leading-relaxed">
                        {badge.description}
                      </p>
                      <p
                        className={`text-xs font-semibold mt-2 ${
                          badge.unlocked ? "text-emerald-300" : "text-slate-400"
                        }`}
                      >
                        {badge.unlocked ? "✓ Unlocked" : "🔒 Locked"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold text-on-surface mb-2">
                Your Progress Gallery
              </h2>
              <p className="text-on-surface-variant">
                Each day shows front, left, and right photos together.
              </p>
            </div>
            {totalSets > 0 && (
              <button
                onClick={() => navigate(`/users/${userId}/gallery`)}
                className="py-2 px-4 sm:px-6 rounded-lg font-semibold transition-all duration-300 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-300 text-sm sm:text-base w-fit"
              >
                View All →
              </button>
            )}
          </div>

          {!latestSelfieDay ? (
            <div className="bg-surface/50 backdrop-blur border border-slate-700 rounded-2xl p-12 text-center hover:border-purple-500/50 transition-colors">
              <p className="text-on-surface-variant text-lg">
                No daily sets yet
              </p>
              <p className="text-on-surface-variant text-sm mt-2">
                Start by taking today&apos;s front photo above.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-surface/50 backdrop-blur border border-slate-700 rounded-2xl p-4 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-on-surface font-semibold">
                    {new Date(latestSelfieDay.date).toLocaleDateString(
                      "default",
                      {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      },
                    )}
                  </p>
                  <span
                    className={`text-xs px-2 py-1 rounded-full border ${
                      latestSelfieDay.isComplete
                        ? "bg-green-500/10 border-green-500/30 text-green-300"
                        : "bg-yellow-500/10 border-yellow-500/30 text-yellow-300"
                    }`}
                  >
                    {latestSelfieDay.isComplete ? "Complete" : "Incomplete"}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {REQUIRED_ANGLES.map((angle) => {
                    const photo = getPhotoForAngle(
                      latestSelfieDay.photos,
                      angle,
                    );
                    return photo ? (
                      <div
                        key={`${latestSelfieDay.date}-${angle}`}
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
                        key={`${latestSelfieDay.date}-${angle}`}
                        className="rounded-xl border border-dashed border-slate-600 aspect-[4/3] flex items-center justify-center text-on-surface-variant text-xs"
                      >
                        {formatAngleLabel(angle)} missing
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default ProfilePage;
