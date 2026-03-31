import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import fetch from "node-fetch";
import os from "os";
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  updateDoc, 
  addDoc, 
  serverTimestamp, 
  increment, 
  getDoc,
  orderBy,
  limit
} from "firebase/firestore";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load Firebase Config
const firebaseConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8'));
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

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

// Background Request Worker
const activeTasks = new Set<string>();

async function processRequest(requestId: string, requestData: any) {
  if (activeTasks.has(requestId)) return;
  activeTasks.add(requestId);
  
  console.log(`[Worker] Processing request ${requestId} for user ${requestData.userEmail || 'anonymous'}`);
  
  const startTime = Date.now();
  const TIMEOUT_MS = 180000; // 3 minutes
  
  try {
    const { prompt, size, imageUrl: refImageUrl, userId, userEmail, isEnhanced, enhancedPrompt: existingEnhancedPrompt } = requestData;
    let finalPrompt = existingEnhancedPrompt || prompt;

    // 0. Enhance Prompt if requested but not yet enhanced
    if (isEnhanced && !existingEnhancedPrompt) {
      console.log(`[Worker] Enhancing prompt for ${requestId}...`);
      try {
        const apiKey = process.env.BOL_AI_API_KEY || process.env.TXT_MODEL_VIVEK_BOL_AI;
        if (apiKey) {
          const ai = new GoogleGenAI({ apiKey });
          const upgradeInstruction = `You are BOL-AI, the world's most advanced image prompt engineer. Transform this basic idea into a legendary, hyper-detailed, and visually breathtaking image generation prompt. Return ONLY the upgraded prompt text. No chatter.
          
          USER INPUT: "${prompt}"
          MODE: ${refImageUrl ? 'IMAGE EDIT (IMG-TO-IMG)' : 'NEW GENERATION'}`;

          const contents: any[] = [{ text: upgradeInstruction }];
          if (refImageUrl && refImageUrl.startsWith('http')) {
            const imgRes = await fetch(refImageUrl);
            if (imgRes.ok) {
              const buffer = await imgRes.arrayBuffer();
              const base64 = Buffer.from(buffer).toString('base64');
              contents.push({ inlineData: { data: base64, mimeType: imgRes.headers.get('content-type') || 'image/png' } });
            }
          }

          const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: { parts: contents }
          });
          finalPrompt = response.text;
          
          // Update request with enhanced prompt
          await updateDoc(doc(db, 'requests', requestId), {
            enhancedPrompt: finalPrompt
          });
        }
      } catch (e) {
        console.warn("[Worker] Prompt enhancement failed, using original", e);
      }
    }
    
    // 1. Start Generation
    const apiKey = process.env.VIVEK_AI_BOL_IMG;
    if (!apiKey) throw new Error("VIVEK_AI_BOL_IMG API Key missing");

    const baseUrl = 'https://api-inference.modelscope.ai/';
    const model = refImageUrl ? "MusePublic/Qwen-Image-Edit" : "Tongyi-MAI/Z-Image-Turbo";
    const [width, height] = (size || "1024*1024").split('*').map(Number);

    let requestBody: any;
    if (refImageUrl) {
      requestBody = {
        model: "MusePublic/Qwen-Image-Edit",
        input: { prompt: finalPrompt.substring(0, 500), image_url: refImageUrl },
        parameters: { n: 1, size: size.replace('x', '*'), width, height }
      };
    } else {
      requestBody = {
        model: model,
        input: { prompt: finalPrompt.substring(0, 1800) },
        parameters: { n: 1, size: size.replace('x', '*'), width, height }
      };
    }

    const startRes = await fetch(`${baseUrl}v1/images/generations`, {
      method: 'POST',
      headers: { 
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-ModelScope-Async-Mode": "true" 
      },
      body: JSON.stringify(requestBody)
    });

    if (!startRes.ok) {
      const errText = await startRes.text();
      throw new Error(`ModelScope Start Error: ${errText}`);
    }

    const startData = await startRes.json() as any;
    const taskId = startData.task_id || startData.id;

    if (!taskId) {
      // Check if it returned a direct URL (sync mode)
      const directUrl = startData.output?.url || startData.data?.[0]?.url || startData.url;
      if (directUrl) {
        await finalizeRequest(requestId, requestData, directUrl, startTime);
        return;
      }
      throw new Error("No task_id returned");
    }

    // 2. Polling
    let isComplete = false;
    let attempts = 0;
    
    while (!isComplete && (Date.now() - startTime) < TIMEOUT_MS) {
      await new Promise(r => setTimeout(r, 3000));
      attempts++;

      const statusRes = await fetch(`${baseUrl}v1/tasks/${taskId}`, {
        method: 'GET',
        headers: { "Authorization": `Bearer ${apiKey}`, "X-ModelScope-Task-Type": "image_generation" }
      });

      if (!statusRes.ok) continue;
      const statusData = await statusRes.json() as any;
      
      const isSucceeded = statusData.task_status === "SUCCEED" || statusData.status === "SUCCEED" || statusData.task_status === "SUCCESS" || statusData.status === "SUCCESS";
      const isFailed = statusData.task_status === "FAILED" || statusData.status === "FAILED" || statusData.task_status === "ERROR" || statusData.status === "ERROR";

      if (isFailed) throw new Error(`Generation failed: ${statusData.message || 'Unknown error'}`);
      
      if (isSucceeded) {
        const finalUrl = statusData.output_images?.[0] || statusData.output?.url || statusData.data?.[0]?.url || statusData.url;
        if (finalUrl) {
          await finalizeRequest(requestId, requestData, finalUrl, startTime);
          isComplete = true;
        }
      }
    }

    if (!isComplete) {
      throw new Error("Generation Timeout (3m)");
    }

  } catch (error: any) {
    console.error(`[Worker] Error processing ${requestId}:`, error.message);
    await updateDoc(doc(db, 'requests', requestId), {
      status: 'error',
      error: error.message,
      durationMs: Date.now() - startTime
    });
  } finally {
    activeTasks.delete(requestId);
  }
}

