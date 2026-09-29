const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
require('dotenv').config();

const { validateEnv } = require('./middleware/validateEnv');
const { apiLimiter } = require('./middleware/rateLimits');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const maintenanceRoutes = require('./routes/maintenance');
const serviceRoutes = require('./routes/services');
const incidentRoutes = require('./routes/incidents');
const assetRoutes = require('./routes/assets');
const analyticsRoutes = require('./routes/analytics');
const downtimeRoutes = require('./routes/downtime');

validateEnv();

const app = express();
const PORT = process.env.PORT || 5000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN;

const allowedOrigins = CLIENT_ORIGIN
  ? CLIENT_ORIGIN.split(',').map((o) => o.trim())
  : ['https://maintenance-frontend-wwsg.onrender.com'];

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        scriptSrc: ["'self'"],
        // The PWA service worker performs its own fetches (including the
        // offline API cache), so it needs an explicit worker-src and a
        // connect-src that allows the API origin.
        workerSrc: ["'self'", 'blob:'],
        connectSrc: ["'self'", ...allowedOrigins],
        manifestSrc: ["'self'"],
      },
    },
    xssFilter: true,
    noSniff: true,
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'no-referrer' },
  })
);

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err?.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'Origin not allowed' });
  }
  next(err);
});

app.use('/api/', apiLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/maintenance', maintenanceRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/incidents', incidentRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/downtime', downtimeRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const frontendDist = path.join(__dirname, '../../frontend/dist');
const frontendBuilt = fs.existsSync(frontendDist) && fs.existsSync(path.join(frontendDist, 'index.html'));

if (frontendBuilt) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
} else {
  // Frontend build is not available (e.g. build failed or dist/ is not
  // committed). Keep serving the API instead of crashing at startup.
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.status(503).json({
      error: 'Frontend not built',
      message: 'The frontend build is not available. The API is still running at /api.',
    });
  });
}

async function startServer() {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

module.exports = app;
