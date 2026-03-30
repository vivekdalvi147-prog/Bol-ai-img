import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import fetch from "node-fetch";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Rate Limiting: Configurable per IP
interface RateLimitData {
  count: number;
  resetTime: number;
}
const ipRequests = new Map<string, RateLimitData>();
const WINDOW_MS = 60000; // 1 minute window
const DEFAULT_MAX_REQUESTS = 30; // 30 requests per minute

const rateLimiter = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  
  let data = ipRequests.get(ip);
  
  if (!data || now > data.resetTime) {
    data = { count: 1, resetTime: now + WINDOW_MS };
    ipRequests.set(ip, data);
    return next();
  }
  
  if (data.count >= DEFAULT_MAX_REQUESTS) {
    return res.status(429).json({ error: "Too many requests. Please wait a minute before trying again." });
  }
  
  data.count++;
  ipRequests.set(ip, data);
  next();
};

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Utility function for fetch with retries
async function fetchWithRetry(url: string, options: any, retries = 5, delay = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      // Retry on 5xx server errors or 429 Too Many Requests
      if (response.status >= 500 || response.status === 429) {
        throw new Error(`Server Error: ${response.status}`);
      }
      return response;
    } catch (error: any) {
      if (i === retries - 1) throw error;
      console.warn(`Fetch failed (attempt ${i + 1}/${retries}): ${error.message}. Retrying in ${delay}ms...`);
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
    const { prompt, isEdit } = req.body;
    const apiKey = process.env.BOL_AI_API_KEY || process.env.TXT_MODEL_VIVEK_BOL_AI;

    if (!apiKey) {
      return res.status(400).json({ error: "API Key missing (BOL_AI_API_KEY). Please add it in AI Studio Secrets." });
    }

    const ai = new GoogleGenAI({ apiKey });
    
    const upgradeInstruction = `You are BOL-AI, the world's most advanced image prompt engineer. Your mission is to transform basic user ideas into legendary, hyper-detailed, and visually breathtaking image generation prompts.

CORE DIRECTIVES:
1. TRANSLATE & EXPAND: If the input is in Hindi, Hinglish, or any other language, translate it to English and expand it significantly.
2. MODE AWARENESS:
   - IF THIS IS A NEW GENERATION: Structure the prompt with SUBJECT, ENVIRONMENT, STYLE, LIGHTING, and CAMERA. Use high-impact terms like 'hyper-realistic', '8k resolution', 'unreal engine 5 style'.
   - IF THIS IS AN IMAGE EDIT (IMG-TO-IMG): Focus on the CHANGES or ENHANCEMENTS to be made to the reference image. Describe the desired modifications in detail while maintaining the context of the original image.
3. LENGTH CONSTRAINT: Your output MUST be under 1500 characters.
4. PURE OUTPUT: Return ONLY the upgraded prompt text. No chatter.

USER INPUT:
"${prompt}"
MODE: ${isEdit ? 'IMAGE EDIT (IMG-TO-IMG)' : 'NEW GENERATION'}`;

    const response = await ai.models.generateContent({
      model: "gemma-3-27b-it",
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

    let fetchUrl = url;
    if (url.startsWith('/')) {
      // It's a relative URL, construct absolute URL
      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      const host = req.headers.host;
      fetchUrl = `${protocol}://${host}${url}`;
    }

    const response = await fetch(fetchUrl);
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
    const { prompt, size, image_url } = req.body;
    let userPrompt = prompt || "A golden cat";
    
    // Strict truncation to avoid ModelScope 2000 character limit
    if (userPrompt.length > 1800) {
      userPrompt = userPrompt.substring(0, 1800);
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

    // Determine model: If image_url is provided, use Qwen-Image-Edit, otherwise Z-Image-Turbo
    const model = image_url ? "MusePublic/Qwen-Image-Edit" : "Tongyi-MAI/Z-Image-Turbo";
    
    // 1. Image Generation Task
    const [width, height] = imageSize.split('*').map(Number);
    
    // Standard ModelScope request structure
    const requestBody: any = {
      model: model,
      input: {
        prompt: userPrompt,
        image_url: image_url || undefined
      }
    };

    // Add parameters if applicable
    if (!image_url) {
      requestBody.parameters = {
        n: 1,
        size: imageSize.replace('x', '*'), // Ensure 1024*1024 format
        width: width,
        height: height
      };
      // For text-to-image, some models prefer prompt at top level
      requestBody.prompt = userPrompt;
    } else {
      // For image-to-image, some models prefer image_url at top level
      requestBody.image_url = image_url;
      requestBody.parameters = {
        n: 1,
        size: imageSize.replace('x', '*'),
        width: width,
        height: height,
        image_url: image_url
      };
    }

    console.log("ModelScope Request Body:", JSON.stringify(requestBody));
    console.log(`Starting generation for model: ${model}, prompt: ${userPrompt.substring(0, 50)}...`);

    const response = await fetchWithRetry(`${baseUrl}v1/images/generations`, {
      method: 'POST',
      headers: { ...commonHeaders, "X-ModelScope-Async-Mode": "true" },
      body: JSON.stringify(requestBody)
    }, 3, 2000);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ModelScope API Error:", errorText);
      const cleanError = errorText.replace(/ModelScope/gi, 'Bol-AI');
      return res.status(response.status).json({ error: `Bol-AI Error: ${cleanError}` });
    }

    const initialData = await response.json() as any;
    console.log("ModelScope Initial Response:", JSON.stringify(initialData));
    
    // Check for direct result (synchronous)
    const directUrl = initialData.output?.url || initialData.data?.[0]?.url || initialData.url;
    if (directUrl) {
      return res.json({ task_id: 'sync', url: directUrl });
    }

    const taskId = initialData.task_id || initialData.id; // Some models might use 'id' instead of 'task_id'
    
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
    console.log(`Task ${taskId} Status:`, JSON.stringify(data));
    res.json(data);
  } catch (error: any) {
    console.error("Task Check Error:", error);
    res.status(500).json({ error: error.message });
  }
});

async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;

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
