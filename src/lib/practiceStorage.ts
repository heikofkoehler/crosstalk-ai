import { PracticeStats, PracticeSessionRecord, Level } from "../types";

const STORAGE_KEY = "crosstalk_practice_stats_v1";

export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getYesterdayDateString(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getDefaultStats(): PracticeStats {
  return {
    totalSeconds: 0,
    todaySeconds: 0,
    lastDate: getTodayDateString(),
    streakDays: 0,
    totalTurns: 0,
    dailyGoalMinutes: 15,
    sessions: [],
  };
}

export function loadPracticeStats(): PracticeStats {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultStats();
    
    const parsed: PracticeStats = JSON.parse(raw);
    const today = getTodayDateString();
    const yesterday = getYesterdayDateString();

    // Check if it's a new day
    if (parsed.lastDate !== today) {
      const isConsecutive = parsed.lastDate === yesterday;
      return {
        ...parsed,
        todaySeconds: 0,
        lastDate: today,
        streakDays: isConsecutive ? parsed.streakDays : (parsed.todaySeconds > 60 ? parsed.streakDays : 0),
      };
    }

    return parsed;
  } catch (e) {
    console.error("Error loading practice stats from storage", e);
    return getDefaultStats();
  }
}

export function savePracticeStats(stats: PracticeStats): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch (e) {
    console.error("Error saving practice stats to storage", e);
  }
}

export function formatTimeDisplay(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatReadableDuration(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}