async function finalizeRequest(requestId: string, requestData: any, rawUrl: string, startTime: number) {
  let finalUrl = rawUrl;
  
  // 1. Upload to ImgBB
  try {
    const imgbbKey = process.env.IMG_VIVEKAPP_AI;
    if (imgbbKey) {
      const imgRes = await fetch(rawUrl);
      const buffer = await imgRes.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      
      const params = new URLSearchParams();
      params.append("image", base64);
      
      const uploadRes = await fetch(`https://api.imgbb.com/1/upload?key=${imgbbKey}`, {
        method: 'POST',
        body: params
      });
      const uploadData = await uploadRes.json() as any;
      if (uploadData.success) {
        finalUrl = uploadData.data.url;
      }
    }
  } catch (e) {
    console.warn("[Worker] ImgBB upload failed, using raw URL", e);
  }

  // 2. Update Request
  const durationMs = Date.now() - startTime;
  await updateDoc(doc(db, 'requests', requestId), {
    status: 'completed',
    imageUrl: finalUrl,
    durationMs
  });

  // 3. Save to Generations
  const genData = {
    userId: requestData.userId || 'anonymous',
    prompt: requestData.isEnhanced ? requestData.enhancedPrompt : requestData.prompt,
    imageUrl: finalUrl,
    size: requestData.size || "1024*1024",
    createdAt: serverTimestamp(),
    isEnhanced: requestData.isEnhanced || false,
    originalPrompt: requestData.prompt
  };
  await addDoc(collection(db, 'generations'), genData);

  // 4. Update User Count
  if (requestData.userId && requestData.userId !== 'anonymous') {
    const userRef = doc(db, 'users', requestData.userId);
    const today = new Date().toISOString().split('T')[0];
    const userDoc = await getDoc(userRef);
    if (userDoc.exists()) {
      const userData = userDoc.data();
      if (userData.lastGenerationDate !== today) {
        await updateDoc(userRef, { generationsCount: 1, lastGenerationDate: today });
      } else {
        await updateDoc(userRef, { generationsCount: increment(1) });
      }
    }
  }
  
  console.log(`[Worker] Request ${requestId} completed in ${durationMs}ms`);
}

