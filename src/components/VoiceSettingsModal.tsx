import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  X, 
  Volume2, 
  Play, 
  Square, 
  Sparkles, 
  Sliders, 
  Check, 
  Globe,
  Radio,
  RefreshCw,
  Loader2,
  CheckCircle2
} from "lucide-react";
import { cn } from "../lib/utils";

interface VoiceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  voices: SpeechSynthesisVoice[];
  selectedVoiceURI: string;
  onSelectVoice: (uri: string) => void;
  speechRate: number;
  onSelectRate: (rate: number) => void;
  onRefreshVoices: () => void;
}

const RATE_PRESETS = [
  { label: "0.75x (Super Slow)", value: 0.75 },
  { label: "0.85x (Slow)", value: 0.85 },
  { label: "1.0x (Normal)", value: 1.0 },
  { label: "1.15x (Conversational)", value: 1.15 },
];

export function VoiceSettingsModal({
  isOpen,
  onClose,
  voices,
  selectedVoiceURI,
  onSelectVoice,
  speechRate,
  onSelectRate,
  onRefreshVoices,
}: VoiceSettingsModalProps) {
  const [testingURI, setTestingURI] = useState<string | null>(null);
  const [testingKore, setTestingKore] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const spanishVoices = voices.filter(v => 
    v.lang.toLowerCase().startsWith("es") ||
    v.name.toLowerCase().includes("spanish") ||
    v.name.toLowerCase().includes("español")
  );

  const stopAllAudio = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.stop();
      } catch (e) {}
      audioSourceRef.current = null;
    }
    setTestingURI(null);
    setTestingKore(false);
  };

  const handleTestKoreVoice = async () => {
    if (testingKore) {
      stopAllAudio();
      return;
    }

    stopAllAudio();
    setTestingKore(true);

    try {
      const phrase = "¡Hola! Me alegro mucho de practicar español contigo.";
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: phrase }),
      });

      if (!res.ok) throw new Error("TTS endpoint error");
      const data = await res.json();

      if (data.audioBase64) {
        if (!audioContextRef.current) {
          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioCtx) {
            audioContextRef.current = new AudioCtx({ sampleRate: 24000 });
          }
        }
        const ctx = audioContextRef.current;
        if (ctx) {
          if (ctx.state === "suspended") await ctx.resume();

          const binary = atob(data.audioBase64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }

          const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
          const numSamples = Math.floor(bytes.byteLength / 2);
          const float32Array = new Float32Array(numSamples);
          for (let i = 0; i < numSamples; i++) {
            float32Array[i] = dataView.getInt16(i * 2, true) / 32768;
          }

          const buffer = ctx.createBuffer(1, numSamples, 24000);
          buffer.getChannelData(0).set(float32Array);

          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);
          audioSourceRef.current = source;

          source.onended = () => {
            setTestingKore(false);
            audioSourceRef.current = null;
          };

          source.start();
          return;
        }
      }

      // If cloud returned fallback, play sample via browser synthesis
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        const u = new SpeechSynthesisUtterance(phrase);
        u.lang = "es-ES";
        u.onend = () => setTestingKore(false);
        u.onerror = () => setTestingKore(false);
        window.speechSynthesis.speak(u);
      } else {
        setTestingKore(false);
      }
    } catch (e) {
      console.warn("Kore test notice:", e);
      setTestingKore(false);
    }
  };

  const handleTestVoice = (voice: SpeechSynthesisVoice) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    if (testingURI === voice.voiceURI) {
      stopAllAudio();
      return;
    }

    stopAllAudio();

    try {
      const testPhrase = "¡Hola! Me alegro mucho de practicar español contigo.";
      const utterance = new SpeechSynthesisUtterance(testPhrase);
      utterance.voice = voice;
      utterance.lang = voice.lang || "es-ES";
      utterance.rate = speechRate;

      utterance.onstart = () => setTestingURI(voice.voiceURI);
      utterance.onend = () => setTestingURI(null);
      utterance.onerror = () => setTestingURI(null);

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn("Test voice notice:", e);
      setTestingURI(null);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              stopAllAudio();
              onClose();
            }}
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
                <div className="w-10 h-10 rounded-2xl bg-[#EFF6FF] text-[#3B82F6] flex items-center justify-center font-bold shadow-xs">
                  <Volume2 size={20} />
                </div>
                <div>
                  <h2 className="font-bold text-lg text-[#2D2D2D]">Voice & Audio Engine</h2>
                  <p className="text-xs text-[#8E8E8E]">Choose your preferred Spanish voice</p>
                </div>
              </div>
              <button
                onClick={() => {
                  stopAllAudio();
                  onClose();
                }}
                className="w-8 h-8 rounded-full bg-[#F5F5F5] hover:bg-[#EAEAEA] text-[#6E6E6E] flex items-center justify-center transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6 overflow-y-auto flex-1 text-[#2D2D2D]">
              
              {/* Featured Primary Voice: Kore (Google Gemini HD) */}
              <div className="p-5 rounded-2xl bg-gradient-to-br from-[#EFF6FF] to-[#F0FDF4] border-2 border-[#3B82F6]/30 shadow-xs space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-[#3B82F6] text-white flex items-center justify-center font-bold shadow-sm">
                      <Sparkles size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-sm text-[#1E3A8A]">Kore (Google Gemini HD)</h3>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold uppercase tracking-wider">
                          Primary Voice
                        </span>
                      </div>
                      <p className="text-xs text-[#475569] mt-0.5">
                        High-definition, expressive Spanish audio synthesized by Gemini.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] font-medium text-[#64748B] flex items-center gap-1.5">
                    <CheckCircle2 size={13} className="text-emerald-500" />
                    Always used first on every message
                  </span>

                  <button
                    type="button"
                    onClick={handleTestKoreVoice}
                    className={cn(
                      "px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs",
                      testingKore
                        ? "bg-[#EF4444] text-white"
                        : "bg-[#3B82F6] hover:bg-[#2563EB] text-white"
                    )}
                  >
                    {testingKore ? (
                      <>
                        <Square size={12} fill="currentColor" />
                        <span>Stop Sample</span>
                      </>
                    ) : (
                      <>
                        <Play size={12} fill="currentColor" />
                        <span>Test Kore Voice</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Voice Speed Control */}
              <div className="p-4 rounded-2xl bg-[#F9F9F9] border border-[#EAEAEA] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#6E6E6E] flex items-center gap-1.5">
                    <Sliders size={14} className="text-[#3B82F6]" />
                    Speaking Speed
                  </span>
                  <span className="text-xs font-bold text-[#3B82F6]">{speechRate}x</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {RATE_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      onClick={() => onSelectRate(preset.value)}
                      className={cn(
                        "px-3 py-2 rounded-xl text-xs font-bold transition-all border text-center",
                        speechRate === preset.value
                          ? "bg-[#3B82F6] text-white border-[#3B82F6] shadow-xs"
                          : "bg-white text-[#6E6E6E] border-[#EAEAEA] hover:border-[#CCC]"
                      )}
                    >
                      {preset.label.split(" ")[0]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Secondary/Fallback Device Voices */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E] flex items-center gap-1.5">
                      <Globe size={14} className="text-emerald-500" />
                      Backup Spanish Voices ({spanishVoices.length})
                    </h3>
                    <p className="text-[11px] text-[#94A3B8]">
                      Used automatically if offline or during temporary network dips
                    </p>
                  </div>
                  <button
                    onClick={onRefreshVoices}
                    className="text-xs text-[#3B82F6] hover:underline flex items-center gap-1 font-medium"
                    title="Reload system voices"
                  >
                    <RefreshCw size={12} />
                    Refresh
                  </button>
                </div>

                {spanishVoices.length === 0 ? (
                  <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs leading-relaxed">
                    <p className="font-bold">No local Spanish voices found in this browser.</p>
                    <p className="text-amber-800 mt-1">
                      Kore Cloud Voice will be used whenever connected.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                    {spanishVoices.map((voice) => {
                      const isSelected = selectedVoiceURI === voice.voiceURI;
                      const isNatural = 
                        voice.name.includes("Google") || 
                        voice.name.includes("Natural") || 
                        voice.name.includes("Neural") || 
                        voice.name.includes("Premium") ||
                        voice.name.includes("Monica") ||
                        voice.name.includes("Paulina") ||
                        voice.name.includes("Jorge") ||
                        voice.name.includes("Helena") ||
                        voice.name.includes("Sabina");

                      return (
                        <div
                          key={voice.voiceURI}
                          onClick={() => onSelectVoice(voice.voiceURI)}
                          className={cn(
                            "p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3",
                            isSelected
                              ? "bg-[#EFF6FF] border-[#3B82F6] shadow-xs"
                              : "bg-white border-[#EAEAEA] hover:border-[#CCC]"
                          )}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={cn(
                              "w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0",
                              isSelected ? "border-[#3B82F6] bg-[#3B82F6] text-white" : "border-[#CCC] bg-white"
                            )}>
                              {isSelected && <Check size={12} strokeWidth={3} />}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-xs sm:text-sm truncate text-[#2D2D2D]">
                                  {voice.name.replace(/Microsoft |Google |Apple /g, "")}
                                </span>
                                {isNatural && (
                                  <span className="px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700 text-[10px] font-bold">
                                    Natural
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-[#8E8E8E] block truncate">
                                {voice.lang}
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTestVoice(voice);
                            }}
                            className={cn(
                              "p-2 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors flex-shrink-0",
                              testingURI === voice.voiceURI
                                ? "bg-[#3B82F6] text-white"
                                : "bg-[#F5F5F5] hover:bg-[#EAEAEA] text-[#6E6E6E]"
                            )}
                            title="Preview this voice"
                          >
                            {testingURI === voice.voiceURI ? (
                              <Square size={13} fill="currentColor" />
                            ) : (
                              <Play size={13} fill="currentColor" />
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-[#FCFCFB] border-t border-[#F0F0F0] flex justify-end">
              <button
                onClick={() => {
                  stopAllAudio();
                  onClose();
                }}
                className="px-5 py-2.5 rounded-xl bg-[#2D2D2D] hover:bg-black text-white text-xs font-bold transition-all shadow-xs"
              >
                Save & Done
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
