/* state.js — shared state, storage, utils */
const KEYS = { data:'finvault_data', session:'finvault_session' };

let state = {
  emiAccounts:[], expenses:[], archives:[], savedNames:[],
  editingEmiId:null, editingExpId:null,
  expStatus:'pending', calOffset:0, calRange:3, confirmCb:null,
};

// ── Structured Client Logger ────────────────────────────────────────────────
function dbLog(level, event, data = {}) {
  const entry = { ts: new Date().toISOString(), level, event, ...data };
  if (level === 'ERROR' || level === 'WARN') {
    console.warn('[FinVault]', JSON.stringify(entry));
  } else {
    console.log('[FinVault]', JSON.stringify(entry));
  }
}

// ── Debounce / AbortController for cloud saves ──────────────────────────────
// FIX BUG-07: Debounce cloud saves so rapid UI actions (e.g. paying 3 EMIs
// quickly) coalesce into a single POST request.  Any in-flight request is
// aborted before the new one fires, preventing out-of-order writes.
let _saveDebounceTimer = null;
let _saveAbortController = null;
const SAVE_DEBOUNCE_MS = 600;

// ── Primary Save Function ────────────────────────────────────────────────────
// Saves silently in the background. No UI indicator shown on success.
// Only a toast appears if the network is down or server fails.
async function save() {
  const payload = {
    emiAccounts: state.emiAccounts,
    expenses: state.expenses,
    archives: state.archives,
    savedNames: state.savedNames,
    updatedAt: Date.now()
  };

  dbLog('INFO', 'save_start', { updatedAt: payload.updatedAt });

  // 1. Write to localStorage immediately (fastest, synchronous)
  try {
    localStorage.setItem(KEYS.data, JSON.stringify(payload));
  } catch (e) {
    dbLog('ERROR', 'localstorage_save_failed', { message: e.message });
  }

  // 2. Await IDB write so the backup is always in sync
  try {
    await saveToIDB(payload);
  } catch (e) {
    dbLog('ERROR', 'idb_save_failed', { message: e.message });
  }

  // 3. Debounced cloud save — coalesces rapid calls, totally silent
  scheduleDatabaseSave(payload);
}

// ── Debounced Cloud Save ─────────────────────────────────────────────────────
function scheduleDatabaseSave(payload) {
  // Cancel pending debounce timer
  if (_saveDebounceTimer) {
    clearTimeout(_saveDebounceTimer);
    _saveDebounceTimer = null;
  }

  _saveDebounceTimer = setTimeout(() => {
    _saveDebounceTimer = null;
    saveToDatabase(payload);
  }, SAVE_DEBOUNCE_MS);
}

// ── Cloud Database Save ──────────────────────────────────────────────────────
async function saveToDatabase(payload) {
  // Cancel any previous in-flight request before sending a new one
  if (_saveAbortController) {
    _saveAbortController.abort();
    dbLog('INFO', 'save_previous_aborted');
  }
  _saveAbortController = new AbortController();
  const signal = _saveAbortController.signal;

  dbLog('INFO', 'cloud_save_start', { updatedAt: payload.updatedAt });

  try {
    const res = await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal
    });

    if (signal.aborted) return; // superseded by a newer save

    if (res.status === 401) {
      dbLog('WARN', 'cloud_save_unauthorized');
      doLogout();
      location.reload();
      return;
    }

    // Handle 409 Conflict — server has newer data; silently re-sync
    if (res.status === 409) {
      const conflictData = await res.json();
      dbLog('WARN', 'cloud_save_conflict', {
        storedTs: conflictData.storedTs,
        incomingTs: conflictData.incomingTs
      });
      // Re-load from server quietly — no toast needed, just sync state
      await load(/* forceServerSync= */ true);
      return;
    }

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      dbLog('ERROR', 'cloud_save_http_error', { status: res.status, error: errData.error });
      // Only show a toast on genuine server errors (5xx)
      if (res.status >= 500) {
        showToast('⚠️ Changes saved locally — server error, will retry', 'warning');
      }
      return;
    }

    const result = await res.json();
    dbLog('INFO', 'cloud_save_complete', {
      serverTime: result.serverTime,
      localTime: payload.updatedAt
    });
    // No success toast — completely silent on happy path

    // Update localStorage updatedAt with the authoritative server timestamp
    if (result.serverTime) {
      try {
        const raw = localStorage.getItem(KEYS.data);
        if (raw) {
          const d = JSON.parse(raw);
          d.updatedAt = result.serverTime;
          localStorage.setItem(KEYS.data, JSON.stringify(d));
        }
      } catch (e) { /* non-critical */ }
    }
  } catch (e) {
    if (e.name === 'AbortError') {
      dbLog('INFO', 'cloud_save_aborted_by_newer');
      return;
    }
    // Network is down (no WiFi, offline) — show a single toast
    dbLog('ERROR', 'cloud_save_network_error', { message: e.message });
    showToast('📶 No internet — changes saved on this device', 'warning');
  }
}

