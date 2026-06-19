import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import SelfieCamera, { type SelfieCameraHandle } from "../components/SelfieCamera";
import { getAuthToken } from "../services/authService";
import { habitsService } from "../services/habitsService";

interface User {
  id: string;
  username: string;
  email: string;
  role: string;
  profilePictureUrl: string;
  lastSelfieAt: string | null;
  firstName?: string;
  lastName?: string;
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
type LockState = "unchecked" | "checked" | "locked";

type SelfiesApiItem = {
  url?: string;
  uploadedAt?: string;
  angle?: SelfieAngle | null;
  date?: string;
  photos?: SelfiePhoto[];
  isComplete?: boolean;
};

const REQUIRED_ANGLES: SelfieAngle[] = ["front", "left", "right"];

const DAILY_HABITS: { key: HabitKey; label: string; emoji: string }[] = [
  { key: "cleaning",  label: "Cleanse",  emoji: "🫧" },
  { key: "hydration", label: "Hydrate",  emoji: "💧" },
  { key: "spf",       label: "SPF",      emoji: "☀️" },
];

const HABIT_NAMES: Record<HabitKey, string> = {
  cleaning: "Cleanse",
  hydration: "Hydrate",
  spf: "SPF",
};

const getTodayDateKeyUTC = (): string => {
  const date = new Date();
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
};

const getUTCDateKey = (date: Date): string =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;

const parseDatabaseDateKey = (dateString: string): string => {
  const date = new Date(dateString);
  return getUTCDateKey(date);
};

const createEmptyHabitRecord = (): HabitDayRecord => ({ cleaning: false, hydration: false, spf: false });

const isHabitDayComplete = (record: HabitDayRecord) => record.cleaning && record.hydration && record.spf;

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
  while (hasCompleteEntry(startOffset + streak)) streak++;
  return streak;
};

const getUserIdFromToken = () => {
  const storedUserId = localStorage.getItem("userId");
  if (storedUserId) return storedUserId;
  const token = localStorage.getItem("jwt");
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"];
  } catch {
    return null;
  }
};

const formatAngleLabel = (angle: SelfieAngle) => {
  if (angle === "left") return "Left";
  if (angle === "right") return "Right";
  return "Front";
};

const toUtcDayKey = (dateStr: string): string => {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toISOString().split("T")[0];
};

