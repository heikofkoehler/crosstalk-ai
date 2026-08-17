import React, { useState, useRef, useEffect, useCallback } from "react";
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { motion, AnimatePresence } from "motion/react";
import { 
  Send, 
  Sparkles, 
  User, 
  Bot, 
  Settings, 
  RefreshCw, 
  Info,
  ChevronDown,
  AlertCircle,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Play,
  Square,
  Clock,
  Flame,
  Pause,
  RotateCcw,
  BarChart3,
  Target
} from "lucide-react";
import { cn } from "./lib/utils";
import { Level, Message, AIResponse, PracticeStats } from "./types";
import { 
  loadPracticeStats, 
  savePracticeStats, 
  formatTimeDisplay, 
  formatReadableDuration, 
  getTodayDateString,
  getDefaultStats 
} from "./lib/practiceStorage";
import { PracticeStatsModal } from "./components/PracticeStatsModal";

const LEVELS: Level[] = ["Superbeginner", "Beginner", "Intermediate"];

// Speech Recognition Setup
const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "¡Hola! Soy tu compañero de Crosstalk. Yo hablo español y tú hablas inglés. ¿De qué quieres hablar hoy?",
      svg: '<circle cx="50" cy="40" r="20" fill="#FFD700" /><path d="M30 70 Q50 90 70 70" stroke="#000" stroke-width="3" fill="none" /><circle cx="40" cy="35" r="3" fill="#000" /><circle cx="60" cy="35" r="3" fill="#000" />',
    }
  ]);
  const [input, setInput] = useState("");
  const [level, setLevel] = useState<Level>("Superbeginner");
  const [isLoading, setIsLoading] = useState(false);
  const [showLevelMenu, setShowLevelMenu] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isAutoPlay, setIsAutoPlay] = useState(true);
  const [showTranslations, setShowTranslations] = useState(true);
  const [currentlyPlayingId, setCurrentlyPlayingId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Practice Time & Stats State
  const [stats, setStats] = useState<PracticeStats>(() => loadPracticeStats());
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [sessionTurns, setSessionTurns] = useState(0);
  const [isTimerActive, setIsTimerActive] = useState(true);
  const [isIdle, setIsIdle] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const lastActivityRef = useRef<number>(Date.now());
  const statsRef = useRef<PracticeStats>(stats);
  statsRef.current = stats;

  // Track user activity to manage idle state
  const recordUserActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (isIdle) {
      setIsIdle(false);
    }
  }, [isIdle]);

  // Practice timer interval
  useEffect(() => {
    const timer = setInterval(() => {
      const timeSinceActivity = Date.now() - lastActivityRef.current;
      const idleThresholdMs = 90_000; // 90 seconds of inactivity pauses timer

      if (timeSinceActivity > idleThresholdMs) {
        setIsIdle(true);
        return;
      }

      if (isTimerActive && !isIdle) {
        setSessionSeconds(prev => prev + 1);

        setStats(prev => {
          const newToday = prev.todaySeconds + 1;
          const newTotal = prev.totalSeconds + 1;
          // Trigger streak if practiced >= 60 seconds today and streak is 0
          const newStreak = prev.streakDays === 0 && newToday >= 60 ? 1 : prev.streakDays;
          
          const updated: PracticeStats = {
            ...prev,
            todaySeconds: newToday,
            totalSeconds: newTotal,
            streakDays: newStreak,
            lastDate: getTodayDateString(),
          };
          return updated;
        });
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [isTimerActive, isIdle]);

  // Persist stats periodically and on unmount
  useEffect(() => {
    const saveInterval = setInterval(() => {
      savePracticeStats(statsRef.current);
    }, 5000);

    return () => {
      clearInterval(saveInterval);
      savePracticeStats(statsRef.current);
    };
  }, []);

  // Update daily goal
  const handleUpdateGoal = (minutes: number) => {
    setStats(prev => {
      const updated = { ...prev, dailyGoalMinutes: minutes };
      savePracticeStats(updated);
      return updated;
    });
  };

  // Reset stats
  const handleResetStats = () => {
    const fresh = getDefaultStats();
    setStats(fresh);
    setSessionSeconds(0);
    setSessionTurns(0);
    savePracticeStats(fresh);
  };

  // Reset session timer only
  const handleResetSession = () => {
    setSessionSeconds(0);
    setSessionTurns(0);
    recordUserActivity();
  };

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Speech Recognition Initialization
  useEffect(() => {
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "en-US";

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        setIsListening(false);
        recordUserActivity();
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, [recordUserActivity]);

  const toggleListening = () => {
    recordUserActivity();
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  const generateTTS = async (text: string): Promise<string | null> => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ parts: [{ text: `Di esto con entusiasmo: ${text}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      return base64Audio || null;
    } catch (error) {
      console.error("Error generating TTS:", error);
    }
    return null;
  };

  const stopAudio = () => {
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.stop();
      } catch (e) {
        // Ignore errors if already stopped
      }
      audioSourceRef.current = null;
    }
    setCurrentlyPlayingId(null);
  };

  const playAudio = async (base64Data: string, id: string) => {
    recordUserActivity();
    if (currentlyPlayingId === id) {
      stopAudio();
      return;
    }

    stopAudio();

    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      
      const audioContext = audioContextRef.current;
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      // 16-bit PCM
      const int16Array = new Int16Array(bytes.buffer);
      const float32Array = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768;
      }
      
      const audioBuffer = audioContext.createBuffer(1, float32Array.length, 24000);
      audioBuffer.getChannelData(0).set(float32Array);
      
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      
      source.onended = () => {
        if (currentlyPlayingId === id) {
          setCurrentlyPlayingId(null);
          audioSourceRef.current = null;
        }
      };
      
      setCurrentlyPlayingId(id);
      audioSourceRef.current = source;
      source.start();
    } catch (err) {
      console.error("Error playing PCM:", err);
      setCurrentlyPlayingId(null);
    }
  };

  const sendMessage = async (e?: React.FormEvent, overrideInput?: string) => {
    if (e) e.preventDefault();
    recordUserActivity();
    const currentInput = overrideInput || input;
    if (!currentInput.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      text: currentInput,
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    // Update exchange turn counts
    setSessionTurns(prev => prev + 1);
    setStats(prev => {
      const updated = { ...prev, totalTurns: prev.totalTurns + 1 };
      savePracticeStats(updated);
      return updated;
    });

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const levelPedagogy = {
        Superbeginner: `
- PEDAGOGY TARGET: Superbeginner (CEFR A0/Early A1) - Automatic Language Growth / Crosstalk Foundation.
- VOCABULARY: Restrict strictly to the top ~100-300 most frequent concrete Spanish words (e.g., ser, estar, tener, gustar, querer, ir, comer, ver, basic colors, numbers 1-10, common animals, food, everyday objects).
- GRAMMAR & STRUCTURE: Present tense indicative only. Simple Subject-Verb-Object or Verb-Object structures. Strict length: 1 to 2 short phrases (5 to 15 words maximum total).
- COMPREHENSIBILITY: Use high repetition of key concrete nouns and verbs. Avoid idioms, subjunctive, compound tenses, or subordinate clauses.
- DRAWING: Hyper-literal, high contrast, isolated clear objects or basic actions with distinct colors (fill and stroke). The visual must be so clear that a person knowing 0 Spanish understands the core noun/action instantly.`,
        Beginner: `
- PEDAGOGY TARGET: Beginner (CEFR A1-A2) - Expanding Comprehensible Input.
- VOCABULARY: Core ~500-1,000 frequent Spanish words. Everyday conversational topics (routines, preferences, family, weather, places, food, simple feelings).
- GRAMMAR & STRUCTURE: Present tense + simple periphrastic future ("ir a + infinitivo") + high-frequency preterite past ("fui", "comí", "vi", "tuve"). Strict length: 2 to 3 clear sentences (15 to 30 words total).
- COMPREHENSIBILITY: Connect ideas with common linkers ("porque", "cuando", "pero", "también", "después"). Keep pacing natural yet accessible.
- DRAWING: Multi-element scene depicting the narrative or interaction (character + action + object/setting) using clean colored SVG shapes.`,
        Intermediate: `
- PEDAGOGY TARGET: Intermediate (CEFR B1) - Conversational Crosstalk & Fluency.
- VOCABULARY: Rich, descriptive ~1,500-3,000+ words including abstract nouns, emotions, nuanced adjectives, and natural colloquial phrases.
- GRAMMAR & STRUCTURE: Natural conversational cadence. Full range of past tenses (pretérito indefinido vs. imperfecto), conditional, and basic present subjunctive where natural ("espero que...", "cuando pueda..."). Length: 3 to 5 sentences (30 to 60 words total).
- COMPREHENSIBILITY: Express opinions, stories, anecdotes, cultural context, and reasoning.
- DRAWING: Contextual diagram, storyboard sequence, expressive scene, or infographic-style visual summarizing nuances and relationships.`
      }[level];

      const systemInstruction = `
You are an expert Spanish Crosstalk Partner adhering strictly to Comprehensible Input and Automatic Language Growth (ALG) pedagogy.

CORE PEDAGOGICAL PILLARS:
1. 100% SPANISH IMMERSION: Always respond in Spanish. NEVER use English in "spanish_text". The user speaks in English; you provide the natural Spanish conversational counterpart.
2. COMPREHENSIBLE INPUT & VISUAL ANCHORS: You communicate through context, non-verbal scaffolding, and explicit visual correlation. Every key noun, action, or theme in your Spanish response MUST be visually represented in the SVG drawing.
3. ADAPTIVE LEVEL EXECUTION:
Current Selected Level: ${level}
${levelPedagogy}

4. DYNAMIC REPAIR & SIMPLIFICATION:
- If the user says "[SIMPLIFY]" or expresses confusion, misunderstanding, or hesitation (e.g., "what?", "I don't understand", "too fast", "huh?"):
  * Immediately simplify your Spanish down to the absolute simplest concrete words (Superbeginner tier).
  * Shorten your response to 1 simple phrase (under 10 words).
  * Use the present tense only with direct visual pointers.
  * Make the SVG drawing extra bold, magnified, and unmistakable.

5. SVG DRAWING SPECIFICATIONS:
- Canvas: 100x100 viewBox.
- Return ONLY the inner SVG child elements (e.g., <rect>, <circle>, <path>, <polygon>, <g>, <text>). Do NOT include outer <svg> tags.
- Use vibrant, high-contrast, accessible fill and stroke colors (#FF6B6B, #4A90E2, #4ADE80, #FACC15, #8E8E8E, #2D2D2D, etc.).
- Ensure drawings are visually appealing, well-proportioned, and immediately legible at a glance.

6. JSON OUTPUT SCHEMA:
Always return a valid JSON object with exactly three fields:
- "spanish_text": Your Spanish response crafted strictly according to the level pedagogy above.
- "svg_draw": The inner SVG elements for the 100x100 canvas illustrating the concept.
- "user_translation": An authentic, natural Spanish translation of the user's English message showing how a native speaker would express their exact thought.
`;

      const history = messages.map(m => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.text }]
      }));

      const response = await ai.models.generateContent({
        model: "gemini-flash-latest",
        contents: [
          ...history,
          { role: "user", parts: [{ text: currentInput }] }
        ],
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              spanish_text: { type: Type.STRING },
              svg_draw: { type: Type.STRING },
              user_translation: { type: Type.STRING }
            },
            required: ["spanish_text", "svg_draw", "user_translation"]
          }
        }
      });

      const data = JSON.parse(response.text) as AIResponse;
      
      // Update user message with translation
      setMessages(prev => prev.map(m => 
        m.id === userMessage.id ? { ...m, translation: data.user_translation } : m
      ));
      
      // Generate TTS in parallel
      const audioUrl = await generateTTS(data.spanish_text);

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        text: data.spanish_text,
        svg: data.svg_draw,
        level: level,
        audioUrl: audioUrl || undefined
      };

      setMessages(prev => [...prev, assistantMessage]);

      if (isAutoPlay && audioUrl) {
        playAudio(audioUrl, assistantMessage.id);
      }
    } catch (error) {
      console.error("Error calling Gemini:", error);
      setMessages(prev => [...prev, {
        id: "error",
        role: "assistant",
        text: "Lo siento, hubo un error. ¿Puedes intentar de nuevo?",
        svg: '<circle cx="50" cy="50" r="40" fill="#FF6B6B" opacity="0.2" /><path d="M30 70 Q50 50 70 70" stroke="#FF6B6B" stroke-width="3" fill="none" /><circle cx="40" cy="40" r="3" fill="#FF6B6B" /><circle cx="60" cy="40" r="3" fill="#FF6B6B" />'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSimplify = () => {
    recordUserActivity();
    sendMessage(undefined, "[SIMPLIFY]");
  };

  const goalSeconds = stats.dailyGoalMinutes * 60;
  const progressPercent = Math.min(100, Math.round((stats.todaySeconds / goalSeconds) * 100));

  return (
    <div 
      className="flex flex-col h-screen bg-[#FDFCFB] text-[#2D2D2D] font-sans"
      onClick={recordUserActivity}
    >
      {/* Header */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-3.5 bg-white border-b border-[#EAEAEA] shadow-xs z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#FF6B6B] rounded-xl flex items-center justify-center text-white shadow-lg shadow-[#FF6B6B]/20 flex-shrink-0">
            <Sparkles size={22} />
          </div>
          <div>
            <h1 className="font-bold text-base sm:text-lg tracking-tight">Crosstalk Español</h1>
            <p className="text-[11px] text-[#8E8E8E] font-medium uppercase tracking-wider hidden sm:block">Comprehensible Input Immersion</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Practice Timer & Streak Pill */}
          <div className="flex items-center bg-[#F7F7F7] border border-[#EAEAEA] rounded-full p-1 pl-3 shadow-2xs">
            <button
              onClick={() => setShowStatsModal(true)}
              className="flex items-center gap-2 pr-2 hover:opacity-80 transition-opacity"
              title="Click to view full practice stats"
            >
              <div className="flex items-center gap-1.5">
                <span className={cn(
                  "w-2 h-2 rounded-full",
                  isTimerActive && !isIdle ? "bg-emerald-500 animate-pulse" : "bg-amber-400"
                )} />
                <span className="text-xs font-mono font-bold text-[#2D2D2D]">
                  {formatTimeDisplay(sessionSeconds)}
                </span>
              </div>

              <div className="h-3.5 w-px bg-[#DDD]" />

              <div className="flex items-center gap-1 text-xs font-bold text-[#FF6B6B]">
                <Flame size={13} className="text-[#FF6B6B]" />
                <span>{stats.streakDays}d</span>
                <span className="text-[#8E8E8E] font-normal hidden md:inline">({formatReadableDuration(stats.todaySeconds)})</span>
              </div>
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsTimerActive(!isTimerActive);
                recordUserActivity();
              }}
              className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center transition-all",
                isTimerActive && !isIdle ? "text-[#8E8E8E] hover:text-[#2D2D2D] hover:bg-[#EAEAEA]" : "bg-[#FF6B6B] text-white"
              )}
              title={isTimerActive && !isIdle ? "Pause session timer" : "Resume session timer"}
            >
              {isTimerActive && !isIdle ? <Pause size={11} /> : <Play size={11} fill="currentColor" />}
            </button>
          </div>

          {/* Stats Modal Trigger Button */}
          <button
            onClick={() => setShowStatsModal(true)}
            className="p-2 text-[#6E6E6E] hover:text-[#2D2D2D] hover:bg-[#F5F5F5] rounded-full transition-colors hidden sm:flex items-center justify-center"
            title="View Practice Stats"
          >
            <BarChart3 size={18} />
          </button>

          {/* Voice Auto-play toggle */}
          <button 
            onClick={() => setIsAutoPlay(!isAutoPlay)}
            className={cn(
              "p-2 rounded-full transition-all",
              isAutoPlay ? "bg-[#FFF5F5] text-[#FF6B6B]" : "bg-[#F5F5F5] text-[#8E8E8E]"
            )}
            title={isAutoPlay ? "Auto-play ON" : "Auto-play OFF"}
          >
            {isAutoPlay ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>

          {/* Level Selector */}
          <div className="relative">
            <button 
              onClick={() => setShowLevelMenu(!showLevelMenu)}
              className="flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 bg-[#F5F5F5] hover:bg-[#EEEEEE] rounded-full text-xs sm:text-sm font-semibold transition-all border border-transparent hover:border-[#DDD]"
            >
              <span className={cn(
                "w-2 h-2 rounded-full flex-shrink-0",
                level === "Superbeginner" ? "bg-green-500" : 
                level === "Beginner" ? "bg-yellow-500" : "bg-orange-500"
              )} />
              <span className="truncate max-w-[90px] sm:max-w-none">{level}</span>
              <ChevronDown size={13} className={cn("transition-transform", showLevelMenu && "rotate-180")} />
            </button>
            
            <AnimatePresence>
              {showLevelMenu && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute right-0 mt-2 w-48 bg-white border border-[#EAEAEA] rounded-2xl shadow-2xl overflow-hidden z-50"
                >
                  {LEVELS.map((l) => (
                    <button
                      key={l}
                      onClick={() => {
                        setLevel(l);
                        setShowLevelMenu(false);
                      }}
                      className={cn(
                        "w-full px-4 py-3 text-left text-sm font-medium hover:bg-[#F9F9F9] transition-colors flex items-center justify-between",
                        level === l ? "text-[#FF6B6B] bg-[#FFF5F5]" : "text-[#4A4A4A]"
                      )}
                    >
                      {l}
                      {level === l && <Sparkles size={14} />}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          
          <button 
            onClick={() => setMessages([messages[0]])}
            className="p-2 text-[#8E8E8E] hover:text-[#4A4A4A] transition-colors"
            title="Reiniciar conversación"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden relative">
        {/* Chat Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#FDFCFB]">
          <div 
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 sm:space-y-8 scroll-smooth"
          >
            {messages.map((msg) => (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                key={msg.id}
                className={cn(
                  "flex gap-3 sm:gap-4 max-w-3xl",
                  msg.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto"
                )}
              >
                <div className={cn(
                  "w-9 h-9 sm:w-10 sm:h-10 rounded-full flex-shrink-0 flex items-center justify-center shadow-xs",
                  msg.role === "user" ? "bg-[#4A90E2] text-white" : "bg-white border border-[#EAEAEA] text-[#FF6B6B]"
                )}>
                  {msg.role === "user" ? <User size={18} /> : <Bot size={18} />}
                </div>
                
                <div className={cn(
                  "flex flex-col gap-2",
                  msg.role === "user" ? "items-end" : "items-start"
                )}>
                  <div className={cn(
                    "px-4 sm:px-5 py-3 sm:py-3.5 rounded-2xl text-[14px] sm:text-[15px] leading-relaxed shadow-xs relative group",
                    msg.role === "user" 
                      ? "bg-[#4A90E2] text-white rounded-tr-none" 
                      : "bg-white border border-[#EAEAEA] text-[#2D2D2D] rounded-tl-none"
                  )}>
                    {msg.text}
                    
                    {msg.role === "user" && msg.translation && showTranslations && (
                      <div className="mt-2 pt-2 border-t border-white/20 text-xs font-medium opacity-90 italic">
                        {msg.translation}
                      </div>
                    )}
                    
                    {msg.role === "assistant" && msg.audioUrl && (
                      <button 
                        onClick={() => playAudio(msg.audioUrl!, msg.id)}
                        className={cn(
                          "absolute -right-9 top-0 p-1.5 sm:p-2 rounded-full transition-all opacity-0 group-hover:opacity-100",
                          currentlyPlayingId === msg.id ? "bg-[#FF6B6B] text-white opacity-100" : "bg-[#F5F5F5] text-[#8E8E8E] hover:text-[#FF6B6B]"
                        )}
                        title="Play Spanish audio"
                      >
                        {currentlyPlayingId === msg.id ? <Square size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
                      </button>
                    )}
                  </div>
                  
                  {msg.svg && (
                    <motion.div 
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="mt-1 p-2 sm:p-3 bg-white border border-[#EAEAEA] rounded-2xl shadow-sm w-40 h-40 sm:w-48 sm:h-48 flex items-center justify-center overflow-hidden"
                    >
                      <svg 
                        viewBox="0 0 100 100" 
                        className="w-full h-full"
                        dangerouslySetInnerHTML={{ __html: msg.svg }}
                      />
                    </motion.div>
                  )}
                </div>
              </motion.div>
            ))}
            
            {isLoading && (
              <div className="flex gap-3 sm:gap-4 mr-auto">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white border border-[#EAEAEA] text-[#FF6B6B] flex items-center justify-center animate-pulse">
                  <Bot size={18} />
                </div>
                <div className="flex flex-col gap-2">
                  <div className="px-5 py-3.5 rounded-2xl bg-white border border-[#EAEAEA] text-[#2D2D2D] rounded-tl-none flex gap-1 items-center">
                    <span className="w-1.5 h-1.5 bg-[#FF6B6B] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-[#FF6B6B] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-[#FF6B6B] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="p-4 sm:p-6 bg-white border-t border-[#EAEAEA]">
            <div className="max-w-3xl mx-auto space-y-3 sm:space-y-4">
              <div className="flex gap-2 items-center justify-between">
                <button 
                  onClick={handleSimplify}
                  className="px-3 sm:px-4 py-1.5 sm:py-2 bg-[#FFF5F5] text-[#FF6B6B] border border-[#FFDADA] rounded-xl text-xs sm:text-sm font-bold hover:bg-[#FFEAEA] transition-colors flex items-center gap-1.5"
                >
                  <AlertCircle size={15} />
                  SIMPLIFY
                </button>
                
                <div className="text-xs text-[#8E8E8E] flex items-center gap-1.5 italic truncate">
                  <Info size={13} className="flex-shrink-0" />
                  <span>Speak English, partner responds in Spanish with drawings.</span>
                </div>
              </div>

              <form onSubmit={sendMessage} className="relative group flex gap-2">
                <div className="relative flex-1">
                  <input
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value);
                      recordUserActivity();
                    }}
                    placeholder={isListening ? "Listening..." : "Type or speak in English..."}
                    className={cn(
                      "w-full pl-5 pr-12 py-3.5 sm:py-4 bg-[#F5F5F5] border-2 border-transparent focus:border-[#FF6B6B] focus:bg-white rounded-2xl outline-none transition-all text-[14px] sm:text-[15px] shadow-inner",
                      isListening && "border-[#FF6B6B] bg-white animate-pulse"
                    )}
                  />
                  <button 
                    type="button"
                    onClick={toggleListening}
                    className={cn(
                      "absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-xl transition-all",
                      isListening ? "bg-[#FF6B6B] text-white" : "text-[#8E8E8E] hover:text-[#FF6B6B]"
                    )}
                    title="Voice input (English)"
                  >
                    <Mic size={18} />
                  </button>
                </div>
                <button 
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="px-5 sm:px-6 bg-[#FF6B6B] text-white rounded-2xl hover:bg-[#FF5252] disabled:opacity-50 disabled:hover:bg-[#FF6B6B] transition-all flex items-center justify-center shadow-lg shadow-[#FF6B6B]/20"
                >
                  <Send size={18} />
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* Sidebar / Visual & Practice Stats Focus */}
        <aside className="hidden lg:flex w-80 border-l border-[#EAEAEA] bg-white flex-col p-5 space-y-5 overflow-y-auto">
          {/* Visual Context Box */}
          <div className="p-4 bg-[#FDFCFB] border border-[#EAEAEA] rounded-3xl space-y-3">
            <h3 className="font-bold text-xs text-[#4A4A4A] flex items-center gap-1.5 uppercase tracking-wider">
              <Sparkles size={14} className="text-[#FF6B6B]" />
              Visual Context
            </h3>
            <div className="aspect-square bg-white border border-[#EAEAEA] rounded-2xl shadow-inner flex items-center justify-center overflow-hidden p-3">
              {messages[messages.length - 1]?.svg ? (
                <svg 
                  viewBox="0 0 100 100" 
                  className="w-full h-full"
                  dangerouslySetInnerHTML={{ __html: messages[messages.length - 1].svg! }}
                />
              ) : (
                <div className="text-[#CECECE] text-center px-4">
                  <Sparkles size={36} className="mx-auto mb-2 opacity-20" />
                  <p className="text-xs font-medium">Drawings appear here as we talk.</p>
                </div>
              )}
            </div>
          </div>

          {/* Practice Time Tracker Card */}
          <div className="p-4 bg-[#FCFCFB] border border-[#EAEAEA] rounded-3xl space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-xs text-[#4A4A4A] flex items-center gap-1.5 uppercase tracking-wider">
                <Clock size={14} className="text-[#FF6B6B]" />
                Immersion Tracker
              </h3>
              <button
                onClick={() => setShowStatsModal(true)}
                className="text-[11px] font-bold text-[#FF6B6B] hover:underline flex items-center gap-0.5"
              >
                Full Stats &rarr;
              </button>
            </div>

            {/* Daily Goal Bar */}
            <div className="p-3 bg-white border border-[#EAEAEA] rounded-2xl space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-[#6E6E6E] font-medium">Today's Practice</span>
                <span className="font-bold text-[#2D2D2D]">
                  {formatReadableDuration(stats.todaySeconds)} / {stats.dailyGoalMinutes}m
                </span>
              </div>
              <div className="w-full h-2 bg-[#F0F0F0] rounded-full overflow-hidden">
                <div 
                  className="h-full bg-[#FF6B6B] rounded-full transition-all duration-500" 
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="flex justify-between items-center text-[10px] text-[#8E8E8E]">
                <span>{progressPercent}% completed</span>
                <span>🔥 {stats.streakDays} day streak</span>
              </div>
            </div>

            {/* Current Session Timer & Controls */}
            <div className="flex items-center justify-between px-3 py-2 bg-white border border-[#EAEAEA] rounded-2xl">
              <div>
                <span className="text-[10px] uppercase font-bold text-[#8E8E8E] tracking-wider block">Session Active</span>
                <span className="text-sm font-mono font-bold text-[#2D2D2D]">
                  {formatTimeDisplay(sessionSeconds)}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setIsTimerActive(!isTimerActive)}
                  className={cn(
                    "p-1.5 rounded-xl text-xs font-bold transition-colors flex items-center justify-center",
                    isTimerActive && !isIdle ? "bg-[#F5F5F5] hover:bg-[#EAEAEA] text-[#4A4A4A]" : "bg-[#FF6B6B] text-white"
                  )}
                  title={isTimerActive ? "Pause timer" : "Resume timer"}
                >
                  {isTimerActive && !isIdle ? <Pause size={13} /> : <Play size={13} fill="currentColor" />}
                </button>
                <button
                  onClick={handleResetSession}
                  className="p-1.5 rounded-xl bg-[#F5F5F5] hover:bg-[#EAEAEA] text-[#8E8E8E] hover:text-[#4A4A4A] transition-colors"
                  title="Reset current session"
                >
                  <RotateCcw size={13} />
                </button>
              </div>
            </div>
          </div>

          {/* Learning Controls */}
          <div className="p-4 bg-[#FCFCFB] border border-[#EAEAEA] rounded-3xl space-y-3">
            <h3 className="font-bold text-xs text-[#4A4A4A] flex items-center gap-1.5 uppercase tracking-wider">
              <Settings size={14} className="text-[#8E8E8E]" />
              Preferences
            </h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-2.5 bg-white border border-[#EAEAEA] rounded-2xl">
                <span className="text-xs font-medium text-[#4A4A4A]">Auto-play Audio</span>
                <button 
                  onClick={() => setIsAutoPlay(!isAutoPlay)}
                  className={cn(
                    "w-9 h-5 rounded-full transition-all relative",
                    isAutoPlay ? "bg-[#FF6B6B]" : "bg-[#DDD]"
                  )}
                >
                  <div className={cn(
                    "absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all shadow-xs",
                    isAutoPlay ? "right-0.5" : "left-0.5"
                  )} />
                </button>
              </div>

              <div className="flex items-center justify-between p-2.5 bg-white border border-[#EAEAEA] rounded-2xl">
                <span className="text-xs font-medium text-[#4A4A4A]">Show Translations</span>
                <button 
                  onClick={() => setShowTranslations(!showTranslations)}
                  className={cn(
                    "w-9 h-5 rounded-full transition-all relative",
                    showTranslations ? "bg-[#4A90E2]" : "bg-[#DDD]"
                  )}
                >
                  <div className={cn(
                    "absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all shadow-xs",
                    showTranslations ? "right-0.5" : "left-0.5"
                  )} />
                </button>
              </div>
            </div>
          </div>
        </aside>
      </main>

      {/* Practice Stats Modal */}
      <PracticeStatsModal
        isOpen={showStatsModal}
        onClose={() => setShowStatsModal(false)}
        stats={stats}
        sessionSeconds={sessionSeconds}
        sessionTurns={sessionTurns}
        onUpdateGoal={handleUpdateGoal}
        onResetStats={handleResetStats}
      />
    </div>
  );
}

