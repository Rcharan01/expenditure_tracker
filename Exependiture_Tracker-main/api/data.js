const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

// ── Structured Logger ──────────────────────────────────────────────────────
function log(level, event, data = {}) {
  const entry = { ts: new Date().toISOString(), level, event, ...data };
  if (level === 'ERROR') {
    console.error('[FinVault]', JSON.stringify(entry));
  } else {
    console.log('[FinVault]', JSON.stringify(entry));
  }
}

// ── Cookie Parser ──────────────────────────────────────────────────────────
function parseCookies(cookieHeader) {
  const list = {};
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    list[parts.shift().trim()] = decodeURI(parts.join('='));
  });
  return list;
}

// ── Session Auth ───────────────────────────────────────────────────────────
function getUsernameFromSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies.session_token;
  if (!token) return null;
  try {
    const jwtSecret = process.env.JWT_SECRET || 'finvault_default_secret_key_9988';
    const decoded = jwt.verify(token, jwtSecret);
    return decoded.username;
  } catch (err) {
    return null;
  }
}

// ── Seed Data ──────────────────────────────────────────────────────────────
function getSeedData() {
  try {
    const seedPath = path.join(__dirname, 'seed_data.json');
    if (fs.existsSync(seedPath)) {
      const content = fs.readFileSync(seedPath, 'utf8');
      return JSON.parse(content || '{}');
    }
  } catch (e) {
    log('ERROR', 'seed_read_failed', { message: e.message });
  }
  return { emiAccounts: [], expenses: [], archives: [], savedNames: [] };
}

// ── MongoDB Singleton Connection ───────────────────────────────────────────
// FIX BUG-09: Reuse a single MongoClient per server process instead of
// opening/closing a new connection on every request. This prevents exhausting
// the Atlas connection pool under load.
let _mongoClient = null;
let _mongoDb = null;

async function getMongoDb() {
  const { MongoClient } = require('mongodb');
  const mongoUri = process.env.MONGODB_URI || process.env.STORAGE_URL || process.env.MONGODB_URL;
  if (!mongoUri) throw new Error('No MongoDB URI configured');

  if (_mongoDb) return _mongoDb;

  _mongoClient = new MongoClient(mongoUri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
  });
  await _mongoClient.connect();
  _mongoDb = _mongoClient.db('finvault');
  log('INFO', 'mongo_connected', { host: mongoUri.split('@').pop()?.split('/')[0] || 'atlas' });
  return _mongoDb;
}

