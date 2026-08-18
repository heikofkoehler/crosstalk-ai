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
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
  "gemini-3.7-flash"
];

const TTS_MODELS = [
  "gemini-3.1-flash-tts-preview"
];

async function generateSpeechWithResilience(ai: GoogleGenAI, text: string): Promise<string | null> {
  for (const ttsModel of TTS_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: ttsModel,
          contents: [{ parts: [{ text: `Di esto con entusiasmo en español: ${text}` }] }],
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
        console.warn(`TTS attempt ${attempt + 1} (${ttsModel}) notice: ${errMsg}`);
        if (errMsg.includes("503") || err?.status === 503 || errMsg.includes("429") || errMsg.includes("high demand") || errMsg.includes("quota") || errMsg.includes("RESOURCE_EXHAUSTED")) {
          await new Promise(res => setTimeout(res, 500 * (attempt + 1)));
        } else {
          break;
        }
      }
    }
  }
  return null;
}

async function callChatWithResilience(ai: GoogleGenAI, payload: any): Promise<any> {
  let lastErr: any = null;
  for (const model of CHAT_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await ai.models.generateContent({
          ...payload,
          model
        });
        if (response && response.text) {
          return response;
        }
      } catch (err: any) {
        lastErr = err;
        console.warn(`Chat model ${model} attempt ${attempt + 1} failed: ${err?.message || err}`);
        const errMsg = err?.message || String(err);
        if (errMsg.includes("503") || err?.status === 503 || errMsg.includes("429") || errMsg.includes("high demand") || errMsg.includes("quota") || errMsg.includes("RESOURCE_EXHAUSTED")) {
          await new Promise(res => setTimeout(res, 800 * (attempt + 1)));
        } else {
          break; // move to next valid model if not a transient rate limit
        }
      }
    }
  }
  throw lastErr || new Error("All language models are currently experiencing high demand. Please try again in a few moments.");
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

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
        ? messages.map((m: { role: string; text: string }) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.text }]
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
      return res.status(500).json({ 
        error: error.message || "Failed to process chat message",
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
