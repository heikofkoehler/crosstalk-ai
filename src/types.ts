export type Level = "Superbeginner" | "Beginner" | "Intermediate";

export interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  translation?: string;
  svg?: string;
  level?: Level;
  audioUrl?: string;
  timestamp?: number;
}

export interface AIResponse {
  spanish_text: string;
  svg_draw: string;
  user_translation: string;
}

export interface PracticeSessionRecord {
  id: string;
  date: string; // ISO String
  durationSeconds: number;
  turns: number;
  level: Level;
}

export interface PracticeStats {
  totalSeconds: number;
  todaySeconds: number;
  lastDate: string; // YYYY-MM-DD
  streakDays: number;
  totalTurns: number;
  dailyGoalMinutes: number;
  sessions: PracticeSessionRecord[];
}
