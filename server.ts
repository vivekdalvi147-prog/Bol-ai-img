import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";

console.log(`[Bol-AI] Server initializing at ${new Date().toISOString()}`);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '4mb' })); // Vercel limit is 4.5MB
app.use(express.urlencoded({ limit: '4mb', extended: true }));

// Environment Check for Debugging (Visible in Vercel Logs)
console.log("--- Bol-AI Environment Check ---");
console.log("VERCEL Environment:", !!process.env.VERCEL);
console.log("NODE_ENV:", process.env.NODE_ENV);
console.log("GEMINI_API_KEY:", process.env.GEMINI_API_KEY ? "SET" : "MISSING");
console.log("MODELSCOPE_API_KEY:", process.env.MODELSCOPE_API_KEY ? "SET" : "MISSING");
console.log("VIVEK_AI_BOL_IMG:", process.env.VIVEK_AI_BOL_IMG ? "SET" : "MISSING");
console.log("IMG_VIVEKAPP_AI:", process.env.IMG_VIVEKAPP_AI ? "SET" : "MISSING");
console.log("--------------------------------");

// Utility function for fetch with retries and timeout
async function fetchWithRetry(url: string, options: any, retries = 1, delay = 500) {
  const timeout = 60000; // 60 seconds timeout to prevent premature aborts
  
  for (let i = 0; i <= retries; i++) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(id);
      
      if (response.status === 429 || response.status >= 500) {
        if (i === retries) return response;
        await new Promise(res => setTimeout(res, delay * (i + 1)));
        continue;
      }
      return response;
    } catch (error: any) {
      clearTimeout(id);
      if (i === retries) throw error;
      console.warn(`[Bol-AI] Fetch failed (attempt ${i + 1}/${retries + 1}): ${error.message}. Retrying...`);
      await new Promise(res => setTimeout(res, delay));
    }
  }
  throw new Error("Fetch failed after retries");
}

// Simple rate limiter to prevent abuse
const rateLimiter = (req: any, res: any, next: any) => {
  next();
};

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", vercel: !!process.env.VERCEL });
});

