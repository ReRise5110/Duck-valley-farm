import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';

dotenv.config();

const PORT = 3000;
const DATA_DIR = path.resolve(process.cwd(), '.farm-data');
const FARMS_FILE = path.join(DATA_DIR, 'farms.json');

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readSavedFarms(): Promise<unknown[] | null> {
  try {
    const raw = await fs.readFile(FARMS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function writeSavedFarms(farms: unknown[]) {
  await ensureDataDir();
  await fs.writeFile(FARMS_FILE, JSON.stringify(farms, null, 2), 'utf-8');
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/farms', async (_req, res) => {
    try {
      const farms = await readSavedFarms();
      res.json({ farms });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load farms' });
    }
  });

  app.put('/api/farms', async (req, res) => {
    try {
      const { farms } = req.body as { farms?: unknown[] };
      if (!Array.isArray(farms)) {
        return res.status(400).json({ error: 'Expected farms array' });
      }
      await writeSavedFarms(farms);
      res.json({ ok: true, count: farms.length });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to save farms' });
    }
  });

  app.post('/api/notify/line', async (req, res) => {
    const { message, lineToken } = req.body as { message?: string; lineToken?: string };
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    const token = lineToken?.trim() || process.env.LINE_NOTIFY_TOKEN?.trim();
    if (!token) {
      return res.json({
        sent: false,
        mode: 'preview',
        message: 'LINE Notify token not configured on server. Preview logged.',
        previewText: message,
      });
    }

    try {
      const params = new URLSearchParams();
      params.append('message', message);

      const response = await fetch('https://notify-api.line.me/api/notify', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        return res.status(response.status).json({
          sent: false,
          mode: 'line_notify',
          error: (data as { message?: string }).message || 'LINE Notify request failed',
        });
      }

      return res.json({ sent: true, mode: 'line_notify', data });
    } catch (err) {
      return res.status(500).json({
        sent: false,
        error: err instanceof Error ? err.message : 'Failed to send LINE notification',
      });
    }
  });

  app.post('/api/sheets/webhook-sync', async (req, res) => {
    const { webhookUrl, action, payload } = req.body as {
      webhookUrl?: string;
      action?: 'pull' | 'push';
      payload?: unknown;
    };

    if (!webhookUrl || !webhookUrl.startsWith('https://')) {
      return res.status(400).json({ error: 'Valid HTTPS Apps Script webhook URL is required' });
    }

    try {
      const response = await fetch(webhookUrl, {
        method: action === 'pull' ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        ...(action === 'push' ? { body: JSON.stringify(payload ?? {}) } : {}),
      });
      const text = await response.text();
      if (text.trim().startsWith('<')) {
        return res.status(400).json({
          ok: false,
          error:
            'Apps Script Webhook ส่งหน้าเว็บ HTML กลับมา (กรุณาตรวจสอบการ Deploy Web App ให้สิทธิ์เข้าถึงเป็น "Anyone" และใช้ URL /exec ล่าสุด)',
        });
      }
      let parsed: unknown = text;
      try {
        parsed = JSON.parse(text);
      } catch {
        // leave as text
      }
      return res.status(response.ok ? 200 : response.status).json({ ok: response.ok, data: parsed });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Webhook sync failed',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Duck Valley Farm server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
