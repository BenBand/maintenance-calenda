const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
require('dotenv').config();
const { createTables, seedAdmin } = require('./models/tables');

const authRoutes = require('./routes/auth');
const maintenanceRoutes = require('./routes/maintenance');
const serviceRoutes = require('./routes/services');

const app = express();
const PORT = process.env.PORT || 5000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN;

const allowedOrigins = CLIENT_ORIGIN
  ? CLIENT_ORIGIN.split(',').map(o => o.trim())
  : ['http://localhost:3001'];

app.use(cors({
  origin: "https://maintenance-frontend-wwsg.onrender.com",
  credentials: true,
}));
app.use(compression());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/maintenance', maintenanceRoutes);
app.use('/api/services', serviceRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve frontend static files
const frontendDist = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendDist));

// SPA fallback - serve index.html for all non-API routes
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(frontendDist, 'index.html'));
});

async function startServer() {
  await createTables();
  await seedAdmin();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

module.exports = app;
