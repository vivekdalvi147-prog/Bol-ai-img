import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use global fetch if available, otherwise fallback to node-fetch
const getFetch = async () => {
  if (typeof fetch !== 'undefined') return fetch;
  const nodeFetch = await import("node-fetch");
  return nodeFetch.default;
};

const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Simple rate limiter to prevent abuse
const rateLimiter = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  // Basic implementation, can be expanded if needed
  next();
};

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Utility function for fetch with retries
async function fetchWithRetry(url: string, options: any, retries = 3, delay = 1000) {
  const fetchFn = await getFetch() as any;
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetchFn(url, options);
      if (response.status === 429 || response.status >= 500) {
        const text = await response.text();
        console.warn(`Fetch attempt ${i + 1} failed with status ${response.status}: ${text.substring(0, 100)}`);
        if (i === retries - 1) return response;
        await new Promise(res => setTimeout(res, delay * (i + 1))); // Exponential backoff
        continue;
      }
      return response;
    } catch (error: any) {
      if (i === retries - 1) throw error;
      console.warn(`Fetch failed (attempt ${i + 1}/${retries}): ${error.message}. Retrying...`);
      await new Promise(res => setTimeout(res, delay));
    }
  }
  throw new Error("Fetch failed after retries");
}

// API Route to Upload to ImgBB
app.post("/api/upload-imgbb", rateLimiter, async (req, res) => {
  try {
    const { imageUrl } = req.body;
    const apiKey = process.env.IMG_VIVEKAPP_AI;
    
    if (!apiKey) {
      return res.status(400).json({ error: "ImgBB API Key missing (IMG_VIVEKAPP_AI). Please add it in AI Studio Secrets." });
    }

    let imagePayload = imageUrl;
    if (imageUrl.startsWith('data:image')) {
      imagePayload = imageUrl.split(',')[1];
    }

    const params = new URLSearchParams();
    params.append("image", imagePayload);

    const response = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
      method: 'POST',
      body: params
    });
    
    const data = await response.json();
    res.json(data);
  } catch (error: any) {
    console.error("ImgBB Upload Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// API Route to Enhance Prompt (using Bol-AI Engine)
app.post("/api/enhance-prompt", rateLimiter, async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: "Prompt is required" });

    const apiKey = process.env.BOL_AI_API_KEY || process.env.TXT_MODEL_VIVEK_BOL_AI || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(400).json({ error: "API Key missing. Please add GEMINI_API_KEY in AI Studio Secrets." });
    }

    const ai = new GoogleGenAI({ apiKey });
    
    const upgradeInstruction = `You are BOL-AI, a master image prompt engineer. Transform this basic idea into a legendary, hyper-detailed, and visually breathtaking image generation prompt.
    
    INPUT: "${prompt}"
    
    DIRECTIONS:
    - Expand significantly with artistic details, lighting, and camera settings.
    - Use high-impact terms like 'hyper-realistic', '8k', 'unreal engine 5'.
    - Return ONLY the upgraded prompt text. No chatter.
    - Max 2000 characters.`;

    let enhancedText = prompt;
    try {
      // Try Gemma 2 27B IT as requested by user
      console.log("Attempting prompt enhancement with Gemma 2 27B IT...");
      const response = await ai.models.generateContent({
        model: "gemma-2-27b-it",
        contents: upgradeInstruction,
        config: {
          temperature: 0.7,
          topP: 0.95,
          topK: 40,
        }
      });
      enhancedText = response.text || prompt;
      console.log("Gemma enhancement successful.");
    } catch (gemmaError: any) {
      console.warn("Gemma 27B failed, falling back to Gemini 3.1 Flash Lite:", gemmaError.message);
      // Fallback to Gemini 3.1 Flash Lite
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite-preview",
        contents: upgradeInstruction
      });
      enhancedText = response.text || prompt;
      console.log("Gemini fallback enhancement successful.");
    }

    if (enhancedText.length > 2000) {
      enhancedText = enhancedText.substring(0, 2000);
    }

    res.json({ enhancedPrompt: enhancedText });
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

    let fetchUrl = url;
    if (url.startsWith('/')) {
      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      const host = req.headers.host;
      fetchUrl = `${protocol}://${host}${url}`;
    }

    const fetchFn = await getFetch() as any;
    const response = await fetchFn(fetchUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || 'image/png';
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="bol-ai-${Date.now()}.png"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Access-Control-Allow-Origin', '*');
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
    let userPrompt = prompt || "A golden cat";
    if (userPrompt.length > 2000) {
      userPrompt = userPrompt.substring(0, 2000);
    }
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

    const model = "Tongyi-MAI/Z-Image-Turbo";
    
    // 1. Image Generation Task
    const [width, height] = imageSize.split('*').map(Number);
    
    // Simplified request body as per api_call.py
    const requestBody: any = {
      model: model,
      prompt: userPrompt,
    };

    // Only add size if it's not default to avoid potential API issues
    if (imageSize !== "1024*1024") {
      requestBody.parameters = {
        size: `${width}x${height}`
      };
    }

    console.log(`Starting generation for model: ${model}, prompt: ${userPrompt.substring(0, 50)}...`);

    const response = await fetchWithRetry(`${baseUrl}v1/images/generations`, {
      method: 'POST',
      headers: { ...commonHeaders, "X-ModelScope-Async-Mode": "true" },
      body: JSON.stringify(requestBody)
    }, 2, 1000);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ModelScope API Error:", errorText);
      return res.status(response.status).json({ error: `Bol-AI Error: ${errorText.substring(0, 200)}` });
    }

    const initialData = await response.json() as any;
    const taskId = initialData.task_id || initialData.id;

    if (!taskId) {
      return res.status(500).json({ error: "Failed to get task_id from Bol-AI. Response: " + JSON.stringify(initialData) });
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

    const resultResponse = await fetchWithRetry(`${baseUrl}v1/tasks/${taskId}`, {
      method: 'GET',
      headers: { ...commonHeaders, "X-ModelScope-Task-Type": "image_generation" },
    }, 3, 1000);

    if (!resultResponse.ok) {
      const errorText = await resultResponse.text();
      const cleanError = errorText.replace(/ModelScope/gi, 'Bol-AI');
      return res.status(resultResponse.status).json({ error: `Bol-AI Error: ${cleanError}` });
    }

    const data = await resultResponse.json() as any;
    res.json(data);
  } catch (error: any) {
    console.error("Task Check Error:", error);
    res.status(500).json({ error: error.message });
  }
});

async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;

  console.log("Environment Check:");
  console.log("- GEMINI_API_KEY:", process.env.GEMINI_API_KEY ? "SET" : "MISSING");
  console.log("- VIVEK_AI_BOL_IMG:", process.env.VIVEK_AI_BOL_IMG ? "SET" : "MISSING");
  console.log("- IMG_VIVEKAPP_AI:", process.env.IMG_VIVEKAPP_AI ? "SET" : "MISSING");
  console.log("- BOL_AI_API_KEY:", process.env.BOL_AI_API_KEY ? "SET" : "MISSING");
  console.log("- TXT_MODEL_VIVEK_BOL_AI:", process.env.TXT_MODEL_VIVEK_BOL_AI ? "SET" : "MISSING");

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);

    // Development route for admin panel
    app.get('/admin', (req, res) => {
      res.sendFile(path.join(process.cwd(), 'public', 'admin.html'));
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    
    // Clean route for admin panel
    app.get('/admin', (req, res) => {
      res.sendFile(path.join(distPath, 'admin.html'));
    });

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