// ── Vercel KV Helpers ──────────────────────────────────────────────────────
async function getFromKV() {
  const url = `${process.env.KV_REST_API_URL}/get/finvault_data`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` }
  });
  if (!response.ok) throw new Error('Vercel KV fetch failed');
  const resData = await response.json();
  return resData.result ? JSON.parse(resData.result) : null;
}

async function saveToKV(data) {
  const url = `${process.env.KV_REST_API_URL}/set/finvault_data`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error('Vercel KV save failed');
}

// ── MongoDB Helpers ────────────────────────────────────────────────────────
async function getFromMongo() {
  try {
    const db = await getMongoDb();
    const collection = db.collection('data');
    // FIX BUG-11: Always query by the literal string '_id: state' to prevent
    // accidental duplicate state documents from ObjectId vs string mismatch.
    const doc = await collection.findOne({ _id: 'state' });
    return doc || null;
  } catch (err) {
    log('ERROR', 'mongo_get_failed', { message: err.message });
    _mongoDb = null;
    _mongoClient = null;
    throw err;
  }
}

// FIX BUG-02 + BUG-03 + BUG-11:
// - Server-side conflict resolution: reject stale writes (409)
// - Validate updateOne result (matchedCount / upsertedCount)
// - Return the stored updatedAt so the client can reconcile
async function saveToMongo(data) {
  try {
    const db = await getMongoDb();
    const collection = db.collection('data');

    const incomingTs = typeof data.updatedAt === 'number' ? data.updatedAt : 0;

    // Read current stored timestamp BEFORE writing
    const existing = await collection.findOne({ _id: 'state' }, { projection: { updatedAt: 1 } });
    const storedTs = existing?.updatedAt || 0;

    // FIX BUG-03: Reject stale writes — never let older data overwrite newer data
    if (incomingTs > 0 && storedTs > 0 && incomingTs < storedTs) {
      log('WARN', 'conflict_rejected', {
        incomingTs,
        storedTs,
        diff_ms: storedTs - incomingTs
      });
      return { conflict: true, storedTs, incomingTs };
    }

    // Use incomingTs as the document's updatedAt so client and server use the same clock source
    const serverTime = incomingTs || Date.now();
    const result = await collection.updateOne(
      { _id: 'state' },
      {
        $set: {
          _id: 'state',
          stateData: data,
          updatedAt: serverTime,
          seeded: true
        }
      },
      { upsert: true }
    );

    // FIX BUG-02: Validate write result — don't claim success if nothing was written
    const written = result.matchedCount > 0 || result.upsertedCount > 0;
    if (!written) {
      log('ERROR', 'mongo_write_unconfirmed', { result: JSON.stringify(result) });
      throw new Error('MongoDB updateOne reported no matched or upserted document');
    }

    log('INFO', 'mongo_save_complete', {
      matched: result.matchedCount,
      upserted: result.upsertedCount,
      serverTime,
      incomingTs
    });

    return { conflict: false, serverTime };
  } catch (err) {
    log('ERROR', 'mongo_save_failed', { message: err.message });
    _mongoDb = null;
    _mongoClient = null;
    throw err;
  }
}

// ── Route Handler ──────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Cookie');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ── Auth ──
  const username = getUsernameFromSession(req);
  if (!username) {
    return res.status(401).json({ error: 'Unauthorized: Session invalid or expired' });
  }

  const localFilePath = path.join(__dirname, 'seed_data.json');
  const useKV = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
  const useMongo = !!(process.env.MONGODB_URI || process.env.STORAGE_URL || process.env.MONGODB_URL);

  // ── GET: Load State ──────────────────────────────────────────────────────
  if (req.method === 'GET') {
    log('INFO', 'load_start', { username });
    try {
      let data = null;

      if (useKV) {
        data = await getFromKV();
      } else if (useMongo) {
        const doc = await getFromMongo();
        // FIX BUG-04: Use the seeded flag + explicit key checks to avoid
        // re-seeding a document that simply has empty arrays.
        if (doc && doc.seeded === true) {
          data = doc.stateData;
        } else if (doc && doc.stateData) {
          data = doc.stateData;
        }
      } else {
        if (fs.existsSync(localFilePath)) {
          const raw = fs.readFileSync(localFilePath, 'utf8');
          data = JSON.parse(raw || '{}');
        }
      }

      // Only seed if we got absolutely nothing back (null, not empty arrays)
      if (data === null || data === undefined) {
        log('INFO', 'seeding_db', { reason: 'no_data_found' });
        data = getSeedData();
        if (useKV) {
          await saveToKV(data);
        } else if (useMongo) {
          await saveToMongo({ ...data, updatedAt: Date.now() });
        }
      }

      log('INFO', 'load_complete', {
        username,
        hasExpenses: Array.isArray(data.expenses) ? data.expenses.length : 'n/a',
        hasEmi: Array.isArray(data.emiAccounts) ? data.emiAccounts.length : 'n/a',
        updatedAt: data.updatedAt || 0
      });

      return res.status(200).json(data);
    } catch (err) {
      log('ERROR', 'load_failed', { username, message: err.message });
      // Return seed data as safe fallback — do NOT write it back to DB
      return res.status(200).json(getSeedData());
    }
  }

  // ── POST: Save State ─────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const payload = req.body;
    if (!payload) {
      return res.status(400).json({ error: 'Bad Request: No body provided' });
    }

    const incomingTs = payload.updatedAt || 0;
    log('INFO', 'save_start', { username, incomingTs });

    try {
      let saveResult;

      if (useKV) {
        await saveToKV(payload);
        saveResult = { conflict: false };
      } else if (useMongo) {
        saveResult = await saveToMongo(payload);
      } else {
        fs.writeFileSync(localFilePath, JSON.stringify(payload, null, 2), 'utf8');
        saveResult = { conflict: false };
      }

      // FIX BUG-03: Return 409 if the server detected a conflict
      if (saveResult.conflict) {
        log('WARN', 'save_conflict_returned', {
          username,
          incomingTs: saveResult.incomingTs,
          storedTs: saveResult.storedTs
        });
        return res.status(409).json({
          error: 'Conflict: Your data is older than the server copy. Please refresh.',
          storedTs: saveResult.storedTs,
          incomingTs: saveResult.incomingTs
        });
      }

      log('INFO', 'save_complete', { username, serverTime: saveResult.serverTime });
      return res.status(200).json({
        success: true,
        message: 'Data saved successfully',
        serverTime: saveResult.serverTime
      });
    } catch (err) {
      log('ERROR', 'save_failed', { username, message: err.message, stack: err.stack });
      return res.status(500).json({ error: 'Internal Server Error: Failed to save data' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
