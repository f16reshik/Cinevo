import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { HttpError } from './middleware.js';
import { expireStaleOrders } from './services/booking.js';
import { gatewayMode } from './services/payment.js';
import auth from './routes/auth.js';
import publicRoutes from './routes/public.js';
import orders from './routes/orders.js';
import payments from './routes/payments.js';
import staff from './routes/staff.js';
import admin from './routes/admin.js';

if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required');

const app = express();
app.set('trust proxy', 1); // behind Render's proxy
app.use(helmet());
app.use(cors({ origin: (process.env.CLIENT_URL || 'http://localhost:5173').split(','), credentials: false }));

// Payments router is mounted first: its webhook needs the raw body before express.json runs.
app.use('/api/payments', payments);
app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => res.json({ ok: true, gateway: gatewayMode() }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 60 }), auth);
app.use('/api', publicRoutes);
app.use('/api/orders', orders);
app.use('/api/staff', staff);
app.use('/api/admin', admin);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.code === 'P2025') return res.status(404).json({ error: 'Not found' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

setInterval(() => expireStaleOrders().catch((e) => console.error('expiry job', e.message)), 60 * 1000);

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`API on :${port} (payments: ${gatewayMode()})`));
