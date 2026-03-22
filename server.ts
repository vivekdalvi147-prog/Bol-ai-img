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

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // API Route for Image Generation (Start Task)
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