const normalizeSelfieDays = (items: unknown): SelfieDay[] => {
  if (!Array.isArray(items)) return [];
  const dayMap = new Map<string, SelfiePhoto[]>();
  for (const rawItem of items as SelfiesApiItem[]) {
    if (rawItem && typeof rawItem === "object" && Array.isArray(rawItem.photos)) {
      const dayDate = rawItem.date ?? rawItem.photos[0]?.uploadedAt;
      if (!dayDate) continue;
      const normalizedPhotos = rawItem.photos.filter(photo => !!photo?.url && !!photo?.uploadedAt);
      dayMap.set(toUtcDayKey(dayDate), normalizedPhotos);
      continue;
    }
    if (rawItem?.url && rawItem?.uploadedAt) {
      const bucketDate = toUtcDayKey(rawItem.uploadedAt);
      const currentPhotos = dayMap.get(bucketDate) ?? [];
      currentPhotos.push({ url: rawItem.url, uploadedAt: rawItem.uploadedAt, angle: rawItem.angle ?? null });
      dayMap.set(bucketDate, currentPhotos);
    }
  }
  return Array.from(dayMap.entries())
    .map(([date, photos]) => {
      const dayAngles = photos
        .map(p => p.angle)
        .filter((a): a is SelfieAngle => a === "front" || a === "left" || a === "right");
      return { date, photos, isComplete: REQUIRED_ANGLES.every(a => dayAngles.includes(a)) };
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
};

// ─────────────────────────────────────────────

const ProfilePage = () => {
  const { userId } = useParams<{ userId: string }>();
  const [user, setUser] = useState<User | null>(null);
  const [selfie, setSelfie] = useState<string | null>(null);
  const [selfieDays, setSelfieDays] = useState<SelfieDay[]>([]);
  const [totalSets, setTotalSets] = useState(0);
  const [completedAnglesToday, setCompletedAnglesToday] = useState<SelfieAngle[]>([]);
  const hasTakenDailySelfie = completedAnglesToday.length === REQUIRED_ANGLES.length;
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [habitEntries, setHabitEntries] = useState<Record<string, HabitDayRecord>>({});
  const [habitLockState, setHabitLockState] = useState<Record<HabitKey, LockState>>({ cleaning: "unchecked", hydration: "unchecked", spf: "unchecked" });
  const [userBadges, setUserBadges] = useState<any[]>([]);
  const [_, setHabitsLoading] = useState(false);
  const selfieCameraRef = useRef<SelfieCameraHandle>(null);
  const navigate = useNavigate();
  const currentUserId = getUserIdFromToken();
  const todayHabitKey = getTodayDateKeyUTC();

  const completedHabitDays = Object.values(habitEntries).filter(e => isHabitDayComplete(e)).length;
  const habitStreak = calculateHabitStreak(habitEntries);

  const badges = [
    { title: "3-Day Streak",   description: "Complete your routine 3 days in a row",   unlocked: habitStreak >= 3  || userBadges.some(b => b.badgeCode === "CONSISTENCY_3") },
    { title: "7-Day Streak",   description: "Complete your routine 7 days in a row",   unlocked: habitStreak >= 7  || userBadges.some(b => b.badgeCode === "CONSISTENCY_7") },
    { title: "10 Total Days",  description: "Complete 10 total days",                   unlocked: completedHabitDays >= 10 || userBadges.some(b => b.badgeCode === "PROGRESS_10") },
    { title: "30 Total Days",  description: "Complete 30 total days",                   unlocked: completedHabitDays >= 30 || userBadges.some(b => b.badgeCode === "PROGRESS_30") },
  ];

  const calculateStreak = () => {
    const completeDays = selfieDays
      .filter(day => (day.photos?.length ?? 0) > 0)
      .map(day => new Date(day.date));
    if (completeDays.length === 0) return 0;
    completeDays.sort((a, b) => b.getTime() - a.getTime());
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const mostRecent = new Date(completeDays[0]); mostRecent.setHours(0, 0, 0, 0);
    if (Math.floor((today.getTime() - mostRecent.getTime()) / 86400000) > 1) return 0;
    let streak = 1;
    for (let i = 0; i < completeDays.length - 1; i++) {
      const curr = new Date(completeDays[i]); curr.setHours(0, 0, 0, 0);
      const next = new Date(completeDays[i + 1]); next.setHours(0, 0, 0, 0);
      if ((curr.getTime() - next.getTime()) / 86400000 === 1) streak++;
      else break;
    }
    return streak;
  };

  const fetchSelfieDays = useCallback(async () => {
    const token = getAuthToken();
    if (!token || !userId) return;
    try {
      const response = await fetch(`/api/users/${userId}/selfies?page=1&pageSize=1`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) return;
      const data = await response.json();
      const days = normalizeSelfieDays(data?.selfies);
      setSelfieDays(days);
      setTotalSets(data?.totalPages ?? 0);
      const todayUTC = new Date().toISOString().split("T")[0];
      const todayEntry = days.find(day => day.date === todayUTC);
      if (todayEntry !== undefined) {
        const todayAngles = todayEntry.photos
          .map(p => p.angle)
          .filter((a): a is SelfieAngle => a === "front" || a === "left" || a === "right")
          .filter((a, i, arr) => arr.indexOf(a) === i);
        setCompletedAnglesToday(todayAngles);
      }
    } catch (error) {
      console.error("Failed to fetch selfies", error);
    }
  }, [userId]);

  useEffect(() => {
    const fetchUser = async () => {
      const token = localStorage.getItem("accessToken") || localStorage.getItem("jwt");
      if (!token) return;
      try {
        const response = await fetch(`/api/users/${userId}`, { headers: { Authorization: `Bearer ${token}` } });
        if (response.ok) {
          const userData = await response.json();
          console.log("User data received:", { firstName: userData.firstName, lastName: userData.lastName, username: userData.username });
          setUser(userData);
        }
        else { localStorage.removeItem("jwt"); localStorage.removeItem("accessToken"); navigate("/login"); }
      } catch (error) {
        console.error("Failed to fetch user", error);
      }
    };
    fetchUser();
  }, [userId, navigate]);

  useEffect(() => { fetchSelfieDays(); }, [fetchSelfieDays]);

  useEffect(() => {
    const loadHabitsAndBadges = async () => {
      try {
        setHabitsLoading(true);
        try { await habitsService.initializeHabits(); } catch {}
        const endDate = new Date();
        const startDate = new Date();
        startDate.setUTCDate(startDate.getUTCDate() - 60);
        try {
          const habitRange = await habitsService.getHabitRange(startDate, endDate);
          const habitMap: Record<string, HabitDayRecord> = {};
          habitRange.forEach(day => {
            const dateStr = parseDatabaseDateKey(day.date);
            habitMap[dateStr] = {
              cleaning:  day.habits.some(h => h.habitName === "Cleanse"  && h.isCompleted),
              hydration: day.habits.some(h => h.habitName === "Hydrate"  && h.isCompleted),
              spf:       day.habits.some(h => h.habitName === "SPF"      && h.isCompleted),
            };
          });
          setHabitEntries(habitMap);
          const todayRecord = habitMap[todayHabitKey];
          if (todayRecord) {
            setHabitLockState({
              cleaning:  todayRecord.cleaning  ? "locked" : "unchecked",
              hydration: todayRecord.hydration ? "locked" : "unchecked",
              spf:       todayRecord.spf       ? "locked" : "unchecked",
            });
          }
        } catch { setHabitEntries({}); }
        try { setUserBadges(await habitsService.getUserBadges()); } catch { setUserBadges([]); }
      } catch {} finally {
        setHabitsLoading(false);
      }
    };
    loadHabitsAndBadges();
  }, []);

  const handleSelfieCapture = (image: string) => { setSelfie(image || null); setUploadError(null); };
  const handleRetakeSelfie  = useCallback(() => { selfieCameraRef.current?.resetCapture(); setSelfie(null); setUploadError(null); }, []);

  const handleHabitToggle = (habit: HabitKey) => {
    setHabitLockState(prev => {
      if (prev[habit] === "locked") return prev;
      return { ...prev, [habit]: prev[habit] === "checked" ? "unchecked" : "checked" };
    });
  };

  const handleLockIn = async (habit: HabitKey) => {
    setHabitLockState(prev => ({ ...prev, [habit]: "locked" }));
    try {
      await habitsService.completeHabit(HABIT_NAMES[habit]);
      setHabitEntries(prev => {
        const current = prev[todayHabitKey] ?? createEmptyHabitRecord();
        return { ...prev, [todayHabitKey]: { ...current, [habit]: true } };
      });
    } catch {
      setHabitLockState(prev => ({ ...prev, [habit]: "checked" }));
    }
  };

  const nextRequiredAngle = REQUIRED_ANGLES.find(a => !completedAnglesToday.includes(a));

  const handleUpload = async () => {
    if (!selfie || !nextRequiredAngle) return;
    setUploadError(null);
    setUploading(true);
    const token = localStorage.getItem("accessToken") || localStorage.getItem("jwt");
    const formData = new FormData();
    const blob = await fetch(selfie).then(r => r.blob());
    formData.append("file", blob, `${nextRequiredAngle}-selfie.jpg`);
    formData.append("angle", nextRequiredAngle);
    try {
      const response = await fetch("/api/users/selfie", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: formData });
      if (response.ok) {
        setCompletedAnglesToday(prev => nextRequiredAngle && !prev.includes(nextRequiredAngle) ? [...prev, nextRequiredAngle] : prev);
        selfieCameraRef.current?.resetCapture();
        setSelfie(null);
        fetchSelfieDays().catch(() => {});
      } else {
        const errorData = await response.json().catch(() => null);
        setUploadError(errorData?.message || "Failed to upload selfie. Please try again.");
      }
    } catch {
      setUploadError("An error occurred during upload. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleRestartSelfies = async () => {
    setRestarting(true);
    setUploadError(null);
    try {
      await habitsService.deleteTodaysSelfies();
      await fetchSelfieDays();
      setCompletedAnglesToday([]);
      setSelfie(null);
      selfieCameraRef.current?.resetCapture();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Failed to restart selfies. Please try again.");
    } finally {
      setRestarting(false);
    }
  };

  const getPhotoForAngle = (photos: SelfiePhoto[] | undefined, angle: SelfieAngle) =>
    (photos ?? []).find(p => p.angle === angle);

  const latestSelfieDay = selfieDays[0] ?? null;

  // ── Loading state ──
  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-on-surface-variant">Loading your journal…</p>
        </div>
      </div>
    );
  }

  // ── Page ──
  return (
    <div className="bg-background min-h-screen">
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-8">

        {/* ── Greeting header ── */}
        <div className="space-y-1">
          <h2 className="font-display text-4xl sm:text-5xl text-on-surface">
            {getGreeting()}, <span className="italic text-primary">{user.firstName || user.username.split(" ")[0]}</span>.
          </h2>
          <p className="text-on-surface-variant text-sm">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>

        {/* ── Stats row ── */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-surface rounded-2xl border border-skin-border p-5">
            <p className="text-[11px] font-medium text-on-surface-variant uppercase tracking-widest mb-3">Photo sets</p>
            <p className="font-display text-5xl text-primary leading-none">{totalSets}</p>
          </div>
          <div className="bg-surface rounded-2xl border border-skin-border p-5">
            <p className="text-[11px] font-medium text-on-surface-variant uppercase tracking-widest mb-3">Day streak</p>
            <p className="font-display text-5xl text-bloom leading-none">{calculateStreak()}</p>
          </div>
        </div>

        {/* ── Daily selfie capture ── */}
        {currentUserId === userId && !hasTakenDailySelfie && (
          <section className="bg-surface rounded-2xl border border-skin-border overflow-hidden">
            <div className="px-6 pt-6 pb-4 border-b border-skin-border">
              <h3 className="font-display text-2xl text-on-surface">Today's capture</h3>
              <p className="text-sm text-on-surface-variant mt-0.5">
                {completedAnglesToday.length === 0
                  ? "Take 3 photos — front, left, and right"
                  : `${completedAnglesToday.length} of 3 complete — next: ${nextRequiredAngle}`}
              </p>
            </div>

            {/* Angle progress pills */}
            <div className="px-6 py-3 flex gap-2">
              {REQUIRED_ANGLES.map(angle => (
                <div key={angle} className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all ${
                  completedAnglesToday.includes(angle)
                    ? "bg-secondary/15 text-secondary"
                    : angle === nextRequiredAngle
                    ? "bg-bloom/10 text-bloom ring-1 ring-bloom/30"
                    : "bg-surface-warm text-on-surface-variant"
                }`}>
                  {completedAnglesToday.includes(angle) ? "✓ " : ""}{formatAngleLabel(angle)}
                </div>
              ))}
            </div>

            <div className="px-6 pb-6">
              <SelfieCamera ref={selfieCameraRef} onCapture={handleSelfieCapture} />

              {selfie && nextRequiredAngle && (
                <div className="mt-4 flex gap-3">
                  <button
                    onClick={handleUpload}
                    disabled={uploading}
                    className="flex-1 py-3 rounded-xl text-sm font-semibold bg-bloom hover:bg-bloom-hover text-white shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {uploading ? "Uploading…" : `Save ${formatAngleLabel(nextRequiredAngle)}`}
                  </button>
                  <button
                    type="button"
                    onClick={handleRetakeSelfie}
                    disabled={uploading}
                    className="px-5 py-3 rounded-xl text-sm font-medium border-2 border-skin-border bg-surface-warm text-on-surface hover:bg-primary/8 hover:border-primary/40 hover:text-primary disabled:opacity-50"
                  >
                    Retake
                  </button>
                </div>
              )}

              {uploadError && (
                <div className="mt-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  <p className="text-sm text-red-700">{uploadError}</p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── Selfie progress / complete banner ── */}
        {completedAnglesToday.length > 0 && currentUserId === userId && (
          <section className={`rounded-2xl border px-6 py-5 ${
            hasTakenDailySelfie
              ? "bg-secondary/8 border-secondary/25"
              : "bg-primary/5 border-primary/20"
          }`}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className={`font-semibold text-sm ${hasTakenDailySelfie ? "text-secondary" : "text-primary"}`}>
                  {hasTakenDailySelfie ? "All 3 photos captured ✓" : `${completedAnglesToday.length}/3 photos saved`}
                </p>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  {hasTakenDailySelfie
                    ? "Come back tomorrow to continue."
                    : `Still need: ${REQUIRED_ANGLES.filter(a => !completedAnglesToday.includes(a)).map(formatAngleLabel).join(", ")}`}
                </p>
              </div>
              <button
                onClick={handleRestartSelfies}
                disabled={restarting}
                className="px-4 py-2 text-xs font-medium rounded-lg border-2 border-skin-border bg-surface-warm text-on-surface hover:bg-primary/8 hover:border-primary/40 hover:text-primary disabled:opacity-50 whitespace-nowrap"
              >
                {restarting ? "Restarting…" : "Restart"}
              </button>
            </div>
          </section>
        )}

        {/* ── Habit tracker ── */}
        {currentUserId === userId && (
          <section className="bg-surface rounded-2xl border border-skin-border">
            <div className="px-6 pt-6 pb-4 border-b border-skin-border">
              <h3 className="font-display text-2xl text-on-surface">Daily rituals</h3>
              <p className="text-sm text-on-surface-variant mt-0.5">Track your skincare routine</p>
            </div>

            <div className="px-6 pt-5 pb-2 grid grid-cols-3 gap-3">
              {DAILY_HABITS.map(habit => {
                const lockState = habitLockState[habit.key];
                const isLocked  = lockState === "locked";
                const isChecked = lockState === "checked" || isLocked;

                return (
                  <div
                    key={habit.key}
                    className={`flex flex-col items-center gap-2 rounded-2xl border p-4 transition-all ${
                      isLocked
                        ? "bg-secondary/8 border-secondary/30"
                        : isChecked
                        ? "bg-bloom/8 border-bloom/25"
                        : "bg-surface-warm border-skin-border hover:border-on-surface-variant/30"
                    }`}
                  >
                    <span className="text-2xl">{habit.emoji}</span>
                    <span className={`text-xs font-semibold ${isLocked ? "text-secondary" : isChecked ? "text-bloom" : "text-on-surface-variant"}`}>
                      {habit.label}
                    </span>

                    {isLocked ? (
                      <span className="text-[10px] text-secondary font-medium">Done ✓</span>
                    ) : (
                      <label className="flex flex-col items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleHabitToggle(habit.key)}
                          className="h-4 w-4 accent-primary"
                        />
                        {lockState === "checked" && (
                          <button
                            onClick={() => handleLockIn(habit.key)}
                            className="text-xs font-semibold text-white bg-bloom hover:bg-bloom-hover px-3 py-1.5 rounded-lg shadow-sm hover:shadow"
                          >
                            Lock in
                          </button>
                        )}
                      </label>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Streak stats */}
            <div className="px-6 py-4 grid grid-cols-2 gap-3 border-t border-skin-border mt-4">
              <div className="bg-surface-warm rounded-xl px-4 py-3">
                <p className="text-[11px] text-on-surface-variant uppercase tracking-widest mb-1">Streak</p>
                <p className="font-display text-3xl text-secondary">{habitStreak} <span className="text-base font-sans font-normal text-on-surface-variant">days</span></p>
              </div>
              <div className="bg-surface-warm rounded-xl px-4 py-3">
                <p className="text-[11px] text-on-surface-variant uppercase tracking-widest mb-1">Completed</p>
                <p className="font-display text-3xl text-primary">{completedHabitDays} <span className="text-base font-sans font-normal text-on-surface-variant">days</span></p>
              </div>
            </div>

            {/* Badges */}
            <div className="px-6 pb-6">
              <p className="text-xs font-medium text-on-surface-variant uppercase tracking-widest mb-3 mt-1">Achievements</p>
              <div className="grid grid-cols-2 gap-3">
                {badges.map(badge => (
                  <div
                    key={badge.title}
                    className={`rounded-xl border px-4 py-3 transition-all ${
                      badge.unlocked
                        ? "bg-bloom/8 border-bloom/25"
                        : "bg-surface-warm border-skin-border opacity-55"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-base">{badge.unlocked ? "🏆" : "🔒"}</span>
                      <p className="text-xs font-semibold text-on-surface">{badge.title}</p>
                    </div>
                    <p className="text-[11px] text-on-surface-variant leading-relaxed">{badge.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── Gallery preview ── */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-2xl text-on-surface">Recent photos</h3>
            {totalSets > 0 && (
              <button
                onClick={() => navigate(`/users/${userId}/gallery`)}
                className="text-sm font-medium px-4 py-2 rounded-lg border-2 border-skin-border bg-surface-warm text-on-surface hover:bg-primary/8 hover:border-primary/40 hover:text-primary flex items-center gap-1"
              >
                View all <span aria-hidden>→</span>
              </button>
            )}
          </div>

          {!latestSelfieDay ? (
            <div className="bg-surface rounded-2xl border border-dashed border-skin-border p-10 text-center">
              <p className="text-on-surface-variant text-sm">No photos yet — start by taking today's set above.</p>
            </div>
          ) : (
            <div className="bg-surface rounded-2xl border border-skin-border overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-skin-border">
                <p className="text-sm font-medium text-on-surface">
                  {new Date(latestSelfieDay.date + "T00:00:00Z").toLocaleDateString("en-US", {
                    year: "numeric", month: "short", day: "numeric", timeZone: "UTC",
                  })}
                </p>
                <span className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full border ${
                  latestSelfieDay.isComplete
                    ? "bg-secondary/10 border-secondary/30 text-secondary"
                    : "bg-amber-50 border-amber-200 text-amber-700"
                }`}>
                  {latestSelfieDay.isComplete ? "Complete" : "Incomplete"}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-px bg-skin-border">
                {REQUIRED_ANGLES.map(angle => {
                  const photo = getPhotoForAngle(latestSelfieDay.photos, angle);
                  return photo ? (
                    <div key={`${latestSelfieDay.date}-${angle}`} className="relative">
                      <img src={photo.url} alt={`${formatAngleLabel(angle)} selfie`} className="w-full aspect-[4/3] object-cover bg-surface-warm" />
                      <p className="absolute bottom-0 inset-x-0 text-center text-[10px] py-1 text-white bg-black/30">
                        {formatAngleLabel(angle)}
                      </p>
                    </div>
                  ) : (
                    <div key={`${latestSelfieDay.date}-${angle}`} className="aspect-[4/3] flex items-center justify-center bg-surface-warm text-[11px] text-on-surface-variant">
                      {formatAngleLabel(angle)} missing
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

      </main>
    </div>
  );
};

export default ProfilePage;
