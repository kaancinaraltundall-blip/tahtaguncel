/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { setupWebSocketServer } from './server/websocket-server.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

async function startServer() {
  const app = express();
  const server = http.createServer(app);

  // Setup WebSocket Server for Yjs & tldraw
  const { roomManager } = setupWebSocketServer(server);

  app.use(express.json());

  // API Health & Room Info
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/rooms', (req, res) => {
    res.json({
      rooms: roomManager.getAllRooms(),
    });
  });

  app.get('/api/download-zip', (req, res) => {
    const zipPath = path.resolve(__dirname, 'eduboard-project.zip');
    res.download(zipPath, 'eduboard-project.zip');
  });

  if (!isProd) {
    // Development mode with Vite
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production mode
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(`🚀 EduBoard Live Server Running on http://0.0.0.0:${PORT}`);
    console.log(`📡 WebSocket Endpoint: ws://localhost:${PORT}/[room-name]`);
    console.log(`🌐 Edge/Multi-device Ready (P2P NAT problems bypassed)`);
    console.log(`====================================================`);
  });
}

startServer().catch((err) => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});
