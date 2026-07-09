import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { authRoutes } from './routes/authRoutes.js';
import { partnerRoutes } from './routes/partnerRoutes.js';
import { contractRoutes } from './routes/contractRoutes.js';
import { productRoutes } from './routes/productRoutes.js';
import { monitoringRoutes } from './routes/monitoringRoutes.js';
import { orderRoutes } from './routes/orderRoutes.js';
import { invoiceRoutes } from './routes/invoiceRoutes.js';
import { alertRoutes } from './routes/alertRoutes.js';
import { dashboardRoutes } from './routes/dashboardRoutes.js';
import { taskRoutes } from './routes/taskRoutes.js';
import { offerControlRoutes } from './routes/offerControlRoutes.js';
import { benchmarkRoutes } from './routes/benchmarkRoutes.js';

export const app = express();

app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || origin === env.corsOrigin || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use(rateLimit({ windowMs: 60_000, limit: 300 }));

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/partners', partnerRoutes);
app.use('/api/contracts', contractRoutes);
app.use('/api/products', productRoutes);
app.use('/api/monitoring', monitoringRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/offer-control', offerControlRoutes);
app.use('/api/benchmarks', benchmarkRoutes);

app.use((_req, res) => {
  res.status(404).json({ message: 'Not found' });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ message: 'Internal server error' });
});
