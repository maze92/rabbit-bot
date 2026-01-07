// dashboard.js
const express = require('express');
const app = express();

// Endpoint simples e rápido (Health check do Replit)
app.get('/', (req, res) => {
  res.status(200).send('Dashboard is running ✅');
});

module.exports = app;
