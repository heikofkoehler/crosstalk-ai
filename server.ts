import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type, Modality } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is missing.");
  }
  return new GoogleGenAI({ 
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build'
      }
    }
  });
}

const CHAT_MODELS = [
  "gemini-flash-latest",
  "gemini-3.7-flash",
  "gemini-3.1-flash-lite"
];

const TTS_MODELS = [
  "gemini-3.1-flash-tts-preview"
];

// Timestamp until which cloud TTS is paused due to free-tier quota exhaustion (10 reqs/day) or rate limits
let ttsQuotaExceededUntil = 0;

async function generateSpeechWithResilience(ai: GoogleGenAI, text: string): Promise<string | null> {
  const cleanText = (text || "").trim();
  if (!cleanText) return null;

  // If in quota/rate limit cooldown, bypass immediately without wasting calls or generating logs
  if (Date.now() < ttsQuotaExceededUntil) {
    return null;
  }

  for (const ttsModel of TTS_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model: ttsModel,
        contents: [{ parts: [{ text: cleanText }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: "Kore" }
            }
          }
        }
      });
      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) return base64Audio;
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      
      // If free-tier quota exceeded (10 reqs/day limit) or rate limited
      if (
        errMsg.includes("RESOURCE_EXHAUSTED") || 
        errMsg.includes("429") || 
        errMsg.includes("Quota exceeded") || 
        errMsg.includes("quota")
      ) {
        // Pause cloud TTS calls for 60 seconds so browser voice takes over smoothly with 0 latency
        ttsQuotaExceededUntil = Date.now() + 60 * 1000;
        return null;
      }

      // If temporary 503 high demand, try one fast retry after 500ms
      if (errMsg.includes("503") || err?.status === 503 || errMsg.includes("high demand") || errMsg.includes("UNAVAILABLE")) {
        try {
          await new Promise(r => setTimeout(r, 500));
          const retryRes = await ai.models.generateContent({
            model: ttsModel,
            contents: [{ parts: [{ text: cleanText }] }],
            config: {
              responseModalities: [Modality.AUDIO],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: "Kore" }
                }
              }
            }
          });
          const retryAudio = retryRes.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
          if (retryAudio) return retryAudio;
        } catch {
          return null;
        }
      }

      return null;
    }
  }
  return null;
}

// Model cooldown map for models that return 503 / high demand
const modelCooldownMap = new Map<string, number>();

