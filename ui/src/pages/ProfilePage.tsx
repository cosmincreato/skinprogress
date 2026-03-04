import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import SelfieCamera, {
  type SelfieCameraHandle,
} from "../components/SelfieCamera";

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

type SelfiesApiItem = {
  url?: string;
  uploadedAt?: string;
  angle?: SelfieAngle | null;
  date?: string;
  photos?: SelfiePhoto[];
  isComplete?: boolean;
};

const REQUIRED_ANGLES: SelfieAngle[] = ["front", "left", "right"];

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
  const selfieCameraRef = useRef<SelfieCameraHandle>(null);
  const navigate = useNavigate();
  const currentUserId = getUserIdFromToken();

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
    const token = localStorage.getItem("jwt");
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
      setHasTakenDailySelfie(todayAngles.length > 0);
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
          navigate("/auth");
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

  const handleLogout = () => {
    localStorage.removeItem("jwt");
    navigate("/auth");
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
              <p className="text-4xl font-bold text-blue-400 flex items-center gap-2">
                {totalSets} <span>📸</span>
              </p>
            </div>
            <div className="bg-surface/50 backdrop-blur border border-slate-700 rounded-2xl p-6 hover:border-purple-500/50 transition-colors">
              <p className="text-on-surface-variant text-sm uppercase tracking-wide mb-2">
                Streak Status
              </p>
              <p className="text-4xl font-bold text-purple-400 flex items-center gap-2">
                {calculateStreak()} <span>🔥</span>
              </p>
            </div>
          </div>
        </section>

        {currentUserId === userId && !hasTakenDailySelfie && (
          <section className="bg-surface/50 backdrop-blur border border-slate-700 rounded-2xl p-6 sm:p-8 hover:border-purple-500/50 transition-colors">
            <div className="mb-6">
              <h3 className="text-2xl font-bold text-on-surface mb-2 flex items-center gap-2">
                <span className="text-2xl">📸</span>
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
                  🔄 Retake
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

        {hasTakenDailySelfie && currentUserId === userId && (
          <section className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/30 rounded-2xl p-6 sm:p-8 text-center">
            <p className="text-3xl mb-3">✨</p>
            <h3 className="text-2xl font-bold text-green-300 mb-2">
              Daily Selfie Complete!
            </h3>
            <p className="text-on-surface-variant">
              Great job! Come back tomorrow to continue your progress tracking.
            </p>
          </section>
        )}

        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold text-on-surface mb-2 flex items-center gap-2">
                <span>🖼️</span>
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
              <p className="text-4xl mb-4">📷</p>
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
