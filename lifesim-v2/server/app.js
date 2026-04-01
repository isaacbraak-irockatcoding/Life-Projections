const express = require('express');
const path = require('path');
require('dotenv').config();

const { errorHandler } = require('./middleware/error');
const authRoutes = require('./routes/auth');
const scenarioRoutes = require('./routes/scenarios');
const eventsRoutes = require('./routes/events');
const assetsRoutes = require('./routes/assets');
const debtsRoutes = require('./routes/debts');
const shareRoutes = require('./routes/share');
const friendsRoutes = require('./routes/friends');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/scenarios', scenarioRoutes);
app.use('/api/scenarios', eventsRoutes);
app.use('/api/scenarios', assetsRoutes);
app.use('/api/scenarios', debtsRoutes);
app.use('/api', shareRoutes);
app.use('/api/friends', friendsRoutes);

// SPA fallback — serve index.html for any non-API route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use(errorHandler);

module.exports = app;