async function callChatWithResilience(ai: GoogleGenAI, payload: any): Promise<any> {
  let lastErr: any = null;
  const now = Date.now();

  // Order models: first those not in cooldown, then the rest
  const sortedModels = [...CHAT_MODELS].sort((a, b) => {
    const aCooldown = (modelCooldownMap.get(a) || 0) > now ? 1 : 0;
    const bCooldown = (modelCooldownMap.get(b) || 0) > now ? 1 : 0;
    return aCooldown - bCooldown;
  });

  // Try each model in sequence
  for (const model of sortedModels) {
    try {
      const response = await ai.models.generateContent({
        ...payload,
        model
      });
      if (response && response.text) {
        // Success: clear cooldown for this model
        modelCooldownMap.delete(model);
        return response;
      }
    } catch (err: any) {
      lastErr = err;
      const errMsg = err?.message || String(err);
      if (errMsg.includes("503") || err?.status === 503 || errMsg.includes("high demand") || errMsg.includes("UNAVAILABLE")) {
        // Mark model as experiencing temporary spike for 30 seconds so next calls go to other models immediately
        modelCooldownMap.set(model, Date.now() + 30 * 1000);
        // Continue to the next sibling model immediately without delay
        continue;
      } else if (errMsg.includes("429") || errMsg.includes("quota") || errMsg.includes("RESOURCE_EXHAUSTED")) {
        modelCooldownMap.set(model, Date.now() + 60 * 1000);
        continue;
      } else {
        // If it's a structural error, move to next model
        continue;
      }
    }
  }

  // If all models failed on the first pass, do one short-delayed second attempt on non-cooldown models
  await new Promise(res => setTimeout(res, 500));
  for (const model of CHAT_MODELS) {
    try {
      const response = await ai.models.generateContent({
        ...payload,
        model
      });
      if (response && response.text) {
        modelCooldownMap.delete(model);
        return response;
      }
    } catch (err: any) {
      lastErr = err;
    }
  }

  throw lastErr || new Error("All language models are currently experiencing high demand. Please try again in a few moments.");
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.use(express.text({ limit: "50mb" }));

  // API: Health check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  // API: Chat with Crosstalk Partner
  app.post("/api/chat", async (req, res) => {
    try {
      const { messages, input, level = "Beginner" } = req.body;

      if (!input || typeof input !== "string") {
        return res.status(400).json({ error: "Input text is required." });
      }

      const ai = getGeminiClient();

      const levelPedagogy: Record<string, string> = {
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
      };

      const selectedPedagogy = levelPedagogy[level] || levelPedagogy.Beginner;

      const systemInstruction = `
You are an expert Spanish Crosstalk Partner adhering strictly to Comprehensible Input and Automatic Language Growth (ALG) pedagogy.

CORE PEDAGOGICAL PILLARS:
1. 100% SPANISH IMMERSION: Always respond in Spanish. NEVER use English in "spanish_text". The user speaks in English; you provide the natural Spanish conversational counterpart.
2. COMPREHENSIBLE INPUT & VISUAL ANCHORS: You communicate through context, non-verbal scaffolding, and explicit visual correlation. Every key noun, action, or theme in your Spanish response MUST be visually represented in the SVG drawing.
3. ADAPTIVE LEVEL EXECUTION:
Current Selected Level: ${level}
${selectedPedagogy}

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

      const history = Array.isArray(messages)
        ? messages
            .filter((m: any) => m && m.text && !String(m.id || "").startsWith("error-"))
            .slice(-8)
            .map((m: any) => ({
              role: m.role === "assistant" || m.role === "model" ? "model" : "user",
              parts: [{ text: String(m.text).slice(0, 500) }]
            }))
        : [];

      const response = await callChatWithResilience(ai, {
        contents: [
          ...history,
          { role: "user", parts: [{ text: input }] }
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

      const responseText = response.text || "{}";
      let data: any;
      try {
        data = JSON.parse(responseText);
      } catch (parseErr) {
        const match = responseText.match(/\{[\s\S]*\}/);
        if (match) {
          data = JSON.parse(match[0]);
        } else {
          throw new Error("Unable to parse model JSON response");
        }
      }

      return res.json(data);
    } catch (error: any) {
      console.error("Error in /api/chat:", error);
      const rawMsg = error?.message || String(error);
      let userMsg = "Failed to process chat message. Please try again.";
      if (rawMsg.includes("503") || rawMsg.includes("high demand") || rawMsg.includes("UNAVAILABLE")) {
        userMsg = "The AI service is experiencing a temporary spike in demand. Please try sending your message again in a moment.";
      } else if (rawMsg.includes("429") || rawMsg.includes("RESOURCE_EXHAUSTED") || rawMsg.includes("quota")) {
        userMsg = "Rate limit reached. Please wait a few seconds and try again.";
      } else if (error?.message && !error.message.startsWith("{")) {
        userMsg = error.message;
      }
      return res.status(500).json({ 
        error: userMsg,
        details: String(error)
      });
    }
  });

  // API: Text-To-Speech
  app.post("/api/tts", async (req, res) => {
    try {
      const { text } = req.body;
      if (!text || typeof text !== "string") {
        return res.status(400).json({ error: "Text is required for TTS." });
      }

      const ai = getGeminiClient();
      const base64Audio = await generateSpeechWithResilience(ai, text);

      if (!base64Audio) {
        // Return 200 with audioBase64: null so client seamlessly uses browser Web Speech API
        return res.json({ 
          audioBase64: null, 
          fallback: true,
          message: "TTS voice synthesis currently busy or quota reached, using browser speech synthesis." 
        });
      }

      return res.json({ audioBase64: base64Audio });
    } catch (error: any) {
      console.warn("TTS processing notice:", error?.message || error);
      return res.json({ 
        audioBase64: null, 
        fallback: true,
        message: "TTS fallback to browser speech synthesis" 
      });
    }
  });

  // API Error handler for payload limits or JSON malformation
  app.use("/api", (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.warn("API middleware error caught:", err?.message || err);
    if (err?.type === "entity.too.large" || err?.status === 413) {
      return res.status(413).json({ error: "Payload too large. Please send a shorter message." });
    }
    return res.status(err?.status || 500).json({ error: err?.message || "Server error processing request" });
  });

  // Vite middleware for development vs static build for production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
