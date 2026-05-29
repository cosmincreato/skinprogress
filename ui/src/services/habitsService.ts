import { getAuthToken } from "./authService";

interface HabitStatus {
  habitName: string;
  isCompleted: boolean;
}

interface DailyHabits {
  date: string;
  habits: HabitStatus[];
}

interface DateHabits {
  date: string;
  habits: HabitStatus[];
  isComplete: boolean;
}

interface StreakInfo {
  currentStreak: number;
  longestStreak: number;
}

interface BadgeInfo {
  badgeId: string;
  badgeName: string;
  badgeCode: string;
  badgeDescription: string;
  awardedAt: string;
}

const API_BASE = "/api/habits";

export const habitsService = {
  async initializeHabits(): Promise<void> {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const response = await fetch(`${API_BASE}/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(`Failed to initialize habits: Status ${response.status}: ${responseText}`);
    }
  },

  async completeHabit(habitName: string): Promise<void> {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const response = await fetch(`${API_BASE}/complete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ habitName }),
    });

    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(`Failed to complete habit: ${habitName} - Status ${response.status}: ${responseText}`);
    }
  },

  async getDailyHabits(date?: Date): Promise<DailyHabits> {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const params = new URLSearchParams();
    if (date) {
      params.append("date", date.toISOString());
    }

    const response = await fetch(`${API_BASE}/daily?${params}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error("Failed to fetch daily habits");
    }

    const data = await response.json();
    return {
      date: data.date,
      habits: data.habits.map((h: any) => ({
        habitName: h.habitName,
        isCompleted: h.isCompleted,
      })),
    };
  },

  async getHabitRange(startDate: Date, endDate: Date): Promise<DateHabits[]> {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const params = new URLSearchParams({
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    });

    const response = await fetch(`${API_BASE}/range?${params}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error("Failed to fetch habit range");
    }

    const data = await response.json();
    return data.map((item: any) => ({
      date: item.date,
      habits: item.habits.map((h: any) => ({
        habitName: h.habitName,
        isCompleted: h.isCompleted,
      })),
      isComplete: item.isComplete,
    }));
  },

  async getStreak(): Promise<StreakInfo> {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const response = await fetch(`${API_BASE}/streak`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error("Failed to fetch streak");
    }

    return await response.json();
  },
  async deleteTodaysSelfies(): Promise<void> {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const response = await fetch("/api/users/selfies/today", {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      try {
        const error = await response.json();
        console.error("Delete selfies error response:", error);
        throw new Error(error.message || "Failed to delete today's selfies");
      } catch (parseError) {
        console.error("Failed to parse error response:", parseError);
        throw new Error(`Failed to delete today's selfies (HTTP ${response.status})`);
      }
    }

    const result = await response.json();
    console.log("Selfies deleted successfully:", result);
  },
  async getUserBadges(): Promise<BadgeInfo[]> {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const response = await fetch(`${API_BASE}/badges`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error("Failed to fetch user badges");
    }

    const data = await response.json();
    return data.map((badge: any) => ({
      badgeId: badge.badgeId,
      badgeName: badge.badgeName,
      badgeCode: badge.badgeCode,
      badgeDescription: badge.badgeDescription,
      awardedAt: badge.awardedAt,
    }));
  },

  async awardBadge(badgeCode: string, badgeName: string, badgeDescription: string): Promise<void> {
    const token = getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const response = await fetch(`${API_BASE}/award-badge`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ badgeCode, badgeName, badgeDescription }),
    });

    if (!response.ok) {
      throw new Error("Failed to award badge");
    }
  },
};

export default habitsService;