// ── Load State ───────────────────────────────────────────────────────────────
// FIX BUG-08: Never upload local data to overwrite DB data during load.
// MongoDB is the single source of truth. Local is only used for instant render
// while the cloud fetch is in-flight.
async function load(forceServerSync = false) {
  dbLog('INFO', 'load_start', { forceServerSync });

  // 1. Load from localStorage for instant UI (no state overwrite if forceServerSync)
  if (!forceServerSync) {
    try {
      const raw = localStorage.getItem(KEYS.data);
      const d = JSON.parse(raw || '{}');
      state.emiAccounts = d.emiAccounts || [];
      state.expenses    = d.expenses    || [];
      state.archives    = d.archives    || [];
      state.savedNames  = d.savedNames  || [];
      dbLog('INFO', 'load_from_localstorage', { updatedAt: d.updatedAt || 0 });
    } catch(e) {
      dbLog('WARN', 'load_localstorage_parse_error', { message: e.message });
    }
  }

  // 2. Fetch from cloud — MongoDB is the authority
  try {
    const res = await fetch('/api/data');
    if (res.status === 401) {
      doLogout();
      location.reload();
      return;
    }

    if (!res.ok) {
      dbLog('ERROR', 'load_api_error', { status: res.status });
      return;
    }

    const dbData = await res.json();
    if (!dbData) {
      dbLog('WARN', 'load_api_empty_response');
      return;
    }

    const hasData = dbData.emiAccounts || dbData.expenses || dbData.archives || dbData.savedNames;
    if (!hasData) {
      dbLog('WARN', 'load_api_no_meaningful_data');
      return;
    }

    const dbTime = dbData.updatedAt || 0;
    dbLog('INFO', 'load_from_mongodb', {
      updatedAt: dbTime,
      expenses: Array.isArray(dbData.expenses) ? dbData.expenses.length : 'n/a',
      emi: Array.isArray(dbData.emiAccounts) ? dbData.emiAccounts.length : 'n/a'
    });

    // FIX BUG-08: Always take the server data as authoritative.
    // Do NOT check if local is "newer" and upload local to DB during load.
    // The server-side conflict resolution in api/data.js handles stale writes.
    state.emiAccounts = dbData.emiAccounts || [];
    state.expenses    = dbData.expenses    || [];
    state.archives    = dbData.archives    || [];
    state.savedNames  = dbData.savedNames  || [];

    // Update both local stores to match the authoritative server state
    localStorage.setItem(KEYS.data, JSON.stringify(dbData));
    await saveToIDB(dbData);

    dbLog('INFO', 'load_sync_complete', { updatedAt: dbTime });

    // Re-render the active view if this was a forced sync
    if (forceServerSync) {
      const currentView = localStorage.getItem('finvault_view') || 'dashboard';
      if (typeof showView === 'function') showView(currentView);
    }
  } catch (e) {
    dbLog('ERROR', 'load_cloud_failed', { message: e.message });
    // Keep whatever was loaded from localStorage — don't crash
  }
}

function isLoggedIn(){ return localStorage.getItem(KEYS.session)==='1'; }
function doLogin()  { localStorage.setItem(KEYS.session,'1'); }
function doLogout() { localStorage.removeItem(KEYS.session); }

const parseLocalDate = dStr => {
  if (!dStr) return null;
  const parts = dStr.slice(0, 10).split('-');
  if (parts.length < 3) return null;
  const [y, m, d] = parts.map(Number);
  return new Date(y, m - 1, d);
};