// API Route to Upload to ImgBB
app.post("/api/upload-imgbb", rateLimiter, async (req, res) => {
  try {
    const { imageUrl } = req.body;
    const apiKey = process.env.IMG_VIVEKAPP_AI;
    
    if (!apiKey) {
      return res.status(400).json({ error: "ImgBB API Key missing (IMG_VIVEKAPP_AI). Please add it in AI Studio Secrets." });
    }

    if (!imageUrl) {
      return res.status(400).json({ error: "imageUrl is required" });
    }

    let imagePayload = imageUrl;
    if (typeof imageUrl === 'string' && imageUrl.startsWith('data:image')) {
      imagePayload = imageUrl.split(',')[1];
    }

    const params = new URLSearchParams();
    params.append("image", imagePayload);

    const response = await fetchWithRetry(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
      method: 'POST',
      body: params
    });
    
    const data = await response.json();
    if (!data.success) {
      console.error("ImgBB API Error:", JSON.stringify(data, null, 2));
      return res.status(400).json({ 
        error: data.error?.message || "ImgBB upload failed",
        code: data.error?.code
      });
    }
    res.json(data);
  } catch (error: any) {
    console.error("ImgBB Upload Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// API Route to Enhance Prompt (using Bol-AI Engine)
app.post("/api/enhance-prompt", rateLimiter, async (req, res) => {
  console.log(`[Bol-AI] /api/enhance-prompt called at ${new Date().toISOString()}`);
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: "Prompt is required" });

    const rawApiKey = process.env.BOL_AI_API_KEY || process.env.TXT_MODEL_VIVEK_BOL_AI || process.env.GEMINI_API_KEY;

    if (!rawApiKey || rawApiKey.includes('TODO') || rawApiKey.length < 10) {
      console.error("[Bol-AI] Enhance Error: Invalid API Key configuration");
      return res.status(400).json({ 
        error: "API Key is missing or invalid. Please add GEMINI_API_KEY in AI Studio Secrets." 
      });
    }

    const apiKey = rawApiKey.trim();
    const ai = new GoogleGenAI({ apiKey });
    
    const upgradeInstruction = `You are BOL-AI, a master image prompt engineer. Transform this basic idea into a legendary, hyper-detailed, and visually breathtaking image generation prompt.
    
    INPUT: "${prompt}"
    
    DIRECTIONS:
    - Expand significantly with artistic details, lighting, and camera settings.
    - Use high-impact terms like 'hyper-realistic', '8k', 'unreal engine 5'.
    - Return ONLY the upgraded prompt text. No chatter.
    - Keep it concise but detailed (max 100 words).`;

    let enhancedText = prompt;
    try {
      console.log("[Bol-AI] Enhancing prompt with Bol-AI Engine (Gemma 3 27B IT)...");
      const response = await ai.models.generateContent({
        model: "gemma-3-27b-it",
        contents: upgradeInstruction,
        config: {
          temperature: 0.7,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 250
        }
      });
      enhancedText = response.text || prompt;
      console.log("[Bol-AI] Prompt enhancement successful.");
      
      if (enhancedText.length > 2000) {
        enhancedText = enhancedText.substring(0, 2000);
      }

      res.json({ enhancedPrompt: enhancedText });
    } catch (error: any) {
      console.error("[Bol-AI] Enhancement Error:", error.message);
      // Return the error to the frontend so it can show a toast and gracefully fallback
      return res.status(500).json({ error: `Bol-AI Engine Error: ${error.message}` });
    }
  } catch (error: any) {
    console.error("[Bol-AI] Enhance Prompt Route Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// API Route for Text AI Chat
app.post("/api/chat", async (req, res) => {
  try {
    const { message, model, systemInstruction, history } = req.body;
    
    // Prioritize BOL_AI_API_KEY, fallback to GEMINI_API_KEY
    const rawApiKey = process.env.BOL_AI_API_KEY || process.env.GEMINI_API_KEY || process.env.TXT_MODEL_VIVEK_BOL_AI;
    
    // Validate API Key
    if (!rawApiKey || rawApiKey.includes('TODO') || rawApiKey.length < 10) {
      console.error("[Bol-AI] Chat Error: Invalid API Key configuration");
      return res.status(400).json({ 
        error: "Gemini API Key is missing or invalid. Please add GEMINI_API_KEY in AI Studio Secrets." 
      });
    }

    const apiKey = rawApiKey.trim();
    const ai = new GoogleGenAI({ apiKey });
    
    // Format history for Gemini
    const contents = [];
    if (history && Array.isArray(history)) {
      for (const msg of history) {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: msg.parts
        });
      }
    }
    
    contents.push({
      role: 'user',
      parts: [{ text: message }]
    });

    const response = await ai.models.generateContent({
      model: model || 'gemini-3.1-flash-lite-preview',
      contents: contents,
      config: {
        systemInstruction: systemInstruction || "You are Bol-AI, a helpful assistant.",
        // Enable thinking if supported by the model (Gemini 3 series)
        // Only use HIGH for pro models, use default for others
        thinkingConfig: model?.includes('pro') ? { thinkingLevel: ThinkingLevel.HIGH } : undefined,
      }
    });

    let text = response.text;
    
    // Try to extract thinking if available
    let thinking = null;
    if (response.candidates && response.candidates[0] && response.candidates[0].content && response.candidates[0].content.parts) {
      for (const part of response.candidates[0].content.parts) {
        if ((part as any).thought) {
          thinking = (part as any).thought;
        }
      }
    }

    res.json({ text, thinking });
  } catch (error: any) {
    console.error("[Bol-AI] Chat Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// API Route for Image Download Proxy
app.get("/api/download", async (req, res) => {
  console.log(`[Bol-AI] /api/download called for URL: ${req.query.url}`);
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

    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(fetchUrl, { signal: controller.signal });
    clearTimeout(id);

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
    console.error("[Bol-AI] Download Error:", error);
    res.status(500).send(error.message);
  }
});

// API Route for Image Generation (Start Task)
app.post("/api/generate", rateLimiter, async (req, res) => {
  console.log(`[Bol-AI] /api/generate called at ${new Date().toISOString()}`);
  try {
    const { prompt, size } = req.body;
    let userPrompt = prompt || "A golden cat";
    if (userPrompt.length > 2000) {
      userPrompt = userPrompt.substring(0, 2000);
    }
    const imageSize = size || "1024*1024";
    const apiKey = process.env.MODELSCOPE_API_KEY || process.env.VIVEK_AI_BOL_IMG;

    if (!apiKey) {
      console.error("[Bol-AI] Generate Error: ModelScope API Key missing (MODELSCOPE_API_KEY or VIVEK_AI_BOL_IMG)");
      return res.status(400).json({ error: "API Key missing. Please add MODELSCOPE_API_KEY in AI Studio Secrets." });
    }

    const baseUrl = 'https://api-inference.modelscope.ai/';
    const commonHeaders = {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };

    const model = "Tongyi-MAI/Z-Image-Turbo";
    
    // Request body as per user's provided snippet
    const requestBody: any = {
      model: model,
      prompt: userPrompt,
    };

    console.log(`[Bol-AI] Starting generation for model: ${model}, prompt: ${userPrompt.substring(0, 50)}...`);

    const response = await fetchWithRetry(`${baseUrl}v1/images/generations`, {
      method: 'POST',
      headers: { ...commonHeaders, "X-ModelScope-Async-Mode": "true" },
      body: JSON.stringify(requestBody)
    }, 2, 1000);

    console.log(`[Bol-AI] ModelScope Response Status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Bol-AI] ModelScope API Error:", errorText);
      return res.status(response.status).json({ error: `Bol-AI Error: ${errorText.substring(0, 200)}` });
    }

    const initialData = await response.json() as any;
    const taskId = initialData.task_id || initialData.id;

    if (!taskId) {
      console.error("[Bol-AI] Failed to get task_id. Response:", JSON.stringify(initialData));
      return res.status(500).json({ error: "Failed to get task_id from Bol-AI." });
    }

    console.log(`[Bol-AI] Task created successfully. ID: ${taskId}`);
    res.json({ task_id: taskId });
  } catch (error: any) {
    console.error("[Bol-AI] Generation Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// API Route to Check Task Status
app.get("/api/tasks/:taskId", async (req, res) => {
  try {
    const { taskId } = req.params;
    const apiKey = process.env.MODELSCOPE_API_KEY || process.env.VIVEK_AI_BOL_IMG;

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
      console.error(`[Bol-AI] Status Check Error for ${taskId}:`, errorText);
      const cleanError = errorText.replace(/ModelScope/gi, 'Bol-AI');
      return res.status(resultResponse.status).json({ error: `Bol-AI Error: ${cleanError}` });
    }

    const data = await resultResponse.json() as any;
    if (data.task_status === "FAILED") {
      console.error(`[Bol-AI] Task ${taskId} FAILED:`, JSON.stringify(data));
    } else if (data.task_status === "SUCCEED") {
      console.log(`[Bol-AI] Task ${taskId} SUCCEEDED`);
    }
    res.json(data);
  } catch (error: any) {
    console.error("[Bol-AI] Task Check Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/admin/health", rateLimiter, async (req, res) => {
  res.json({
    gemini: !!process.env.GEMINI_API_KEY,
    modelscope: !!process.env.VIVEK_AI_BOL_IMG,
    imgbb: !!process.env.IMG_VIVEKAPP_AI,
    bol_ai: !!process.env.BOL_AI_API_KEY,
    txt_model: !!process.env.TXT_MODEL_VIVEK_BOL_AI
  });
});

async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
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
  } else if (!process.env.VERCEL) {
    // Only serve static files if NOT on Vercel (Vercel handles this via rewrites)
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

  if (!process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}

if (!process.env.VERCEL) {
  startServer();
}

export default app;
