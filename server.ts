import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route for Image Generation
  app.post("/api/generate", async (req, res) => {
    try {
      const { prompt } = req.body;
      const userPrompt = prompt || "A golden cat";
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
          prompt: userPrompt
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

      // 2. Polling
      let imageUrl = null;
      const maxAttempts = 15;
      
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const resultResponse = await fetch(`${baseUrl}v1/tasks/${taskId}`, {
          method: 'GET',
          headers: { ...commonHeaders, "X-ModelScope-Task-Type": "image_generation" },
        });

        if (!resultResponse.ok) continue;

        const data = await resultResponse.json() as any;

        if (data.task_status === "SUCCEED") {
          imageUrl = data.output_images[0];
          break;
        } else if (data.task_status === "FAILED") {
          return res.status(500).json({ error: "ModelScope logic failed to generate image." });
        }
      }

      if (imageUrl) {
        res.json({ image_url: imageUrl });
      } else {
        res.status(504).json({ error: "Generation Timeout. Please try again." });
      }
    } catch (error: any) {
      console.error("Generation Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
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

startServer();
