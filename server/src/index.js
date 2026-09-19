require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cron = require('node-cron');

const routes = require('./routes');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { query } = require('./config/database');
const { v4: uuidv4 } = require('uuid');

const app = express();
const httpServer = createServer(app);

// ── Allowed origins (multi-origin CORS for production + dev) ─────────────────
// ALLOWED_ORIGINS = comma-separated list, e.g.:
//   https://khannettra.vercel.app,https://khannetra.vercel.app,http://localhost:3000
// Falls back to CLIENT_URL, then localhost for dev.
const _rawOrigins = process.env.ALLOWED_ORIGINS || process.env.CLIENT_URL || 'http://localhost:3000';
const _allowedOrigins = _rawOrigins.split(',').map(o => o.trim()).filter(Boolean);

const corsOriginFn = (origin, callback) => {
  // Allow requests with no origin (curl, Postman, server-to-server)
  if (!origin) return callback(null, true);
  if (_allowedOrigins.includes(origin)) return callback(null, true);
  console.warn(`[CORS] Blocked origin: ${origin}`);
  return callback(new Error(`CORS: origin ${origin} not allowed`));
};

// Socket.IO for real-time notifications
const io = new Server(httpServer, {
  cors: { origin: corsOriginFn, methods: ['GET', 'POST'], credentials: true }
});

io.on('connection', (socket) => {
  socket.on('join', (userId) => socket.join(`user:${userId}`));
  socket.on('disconnect', () => {});
});

app.set('socketio', io);

// Security middleware
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: corsOriginFn,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { success: false, message: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);

// Logging
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files for uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// API routes
app.use('/api/v1', routes);

// Error handling
app.use(notFound);
app.use(errorHandler);

// ── Scheduled jobs ────────────────────────────────────────────────────────────

// 1. Disaster alert polling — every 10 minutes
cron.schedule('*/10 * * * *', async () => {
  try {
    const { pollAllSources } = require('./services/disasterService');
    await pollAllSources();
  } catch (e) { console.error('[Disaster cron]', e.message); }
});

// 2. Daily document expiry check — 9 AM
//    Fixed: uses SQLite datetime() / date() instead of PostgreSQL NOW()/CURRENT_DATE/INTERVAL
cron.schedule('0 9 * * *', async () => {
  try {
    // Mark expired documents (SQLite syntax)
    await query(
      `UPDATE documents
       SET status = 'expired', updated_at = datetime('now')
       WHERE expiry_date < date('now')
       AND status NOT IN ('expired', 'revoked')`
    );

    // Mark documents expiring within 60 days (SQLite date arithmetic)
    await query(
      `UPDATE documents
       SET status = 'expiring_soon', updated_at = datetime('now')
       WHERE expiry_date BETWEEN date('now') AND date('now', '+60 days')
       AND status = 'active'`
    );

    // Notify admins for docs that expired today
    const expired = await query(
      `SELECT d.title, d.mine_id, m.name as mine_name
       FROM documents d JOIN mines m ON d.mine_id = m.id
       WHERE d.expiry_date = date('now')`
    );

    for (const doc of expired.rows) {
      const admins = await query(
        `SELECT id FROM users WHERE role IN ('admin', 'government_officer')`
      );
      for (const admin of admins.rows) {
        await query(
          `INSERT INTO notifications (id, user_id, mine_id, title, message, type, priority)
           VALUES (?, ?, ?, ?, ?, 'deadline', 'critical')`,
          [
            uuidv4(), admin.id, doc.mine_id,
            '🔴 Document Expired Today',
            `"${doc.title}" at ${doc.mine_name} expired today. Immediate renewal required.`,
          ]
        );
      }
    }
    console.log(`[Cron] Document expiry check complete — ${expired.rows.length} expired today`);
  } catch (e) { console.error('[Cron] Document expiry error:', e.message); }
});

// 3. Compliance deadline escalation — every 6 hours
cron.schedule('0 */6 * * *', async () => {
  try {
    const { runEscalation } = require('./controllers/deadlineController');
    await runEscalation();
  } catch (e) { console.error('[Cron] Escalation error:', e.message); }
});

// 4. Mine risk & compliance score recalculation — every hour
//    Recomputes all mine scores from real database records (violations, incidents,
//    environmental readings, corrective actions, documents, compliance records).
//    Scores written back to the mines table so every module sees current values.
cron.schedule('0 * * * *', async () => {
  try {
    const { recalculateAllMineScores } = require('./services/analyticsService');
    await recalculateAllMineScores();
  } catch (e) { console.error('[Cron] Score recalc error:', e.message); }
});

const PORT = process.env.PORT || 5000;
httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is in use. Kill the process using it and restart.`);
    process.exit(1);
  }
  throw err;
});
httpServer.listen(PORT, () => {
  console.log(`✅ KhanNetra running → http://localhost:${PORT}/api/v1`);
  console.log(`   Health: http://localhost:${PORT}/api/v1/health`);
  console.log(`   Mode:   ${process.env.NODE_ENV || 'development'}`);
});

module.exports = { app, httpServer };
