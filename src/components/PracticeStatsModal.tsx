import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  X, 
  Clock, 
  Flame, 
  Target, 
  MessageSquare, 
  Trophy, 
  RotateCcw, 
  Sparkles,
  Calendar,
  CheckCircle2,
  TrendingUp
} from "lucide-react";
import { PracticeStats, Level } from "../types";
import { formatReadableDuration, formatTimeDisplay } from "../lib/practiceStorage";
import { cn } from "../lib/utils";

interface PracticeStatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  stats: PracticeStats;
  sessionSeconds: number;
  sessionTurns: number;
  onUpdateGoal: (minutes: number) => void;
  onResetStats: () => void;
}

const GOAL_OPTIONS = [5, 10, 15, 20, 30, 45, 60];

export function PracticeStatsModal({
  isOpen,
  onClose,
  stats,
  sessionSeconds,
  sessionTurns,
  onUpdateGoal,
  onResetStats,
}: PracticeStatsModalProps) {
  const [showConfirmReset, setShowConfirmReset] = useState(false);

  const goalSeconds = stats.dailyGoalMinutes * 60;
  const progressPercent = Math.min(100, Math.round((stats.todaySeconds / goalSeconds) * 100));

  const totalMinutes = Math.floor(stats.totalSeconds / 60);
  const milestones = [
    { title: "First Step", desc: "5 min of Crosstalk", achieved: totalMinutes >= 5, icon: "🌱" },
    { title: "Ear Tuner", desc: "30 min of Comprehensible Input", achieved: totalMinutes >= 30, icon: "🎧" },
    { title: "Immersion Novice", desc: "1 Hour of Spanish Crosstalk", achieved: totalMinutes >= 60, icon: "⭐" },
    { title: "Flow State", desc: "5 Hours of Immersion", achieved: totalMinutes >= 300, icon: "🚀" },
    { title: "3-Day Streak", desc: "Practice 3 days in a row", achieved: stats.streakDays >= 3, icon: "🔥" },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-xs"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-[#EAEAEA] overflow-hidden z-10 max-h-[90vh] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-[#F0F0F0] bg-[#FCFCFB]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#FFF0F0] text-[#FF6B6B] flex items-center justify-center font-bold">
                  <Clock size={20} />
                </div>
                <div>
                  <h2 className="font-bold text-lg text-[#2D2D2D]">Crosstalk Practice Stats</h2>
                  <p className="text-xs text-[#8E8E8E]">Comprehensible Input Immersion Log</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-[#F5F5F5] hover:bg-[#EAEAEA] text-[#6E6E6E] flex items-center justify-center transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Content Scrollable */}
            <div className="p-6 space-y-6 overflow-y-auto flex-1 text-[#2D2D2D]">
              {/* Active Session & Today Banner */}
              <div className="p-5 rounded-2xl bg-gradient-to-br from-[#FFF8F6] to-[#FFF1EE] border border-[#FFE4DD] relative overflow-hidden">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-[#FF6B6B]">Today's Immersion</span>
                    <div className="text-3xl font-extrabold text-[#2D2D2D] mt-0.5">
                      {formatReadableDuration(stats.todaySeconds)}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-[#8E8E8E] font-medium">Daily Goal</span>
                    <div className="text-sm font-bold text-[#4A4A4A]">
                      {stats.dailyGoalMinutes} min ({progressPercent}%)
                    </div>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="w-full h-2.5 bg-white/80 rounded-full overflow-hidden border border-[#FFDADA]">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${progressPercent}%` }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                    className="h-full bg-[#FF6B6B] rounded-full"
                  />
                </div>

                {/* Current Active Session Badge */}
                <div className="mt-4 pt-3 border-t border-[#FFDADA]/60 flex items-center justify-between text-xs">
                  <span className="text-[#6E6E6E] flex items-center gap-1.5 font-medium">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Current Active Session:
                  </span>
                  <span className="font-bold text-[#2D2D2D]">
                    {formatTimeDisplay(sessionSeconds)} ({sessionTurns} exchanges)
                  </span>
                </div>
              </div>

              {/* 3 Metric Cards Grid */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-4 rounded-2xl bg-[#F9F9F9] border border-[#EAEAEA] flex flex-col items-center text-center">
                  <div className="w-8 h-8 rounded-xl bg-[#EFF6FF] text-[#3B82F6] flex items-center justify-center mb-1.5">
                    <Clock size={16} />
                  </div>
                  <span className="text-xs text-[#8E8E8E] font-medium">Total Lifetime</span>
                  <span className="text-base font-extrabold text-[#2D2D2D] mt-0.5">
                    {formatReadableDuration(stats.totalSeconds)}
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-[#F9F9F9] border border-[#EAEAEA] flex flex-col items-center text-center">
                  <div className="w-8 h-8 rounded-xl bg-[#FFF7ED] text-[#F97316] flex items-center justify-center mb-1.5">
                    <Flame size={16} />
                  </div>
                  <span className="text-xs text-[#8E8E8E] font-medium">Active Streak</span>
                  <span className="text-base font-extrabold text-[#2D2D2D] mt-0.5">
                    {stats.streakDays} {stats.streakDays === 1 ? "day" : "days"}
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-[#F9F9F9] border border-[#EAEAEA] flex flex-col items-center text-center">
                  <div className="w-8 h-8 rounded-xl bg-[#F0FDF4] text-[#22C55E] flex items-center justify-center mb-1.5">
                    <MessageSquare size={16} />
                  </div>
                  <span className="text-xs text-[#8E8E8E] font-medium">Exchanges</span>
                  <span className="text-base font-extrabold text-[#2D2D2D] mt-0.5">
                    {stats.totalTurns} turns
                  </span>
                </div>
              </div>

              {/* Daily Goal Picker */}
              <div className="p-4 rounded-2xl bg-white border border-[#EAEAEA] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#4A4A4A] flex items-center gap-2">
                    <Target size={15} className="text-[#FF6B6B]" />
                    Set Daily Practice Goal:
                  </span>
                  <span className="text-xs font-semibold text-[#8E8E8E]">{stats.dailyGoalMinutes} min/day</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {GOAL_OPTIONS.map((mins) => (
                    <button
                      key={mins}
                      onClick={() => onUpdateGoal(mins)}
                      className={cn(
                        "px-3 py-1.5 rounded-xl text-xs font-bold transition-all border",
                        stats.dailyGoalMinutes === mins
                          ? "bg-[#FF6B6B] text-white border-[#FF6B6B] shadow-xs"
                          : "bg-[#F7F7F7] text-[#6E6E6E] border-[#EAEAEA] hover:border-[#CCC]"
                      )}
                    >
                      {mins}m
                    </button>
                  ))}
                </div>
              </div>

              {/* Milestones & Achievements */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E] flex items-center gap-1.5">
                  <Trophy size={14} className="text-[#F59E0B]" />
                  Immersion Milestones
                </h3>
                <div className="space-y-2">
                  {milestones.map((m, i) => (
                    <div
                      key={i}
                      className={cn(
                        "p-3 rounded-2xl border flex items-center justify-between text-xs transition-all",
                        m.achieved
                          ? "bg-[#FAFBF9] border-[#DCFCE7] text-[#2D2D2D]"
                          : "bg-[#FDFDFD] border-[#EAEAEA] text-[#9E9E9E] opacity-60"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{m.icon}</span>
                        <div>
                          <p className="font-bold">{m.title}</p>
                          <p className="text-[11px] text-[#8E8E8E]">{m.desc}</p>
                        </div>
                      </div>
                      {m.achieved ? (
                        <span className="flex items-center gap-1 text-[#16A34A] font-bold text-[11px] bg-[#DCFCE7] px-2.5 py-1 rounded-full">
                          <CheckCircle2 size={12} />
                          Unlocked
                        </span>
                      ) : (
                        <span className="text-[11px] font-medium text-[#A0A0A0]">In progress</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-[#F0F0F0] bg-[#FAF9F8] flex items-center justify-between">
              {showConfirmReset ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-rose-600 font-semibold">Reset all stats?</span>
                  <button
                    onClick={() => {
                      onResetStats();
                      setShowConfirmReset(false);
                    }}
                    className="px-3 py-1 bg-rose-600 text-white rounded-lg text-xs font-bold hover:bg-rose-700 transition-colors"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setShowConfirmReset(false)}
                    className="px-3 py-1 bg-[#EAEAEA] text-[#4A4A4A] rounded-lg text-xs font-medium hover:bg-[#DDD] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowConfirmReset(true)}
                  className="text-xs text-[#9E9E9E] hover:text-rose-500 font-medium transition-colors flex items-center gap-1"
                >
                  <RotateCcw size={12} />
                  Reset History
                </button>
              )}

              <button
                onClick={onClose}
                className="px-5 py-2 bg-[#2D2D2D] hover:bg-[#111] text-white rounded-xl text-xs font-bold transition-all shadow-sm"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
