import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Rate Limiting: 2 requests per second per user (IP)
interface RateLimitData {
  count: number;
  resetTime: number;
}
const ipRequests = new Map<string, RateLimitData>();
const WINDOW_MS = 1000; // 1 second
const MAX_REQUESTS_PER_WINDOW = 2;

const rateLimiter = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  
  let data = ipRequests.get(ip);
  
  if (!data || now > data.resetTime) {
    // Reset or initialize window
    data = { count: 1, resetTime: now + WINDOW_MS };
    ipRequests.set(ip, data);
    return next();
  }
  
  if (data.count >= MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({ error: "Too many requests. Limit is 2 requests per second." });
  }
  
  data.count++;
  ipRequests.set(ip, data);
  next();
};

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// API Route to Enhance Prompt (using Gemma 3 27B / Gemini proxy)
app.post("/api/enhance-prompt", rateLimiter, async (req, res) => {
  try {
    const { prompt } = req.body;
    const apiKey = process.env.TXT_MODEL_VIVEK_BOL_AI;

    if (!apiKey) {
      return res.status(400).json({ error: "API Key missing (TXT_MODEL_VIVEK_BOL_AI). Please add it in AI Studio Secrets." });
    }

    const ai = new GoogleGenAI({ apiKey });
    
    const upgradeInstruction = `You are an elite AI image generation prompt engineer. Your sole purpose is to upgrade the user's basic prompt into a highly detailed, cinematic, and visually striking masterpiece prompt. 

RULES:
1. If the prompt is in another language (like Hindi), translate it to English first.
2. Structure the prompt clearly: Subject, Medium, Style, Lighting, Color Palette, Camera Angle, and Composition.
3. Add specific, high-end details (e.g., 'volumetric lighting', 'cinematic composition', 'hyper-realistic', '8k resolution', 'Unreal Engine 5 render', 'intricate details').
4. Ensure the final prompt is highly descriptive, evocative, and under 2000 characters.
5. ONLY output the upgraded prompt text. Do NOT include any conversational filler, explanations, or introductory text.

USER PROMPT TO UPGRADE:
"${prompt}"`;

    const response = await ai.models.generateContent({
      model: "gemma-3-27b-it", // Using Gemma 3 27B as requested
      contents: upgradeInstruction
    });

    res.json({ enhancedPrompt: response.text });
  } catch (error: any) {
    console.error("Enhance Prompt Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// API Route for Image Download Proxy
app.get("/api/download", async (req, res) => {
  try {
    const { url } = req.query;
    if (!url || typeof url !== 'string') {
      return res.status(400).send("URL is required");
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader('Content-Disposition', 'attachment; filename="bol-ai-masterpiece.png"');
    res.setHeader('Content-Type', response.headers.get('content-type') || 'image/png');
    res.send(buffer);
  } catch (error: any) {
    console.error("Download Error:", error);
    res.status(500).send(error.message);
  }
});

// API Route for Image Generation (Start Task)
app.post("/api/generate", rateLimiter, async (req, res) => {
  try {
    const { prompt, size } = req.body;
    const userPrompt = prompt || "A golden cat";
    const imageSize = size || "1024*1024";
    const apiKey = process.env.VIVEK_AI_BOL_IMG;

    if (!apiKey) {
      return res.status(400).json({ error: "API Key missing (VIVEK_AI_BOL_IMG). Please add it in AI Studio Secrets." });
    }

    const baseUrl = 'https://api-inference.modelscope.ai/';
    const commonHeaders = {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };

    // 1. Image Generation Task
    const response = await fetch(`${baseUrl}v1/images/generations`, {
      method: 'POST',
      headers: { ...commonHeaders, "X-ModelScope-Async-Mode": "true" },
      body: JSON.stringify({
        model: "Tongyi-MAI/Z-Image-Turbo",
        prompt: userPrompt,
        parameters: {
          size: imageSize
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: `ModelScope API Error: ${errorText}` });
    }

    const initialData = await response.json() as any;
    const taskId = initialData.task_id;

    if (!taskId) {
      return res.status(500).json({ error: "Failed to get task_id from ModelScope." });
    }

    res.json({ task_id: taskId });
  } catch (error: any) {
    console.error("Generation Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// API Route to Check Task Status
app.get("/api/tasks/:taskId", async (req, res) => {
  try {
    const { taskId } = req.params;
    const apiKey = process.env.VIVEK_AI_BOL_IMG;

    if (!apiKey) {
      return res.status(400).json({ error: "API Key missing." });
    }

    const baseUrl = 'https://api-inference.modelscope.ai/';
    const commonHeaders = {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };

    const resultResponse = await fetch(`${baseUrl}v1/tasks/${taskId}`, {
      method: 'GET',
      headers: { ...commonHeaders, "X-ModelScope-Task-Type": "image_generation" },
    });

    if (!resultResponse.ok) {
      const errorText = await resultResponse.text();
      return res.status(resultResponse.status).json({ error: `ModelScope API Error: ${errorText}` });
    }

    const data = await resultResponse.json() as any;
    res.json(data);
  } catch (error: any) {
    console.error("Task Check Error:", error);
    res.status(500).json({ error: error.message });
  }
});

async function startServer() {
  const PORT = process.env.PORT || 3000;

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

// Only start the server if we are not running on Vercel
if (!process.env.VERCEL) {
  startServer();
}

export default app;
