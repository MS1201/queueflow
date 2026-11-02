import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { initSocket } from './socket.js';
import { sweep } from './queueEngine.js';
import authRoutes from './routes/auth.js';
import serviceRoutes from './routes/services.js';
import counterRoutes from './routes/counters.js';
import tokenRoutes from './routes/tokens.js';
import crowdRoutes from './routes/crowd.js';
import adminRoutes from './routes/admin.js';

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: config.clientOrigins.includes('*') ? true : config.clientOrigins }));
app.use(express.json({ limit: '50kb' }));
app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 900, standardHeaders: true, legacyHeaders: false }));

app.get('/api/health', (_req, res) => res.json({ ok: true, db: mongoose.connection.readyState === 1 }));
app.use('/api/auth', authRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/counters', counterRoutes);
app.use('/api/tokens', tokenRoutes);
app.use('/api/crowd', crowdRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', (_req, res) => res.status(404).json({ message: 'Endpoint not found' }));

// Serve the built React app when present (single-process deployment).
const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../../client/dist');
if (fs.existsSync(path.join(dist, 'index.html'))) {
  app.use(express.static(dist));
  app.use((req, res, next) => (req.method === 'GET' ? res.sendFile(path.join(dist, 'index.html')) : next()));
}

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err.status) return res.status(err.status).json({ message: err.message, ...err.extra });
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map((e) => e.message).join('. ');
    return res.status(400).json({ message });
  }
  if (err.name === 'CastError') return res.status(400).json({ message: 'Invalid value supplied' });
  if (err.code === 11000) return res.status(409).json({ message: 'That value is already in use' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'Malformed JSON body' });
  console.error(err);
  res.status(500).json({ message: 'Something went wrong on our side. Please try again.' });
});

async function main() {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000 });
  console.log(`MongoDB connected: ${config.mongoUri}`);
  const server = http.createServer(app);
  initSocket(server, config.clientOrigins);

  let sweeping = false;
  setInterval(async () => {
    if (sweeping) return;
    sweeping = true;
    try {
      await sweep();
    } catch (err) {
      console.error('Sweeper error:', err.message);
    } finally {
      sweeping = false;
    }
  }, 10000);

  server.listen(config.port, () => console.log(`QueueFlow API listening on http://localhost:${config.port}`));
}

main().catch((err) => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});
