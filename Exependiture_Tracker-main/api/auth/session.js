const jwt = require('jsonwebtoken');

function parseCookies(cookieHeader) {
  const list = {};
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    list[parts.shift().trim()] = decodeURI(parts.join('='));
  });
  return list;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const cookies = parseCookies(req.headers.cookie);
  const token = cookies.session_token;

  if (!token) {
    return res.status(401).json({ loggedIn: false, error: 'No session active' });
  }

  try {
    const jwtSecret = process.env.JWT_SECRET || 'finvault_default_secret_key_9988';
    const decoded = jwt.verify(token, jwtSecret);
    return res.status(200).json({ loggedIn: true, username: decoded.username });
  } catch (err) {
    return res.status(401).json({ loggedIn: false, error: 'Session expired or invalid' });
  }
};