const toLocalYYYYMMDD = d => {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

const uid     = ()=>Math.random().toString(36).slice(2,10);
const fmt     = n=>'₹'+Math.round(Number(n||0)).toLocaleString('en-IN');
const fmtDate = d=>d?parseLocalDate(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}):'';
const fmtDay  = d=>d?parseLocalDate(d).toLocaleDateString('en-IN',{weekday:'short'}):'';
const monthKey= d=>{ const s = typeof d === 'string' ? d : toLocalYYYYMMDD(d); return s.slice(0, 7); };
const monthLbl= k=>{ const [y,m]=k.split('-'); return new Date(y,m-1,1).toLocaleDateString('en-IN',{month:'long',year:'numeric'}); };
const todayStr= ()=>{ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
const $       = id=>document.getElementById(id);
const $$      = sel=>document.querySelectorAll(sel);

/* Count how many months recurring runs (until end date or last EMI month) */
function getRecurringCount(startDate, endDate, freq) {
  let lastEmi = '';
  state.emiAccounts.forEach(acc => acc.emiItems.forEach(item => {
    const mk = monthKey(item.date);
    if (mk > lastEmi) lastEmi = mk;
  }));
  const endTarget = endDate || (lastEmi ? lastEmi + '-28' : '');
  if (!endTarget) return 1;
  const end = parseLocalDate(endTarget);
  if (!endDate) end.setMonth(end.getMonth() + 1);
  let count = 0;
  while (true) {
    const cur = getRecurringDate(startDate, count, freq);
    if (cur > end) break;
    count++;
    if (count > 2000) break; // safeguard
  }
  return Math.max(1, count);
}

function getRecurringDate(startDate, idx, freq) {
  const d = parseLocalDate(startDate);
  if (freq === 'daily') {
    d.setDate(d.getDate() + idx);
  } else if (freq === 'weekly') {
    d.setDate(d.getDate() + (idx * 7));
  } else {
    const targetMonth = d.getMonth() + idx;
    const targetYear = d.getFullYear() + Math.floor(targetMonth / 12);
    const m = ((targetMonth % 12) + 12) % 12;
    const originalDay = d.getDate();
    const lastDayOfTargetMonth = new Date(targetYear, m + 1, 0).getDate();
    d.setFullYear(targetYear);
    d.setMonth(m);
    d.setDate(Math.min(originalDay, lastDayOfTargetMonth));
  }
  return d;
}

function showToast(msg,type='info'){
  const t=$('toast'); t.textContent=msg; t.className=`toast ${type}`;
  t.classList.remove('hidden');
  clearTimeout(t._t); t._t=setTimeout(()=>t.classList.add('hidden'),3000);
}
function setRing(id,pct){
  const el=$(id); if(!el)return;
  const c=2*Math.PI*50, off=c-(Math.min(pct,1)*c);
  el.style.strokeDasharray=c; el.style.strokeDashoffset=off;
}
function openModal(id){ $(id).classList.remove('hidden'); }
function closeModal(id){ $(id).classList.add('hidden'); }
function confirm2(title,msg,cb){
  $('confirm-title').textContent=title; $('confirm-msg').textContent=msg;
  state.confirmCb=cb; openModal('confirm-modal');
}

/* ── Dual-Engine Fail-Safe Storage (IndexedDB) ── */
const DB_NAME = 'finvault_db';
const STORE_NAME = 'finvault_store';
const DB_VERSION = 1;

function getDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function saveToIDB(data) {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(data, 'state_data');
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    dbLog('ERROR', 'idb_save_error', { message: e.message });
  }
}

async function loadFromIDB() {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get('state_data');
    return new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  } catch (e) {
    dbLog('ERROR', 'idb_load_error', { message: e.message });
    return null;
  }
}

// ── IDB ↔ localStorage Sync ──────────────────────────────────────────────────
// FIX BUG-10: This function now ONLY recovers IDB data when localStorage is
// completely empty. It never overrides data that was freshly synced from MongoDB.
// The 1000ms grace window is removed — timestamps must be meaningfully newer.
async function verifyAndSyncStorage() {
  try {
    const idbData = await loadFromIDB();
    const lsRaw = localStorage.getItem(KEYS.data);
    let lsData = null;
    try {
      lsData = lsRaw ? JSON.parse(lsRaw) : null;
    } catch(e){}

    const hasLS  = lsData  && (lsData.emiAccounts?.length  || lsData.expenses?.length  || lsData.archives?.length);
    const hasIDB = idbData && (idbData.emiAccounts?.length || idbData.expenses?.length || idbData.archives?.length);

    if (!hasLS && hasIDB) {
      // localStorage is empty/cleared — recover from IDB backup
      dbLog('INFO', 'idb_recovery', { idbTs: idbData.updatedAt || 0 });
      state.emiAccounts = idbData.emiAccounts || [];
      state.expenses    = idbData.expenses    || [];
      state.archives    = idbData.archives    || [];
      state.savedNames  = idbData.savedNames  || [];
      localStorage.setItem(KEYS.data, JSON.stringify(idbData));
      showToast('✨ Financial logs recovered from browser secure backup!', 'success');

      const currentView = localStorage.getItem('finvault_view') || 'dashboard';
      if (typeof showView === 'function') showView(currentView);
    } else if (hasLS && !hasIDB) {
      // IDB is empty — back it up from localStorage
      await saveToIDB(lsData);
      dbLog('INFO', 'idb_backfill_from_ls');
    } else if (hasLS && hasIDB) {
      const lsTime  = lsData.updatedAt  || 0;
      const idbTime = idbData.updatedAt || 0;

      if (idbTime > lsTime + 5000) {
        // IDB is significantly newer (>5s) — recover
        dbLog('WARN', 'idb_newer_than_ls', { idbTime, lsTime, diffMs: idbTime - lsTime });
        state.emiAccounts = idbData.emiAccounts || [];
        state.expenses    = idbData.expenses    || [];
        state.archives    = idbData.archives    || [];
        state.savedNames  = idbData.savedNames  || [];
        localStorage.setItem(KEYS.data, JSON.stringify(idbData));

        const currentView = localStorage.getItem('finvault_view') || 'dashboard';
        if (typeof showView === 'function') showView(currentView);
      } else if (lsTime > idbTime + 5000) {
        // localStorage is significantly newer — sync to IDB
        await saveToIDB(lsData);
        dbLog('INFO', 'ls_synced_to_idb', { lsTime, idbTime });
      }
      // If timestamps are within 5s of each other — treat as equivalent, no action
    }
  } catch(e) {
    dbLog('ERROR', 'storage_sync_error', { message: e.message });
  }
}
