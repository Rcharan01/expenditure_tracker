const jwt = require('jsonwebtoken');

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { username, password } = req.body || {};

  // Retrieve credentials from environment variables, fallback to Charan credentials
  const expectedUsername = process.env.AUTH_USERNAME || 'Charan';
  const expectedPassword = process.env.AUTH_PASSWORD || 'Charan@@281';
  const jwtSecret = process.env.JWT_SECRET || 'finvault_default_secret_key_9988';

  if (username === expectedUsername && password === expectedPassword) {
    // Generate JWT token (expires in 12 hours)
    const token = jwt.sign({ username }, jwtSecret, { expiresIn: '12h' });

    // Set secure HttpOnly cookie. Max-Age is omitted so it is a session cookie
    // (cleared when browser/tab is closed).
    res.setHeader(
      'Set-Cookie',
      `session_token=${token}; HttpOnly; Path=/; SameSite=Strict; Secure`
    );

    return res.status(200).json({ success: true, message: 'Logged in successfully' });
  } else {
    return res.status(401).json({ success: false, error: 'Invalid username or password' });
  }
};
