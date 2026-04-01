import React, { useState, useRef, useEffect } from "react";
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
  Square
} from "lucide-react";
import { cn } from "./lib/utils";

// Types
type Level = "Superbeginner" | "Beginner" | "Intermediate";

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  svg?: string;
  level?: Level;
  audioUrl?: string;
}

interface AIResponse {
  spanish_text: string;
  svg_draw: string;
}

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
  const [currentlyPlayingId, setCurrentlyPlayingId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);

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
  }, []);

  const toggleListening = () => {
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
        model: "gemini-2.5-flash-preview-tts",
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

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const systemInstruction = `
        You are a Spanish Crosstalk Partner.
        - Always respond in Spanish. NEVER use English.
        - The user speaks English.
        - Your goal is to help them understand Spanish through context and visual aids.
        - For every response, provide a JSON object with two fields:
          1. "spanish_text": Your response in Spanish.
          2. "svg_draw": ONLY the inner SVG elements (paths, circles, rects, etc.) for a 100x100 canvas. Use colors to make it clear.
        - Adapt your vocabulary frequency and complexity based on the user's level: ${level}.
        - If the user says "[SIMPLIFY]" or expresses confusion, immediately simplify your Spanish and make your drawing even more basic and explicit.
        - Correlate the drawing with your Spanish text.
      `;

      const history = messages.map(m => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.text }]
      }));

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
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
              svg_draw: { type: Type.STRING }
            },
            required: ["spanish_text", "svg_draw"]
          }
        }
      });

      const data = JSON.parse(response.text) as AIResponse;
      
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
    sendMessage(undefined, "[SIMPLIFY]");
  };

  return (
    <div className="flex flex-col h-screen bg-[#FDFCFB] text-[#2D2D2D] font-sans">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-[#EAEAEA] shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#FF6B6B] rounded-xl flex items-center justify-center text-white shadow-lg shadow-[#FF6B6B]/20">
            <Sparkles size={22} />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight">Crosstalk Español</h1>
            <p className="text-xs text-[#8E8E8E] font-medium uppercase tracking-wider">Language Partner</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsAutoPlay(!isAutoPlay)}
            className={cn(
              "p-2 rounded-full transition-all",
              isAutoPlay ? "bg-[#FFF5F5] text-[#FF6B6B]" : "bg-[#F5F5F5] text-[#8E8E8E]"
            )}
            title={isAutoPlay ? "Auto-play ON" : "Auto-play OFF"}
          >
            {isAutoPlay ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>

          <div className="relative">
            <button 
              onClick={() => setShowLevelMenu(!showLevelMenu)}
              className="flex items-center gap-2 px-4 py-2 bg-[#F5F5F5] hover:bg-[#EEEEEE] rounded-full text-sm font-semibold transition-all border border-transparent hover:border-[#DDD]"
            >
              <span className={cn(
                "w-2 h-2 rounded-full",
                level === "Superbeginner" ? "bg-green-500" : 
                level === "Beginner" ? "bg-yellow-500" : "bg-orange-500"
              )} />
              {level}
              <ChevronDown size={14} className={cn("transition-transform", showLevelMenu && "rotate-180")} />
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
            <RefreshCw size={20} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden relative">
        {/* Chat Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#FDFCFB]">
          <div 
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-6 space-y-8 scroll-smooth"
          >
            {messages.map((msg, idx) => (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                key={msg.id}
                className={cn(
                  "flex gap-4 max-w-3xl",
                  msg.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto"
                )}
              >
                <div className={cn(
                  "w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center shadow-sm",
                  msg.role === "user" ? "bg-[#4A90E2] text-white" : "bg-white border border-[#EAEAEA] text-[#FF6B6B]"
                )}>
                  {msg.role === "user" ? <User size={20} /> : <Bot size={20} />}
                </div>
                
                <div className={cn(
                  "flex flex-col gap-2",
                  msg.role === "user" ? "items-end" : "items-start"
                )}>
                  <div className={cn(
                    "px-5 py-3.5 rounded-2xl text-[15px] leading-relaxed shadow-sm relative group",
                    msg.role === "user" 
                      ? "bg-[#4A90E2] text-white rounded-tr-none" 
                      : "bg-white border border-[#EAEAEA] text-[#2D2D2D] rounded-tl-none"
                  )}>
                    {msg.text}
                    
                    {msg.role === "assistant" && msg.audioUrl && (
                      <button 
                        onClick={() => playAudio(msg.audioUrl!, msg.id)}
                        className={cn(
                          "absolute -right-10 top-0 p-2 rounded-full transition-all opacity-0 group-hover:opacity-100",
                          currentlyPlayingId === msg.id ? "bg-[#FF6B6B] text-white opacity-100" : "bg-[#F5F5F5] text-[#8E8E8E] hover:text-[#FF6B6B]"
                        )}
                      >
                        {currentlyPlayingId === msg.id ? <Square size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                      </button>
                    )}
                  </div>
                  
                  {msg.svg && (
                    <motion.div 
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="mt-2 p-3 bg-white border border-[#EAEAEA] rounded-2xl shadow-md w-48 h-48 flex items-center justify-center overflow-hidden"
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
              <div className="flex gap-4 mr-auto">
                <div className="w-10 h-10 rounded-full bg-white border border-[#EAEAEA] text-[#FF6B6B] flex items-center justify-center animate-pulse">
                  <Bot size={20} />
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
          <div className="p-6 bg-white border-t border-[#EAEAEA]">
            <div className="max-w-3xl mx-auto space-y-4">
              <div className="flex gap-2">
                <button 
                  onClick={handleSimplify}
                  className="px-4 py-2 bg-[#FFF5F5] text-[#FF6B6B] border border-[#FFDADA] rounded-xl text-sm font-bold hover:bg-[#FFEAEA] transition-colors flex items-center gap-2"
                >
                  <AlertCircle size={16} />
                  SIMPLIFY
                </button>
                <div className="flex-1 text-xs text-[#8E8E8E] flex items-center gap-2 italic">
                  <Info size={14} />
                  You speak English, I respond in Spanish with drawings.
                </div>
              </div>

              <form onSubmit={sendMessage} className="relative group flex gap-2">
                <div className="relative flex-1">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={isListening ? "Listening..." : "Type or speak in English..."}
                    className={cn(
                      "w-full pl-6 pr-12 py-4 bg-[#F5F5F5] border-2 border-transparent focus:border-[#FF6B6B] focus:bg-white rounded-2xl outline-none transition-all text-[15px] shadow-inner",
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
                  >
                    {isListening ? <Mic size={20} /> : <Mic size={20} />}
                  </button>
                </div>
                <button 
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="px-6 bg-[#FF6B6B] text-white rounded-2xl hover:bg-[#FF5252] disabled:opacity-50 disabled:hover:bg-[#FF6B6B] transition-all flex items-center justify-center shadow-lg shadow-[#FF6B6B]/20"
                >
                  <Send size={20} />
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* Sidebar / Visual Focus */}
        <aside className="hidden lg:flex w-80 border-l border-[#EAEAEA] bg-white flex-col p-6 space-y-6">
          <div className="p-5 bg-[#FDFCFB] border border-[#EAEAEA] rounded-3xl space-y-4">
            <h3 className="font-bold text-sm text-[#4A4A4A] flex items-center gap-2">
              <Sparkles size={16} className="text-[#FF6B6B]" />
              Visual Context
            </h3>
            <div className="aspect-square bg-white border border-[#EAEAEA] rounded-2xl shadow-inner flex items-center justify-center overflow-hidden p-4">
              {messages[messages.length - 1]?.svg ? (
                <svg 
                  viewBox="0 0 100 100" 
                  className="w-full h-full"
                  dangerouslySetInnerHTML={{ __html: messages[messages.length - 1].svg! }}
                />
              ) : (
                <div className="text-[#CECECE] text-center px-4">
                  <Sparkles size={40} className="mx-auto mb-2 opacity-20" />
                  <p className="text-xs font-medium">Drawings will appear here as we talk.</p>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-bold text-sm text-[#4A4A4A] flex items-center gap-2">
              <Settings size={16} className="text-[#8E8E8E]" />
              Voice Controls
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-[#F9F9F9] rounded-2xl">
                <span className="text-xs font-medium text-[#6E6E6E]">Auto-play Voice</span>
                <button 
                  onClick={() => setIsAutoPlay(!isAutoPlay)}
                  className={cn(
                    "w-10 h-5 rounded-full transition-all relative",
                    isAutoPlay ? "bg-[#FF6B6B]" : "bg-[#DDD]"
                  )}
                >
                  <div className={cn(
                    "absolute top-1 w-3 h-3 bg-white rounded-full transition-all",
                    isAutoPlay ? "right-1" : "left-1"
                  )} />
                </button>
              </div>
              <p className="text-[10px] text-[#8E8E8E] leading-relaxed">
                When enabled, I will speak my Spanish responses automatically using Gemini TTS.
              </p>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
