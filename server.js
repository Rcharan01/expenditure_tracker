require('dotenv').config();
const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());

// Load backend API endpoints
const loginApi = require('./api/auth/login');
const logoutApi = require('./api/auth/logout');
const sessionApi = require('./api/auth/session');
const dataApi = require('./api/data');

// Bind API endpoints
app.post('/api/auth/login', loginApi);
app.post('/api/auth/logout', logoutApi);
app.get('/api/auth/session', sessionApi);
app.get('/api/data', dataApi);
app.post('/api/data', dataApi);

// Serve static assets from public/
app.use(express.static(path.join(__dirname, 'public')));

// Catch-all route to serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`🚀 FinVault Local Server Running!`);
  console.log(`🔗 URL: http://localhost:${PORT}`);
  console.log(`👤 Default Username: Charan`);
  console.log(`🔑 Default Password: Charan@@281`);
  console.log(`==================================================`);
});