// Start listening for requests
onSnapshot(query(collection(db, 'requests'), where('status', '==', 'active')), (snap) => {
  snap.docs.forEach(d => {
    processRequest(d.id, d.data());
  });
}, (error) => {
  console.error("[Server] Firestore Listener Error:", error);
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// API Route for Hardware Stats
app.get("/api/hardware", async (req, res) => {
  try {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    // Mocking storage stats as requested (10TB total, 61.28GB used)
    // In a real environment, we'd use fs.statfsSync('/')
    const totalStorage = 10 * 1024 * 1024 * 1024 * 1024; // 10 TB
    const usedStorage = 61.28 * 1024 * 1024 * 1024; // 61.28 GB
    const freeStorage = totalStorage - usedStorage;

    // Get Firestore counts for "Firebase Storage" (Database Usage)
    // We'll just count generations as a proxy for database size
    const generationsSnap = await getDoc(doc(db, 'settings', 'stats')); // Using a stats doc if it exists
    let dbDocsCount = 0;
    try {
      // In a real app, we'd use a counter. For now, we'll just return a realistic number
      // or try to fetch a count if we have one.
      dbDocsCount = 12450; // Mocked count for "Firebase Storage" usage
    } catch (e) {}

    const stats = {
      cpu: {
        model: "Bol-AI Quantum X1 (128-Core)",
        cores: 128,
        load: os.loadavg(),
      },
      memory: {
        total: 512 * 1024 * 1024 * 1024, // 512 GB
        free: (512 - 4.2) * 1024 * 1024 * 1024,
        used: 4.2 * 1024 * 1024 * 1024,
        totalGB: "512.00",
        usedGB: "4.20",
        freeGB: "507.80",
        percent: "0.82"
      },
      storage: {
        total: 10 * 1024 * 1024 * 1024 * 1024, // 10 TB
        used: 61.28 * 1024 * 1024 * 1024, // 61.28 GB
        free: (10 * 1024 - 61.28) * 1024 * 1024 * 1024,
        totalTB: "10",
        usedGB: "61.28",
        percent: "0.61"
      },
      firebase: {
        docsCount: dbDocsCount,
        estimatedSizeMB: (dbDocsCount * 0.001).toFixed(2), // Rough estimate: 1KB per doc
        status: "Healthy"
      },
      uptime: os.uptime(),
      platform: os.platform(),
      nodeVersion: process.version
    };
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Utility function for fetch with retries
async function fetchWithRetry(url: string, options: any, retries = 5, delay = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
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
  throw new Error("Bol-AI Server is currently unreachable.");
}

// API Route to Upload to ImgBB
app.post("/api/upload-imgbb", rateLimiter, async (req, res) => {
  try {
    const { imageUrl } = req.body;
    const apiKey = process.env.IMG_VIVEKAPP_AI;
    
    if (!apiKey) {
      return res.status(400).json({ error: "ImgBB API Key missing" });
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
    res.status(500).json({ error: error.message });
  }
});

// API Route to Enhance Prompt
app.post("/api/enhance-prompt", rateLimiter, async (req, res) => {
  try {
    const { prompt, isEdit, image_url } = req.body;
    const apiKey = process.env.BOL_AI_API_KEY || process.env.TXT_MODEL_VIVEK_BOL_AI;

    if (!apiKey) {
      return res.status(400).json({ error: "API Key missing" });
    }

    const ai = new GoogleGenAI({ apiKey });
    
    const upgradeInstruction = `You are BOL-AI, the world's most advanced image prompt engineer. Your mission is to transform basic user ideas into legendary, hyper-detailed, and visually breathtaking image generation prompts.

CORE DIRECTIVES:
1. TRANSLATE & EXPAND: If the input is in Hindi, Hinglish, or any other language, translate it to English and expand it significantly.
2. MODE AWARENESS:
   - IF THIS IS A NEW GENERATION: Structure the prompt with SUBJECT, ENVIRONMENT, STYLE, LIGHTING, and CAMERA.
   - IF THIS IS AN IMAGE EDIT: Focus on the CHANGES or ENHANCEMENTS.
3. LENGTH CONSTRAINT: Your output MUST be under 1500 characters.
4. PURE OUTPUT: Return ONLY the upgraded prompt text. No chatter.

USER INPUT:
"${prompt}"
MODE: ${isEdit ? 'IMAGE EDIT (IMG-TO-IMG)' : 'NEW GENERATION'}`;

    const contents: any[] = [{ text: upgradeInstruction }];
    
    if (image_url && image_url.startsWith('http')) {
      try {
        const imgRes = await fetch(image_url);
        if (imgRes.ok) {
          const buffer = await imgRes.arrayBuffer();
          const base64 = Buffer.from(buffer).toString('base64');
          const mimeType = imgRes.headers.get('content-type') || 'image/png';
          contents.push({ inlineData: { data: base64, mimeType: mimeType } });
        }
      } catch (e) {}
    }

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: { parts: contents }
    });

    res.json({ enhancedPrompt: response.text });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// API Route for Image Download Proxy
app.get("/api/download", async (req, res) => {
  try {
    const { url } = req.query;
    if (!url || typeof url !== 'string') return res.status(400).send("URL is required");

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch image`);

    const contentType = response.headers.get('content-type') || 'image/png';
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="bol-ai-${Date.now()}.png"`);
    res.send(buffer);
  } catch (error: any) {
    res.status(500).send(error.message);
  }
});

async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;

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
    app.get('/admin', (req, res) => res.sendFile(path.join(distPath, 'admin.html')));
    app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  startServer();
}

export default app;
