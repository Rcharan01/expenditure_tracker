/* app.js — init, login, navigation */

const VIEWS  = ['dashboard','emi','expenses','calendar','activity','archive'];
const TITLES = {dashboard:'Dashboard',emi:'EMI Accounts',expenses:'Expenses',calendar:'Monthly Expenses',activity:'Activity',archive:'Archive'};

/* ── Helpers (page toggle) ─────────────────────── */
function showPage(id){
  const login=$('login-page'), app=$('app-page');
  if(id==='app-page'){
    login.style.display='none';
    app.style.display='flex';
  } else {
    app.style.display='none';
    login.style.display='block';
  }
}

/* ── Navigation ────────────────────────────────── */
function showView(name){
  if(!VIEWS.includes(name)) name = 'dashboard';
  localStorage.setItem('finvault_view', name);
  VIEWS.forEach(v=>{ const el=$('view-'+v); if(el) el.style.display=(v===name)?'block':'none'; });
  $$('.nav-item').forEach(a=>a.classList.toggle('active', a.dataset.view===name));
  $('page-title').textContent = TITLES[name] || name;
  if(name==='dashboard') renderDashboard();
  if(name==='emi')       renderEmiList();
  if(name==='expenses')  renderExpenseList();
  if(name==='calendar')  renderCalendar();
  if(name==='activity')  renderActivity();
  if(name==='archive')   renderArchive();
}

/* ── Date badge ────────────────────────────────── */
function updateBadge(){
  const el=$('today-badge');
  if(el) el.textContent=new Date().toLocaleDateString('en-IN',{weekday:'short',day:'2-digit',month:'short',year:'numeric'});
}

/* ── Init app after login ───────────────────────── */
async function initApp(){
  await load();
  // FIX BUG-05: Must await verifyAndSyncStorage() — it is async and may
  // recover IDB data and call showView(). Without await, showView() on
  // line 165 races with the recovery path and renders stale state.
  await verifyAndSyncStorage();

  /* hide all views first */
  VIEWS.forEach(v=>{ const el=$('view-'+v); if(el) el.style.display='none'; });

  /* init modules */
  initEmi();
  initExpenses();
  initCalendar();
  initExport();
  initAutocomplete();

  /* sidebar toggle */
  const sb=$('sidebar'), tog=$('sb-toggle');
  
  function handleSidebarResize() {
    if (window.innerWidth <= 1024 && window.innerWidth > 768) {
      sb.classList.add('collapsed');
      tog.textContent = '›';
    } else {
      sb.classList.remove('collapsed');
      tog.textContent = '‹';
    }
  }

  window.addEventListener('resize', () => {
    if (!sb.classList.contains('user-toggled')) handleSidebarResize();
  });
  handleSidebarResize();

  tog.addEventListener('click',()=>{
    sb.classList.toggle('collapsed');
    sb.classList.add('user-toggled');
    tog.textContent = sb.classList.contains('collapsed') ? '›' : '‹';
  });
  $('mob-menu').addEventListener('click',()=>sb.classList.toggle('mobile-open'));

  /* nav items */
  $$('.nav-item').forEach(a=>a.addEventListener('click',e=>{
    e.preventDefault();
    showView(a.dataset.view);
    if(window.innerWidth<769) $('sidebar').classList.remove('mobile-open');
  }));

  function isModalDirty(modalId) {
    if (modalId === 'emi-modal') {
      const name = $('emi-name')?.value.trim() || '';
      const amount = $('emi-amount')?.value.trim() || '';
      const received = $('emi-received')?.value.trim() || '';
      const start = $('emi-start')?.value.trim() || '';
      const count = $('emi-count')?.value.trim() || '';
      
      if (state.editingEmiId) {
        const acc = state.emiAccounts.find(a => a.id === state.editingEmiId);
        if (acc) {
          return name !== acc.appName ||
                 amount !== String(acc.amountTaken) ||
                 (received !== String(acc.amountReceived || acc.amountTaken) && received !== '') ||
                 start !== acc.startDate ||
                 count !== String(acc.emiCount);
        }
      }
      return name !== '' || amount !== '' || start !== '' || count !== '';
    }
    
    if (modalId === 'expense-modal') {
      const name = $('exp-name')?.value.trim() || '';
      const amount = $('exp-amount')?.value.trim() || '';
      const date = $('exp-date')?.value.trim() || '';
      const endDate = $('exp-end-date')?.value.trim() || '';
      
      if (state.editingExpId) {
        const exp = state.expenses.find(e => e.id === state.editingExpId);
        if (exp) {
          return name !== exp.name ||
                 amount !== String(exp.amount) ||
                 date !== exp.dueDate ||
                 endDate !== (exp.endDate || '');
        }
      }
      return name !== '' || amount !== '' || date !== '';
    }
    return false;
  }

  function tryCloseModal(modalId) {
    if (isModalDirty(modalId)) {
      confirm2(
        'Discard Changes?',
        'You have unsaved changes. Are you sure you want to discard them and close?',
        () => closeModal(modalId)
      );
    } else {
      closeModal(modalId);
    }
  }

  /* modal close — overlay click or [data-close] */
  document.addEventListener('click',e=>{
    if(e.target.dataset.close) tryCloseModal(e.target.dataset.close);
    else if(e.target.classList.contains('modal-overlay')) tryCloseModal(e.target.id);
  });

  /* confirm ok */
  $('confirm-ok').addEventListener('click',()=>{
    closeModal('confirm-modal');
    if(state.confirmCb){ state.confirmCb(); state.confirmCb=null; }
  });

  /* overdue close */
  $('overdue-close').addEventListener('click',()=>$('overdue-banner').classList.add('hidden'));

  /* logout */
  $('logout-btn').addEventListener('click', async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch(e) {}
    doLogout();
    location.reload();
  });

  updateBadge();
  setInterval(updateBadge, 60000);
  showView(localStorage.getItem('finvault_view') || 'dashboard');

  /* Inactivity Auto-Logout (3 minutes) */
  let inactivityTimer;
  function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(async () => {
      showToast('Logged out due to 3 minutes of inactivity.', 'warning');
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
      } catch(e) {}
      doLogout();
      location.reload();
    }, 3 * 60 * 1000); // 3 minutes
  }

  // Events that reset the inactivity timer
  const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
  activityEvents.forEach(evt => {
    document.addEventListener(evt, resetInactivityTimer, true);
  });
  
  resetInactivityTimer();
}

/* ── Boot ───────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {

  /* Login form */
  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = $('inp-user').value.trim();
    const p = $('inp-pass').value;

    const btn = $('login-form').querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Signing In...';

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p })
      });

      if (res.ok) {
        $('login-err').classList.add('hidden');
        doLogin();
        showPage('app-page');
        await initApp();
      } else {
        const data = await res.json();
        $('login-err').textContent = data.error || 'Invalid credentials';
        $('login-err').classList.remove('hidden');
      }
    } catch (err) {
      $('login-err').textContent = 'Network error. Please try again.';
      $('login-err').classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign In →';
    }
  });

  /* Verify active session on page load */
  try {
    const res = await fetch('/api/auth/session');
    if (res.ok) {
      const data = await res.json();
      if (data.loggedIn) {
        doLogin();
        showPage('app-page');
        await initApp();
        return;
      }
    }
  } catch(e) {}

  // If no session or verification fails, show login screen
  doLogout();
  showPage('login-page');
});

window.applyMasonry = function() {
  document.querySelectorAll('.emi-grid').forEach(grid => {
    grid.style.gridAutoRows = '1px';
    grid.style.rowGap = '0px';
    
    const items = grid.querySelectorAll('.emi-grid-card');
    items.forEach(item => {
      item.style.gridRowEnd = 'auto';
      item.style.marginBottom = '0';
    });
    
    items.forEach(item => {
      const height = item.getBoundingClientRect().height;
      const rows = Math.ceil(height + 16); // 16px is the row gap equivalent
      item.style.gridRowEnd = `span ${rows}`;
    });
  });
};
window.addEventListener('resize', () => requestAnimationFrame(window.applyMasonry));

/* ── Custom UI Autocomplete Suggestions Dropdowns ── */
function initAutocomplete() {
  const emiDefaults = ["Pocketly", "KreditBee", "mPokket", "Navi", "Paytm", "CASHe", "TrueBalance", "MoneyTap"];
  const expDefaults = ["Rent", "Groceries", "Electricity Bill", "Fuel", "Internet", "Mobile Recharge", "Dining Out", "Netflix", "Water Bill", "Gym"];

  setupSingleAutocomplete($('emi-name'), $('emi-name-dropdown'), () => {
    const saved = state.savedNames || [];
    return [...new Set([...saved, ...emiDefaults])];
  });

  setupSingleAutocomplete($('exp-name'), $('exp-name-dropdown'), () => {
    const saved = state.expenses.map(e => e.name) || [];
    return [...new Set([...saved, ...expDefaults])];
  });
}

function setupSingleAutocomplete(inputEl, dropdownEl, getSuggestionsFn) {
  if (!inputEl || !dropdownEl) return;

  let activeIndex = -1;
  let matches = [];

  function showDropdown() {
    const val = inputEl.value.trim().toLowerCase();
    if (val.length < 3) {
      hideDropdown();
      return;
    }
    const allItems = getSuggestionsFn();
    
    matches = allItems.filter(item => {
      return item.toLowerCase().includes(val);
    }).slice(0, 5);

    if (matches.length === 0) {
      dropdownEl.classList.add('hidden');
      return;
    }

    activeIndex = 0;
    renderMatches();
    dropdownEl.classList.remove('hidden');
  }

  function hideDropdown() {
    dropdownEl.classList.add('hidden');
    activeIndex = -1;
  }

  function renderMatches() {
    dropdownEl.innerHTML = matches.map((item, idx) => {
      const cls = idx === activeIndex ? 'dropdown-item selected' : 'dropdown-item';
      return `<div class="${cls}" data-val="${item}">
        <span>${item}</span>
      </div>`;
    }).join('');

    dropdownEl.querySelectorAll('.dropdown-item').forEach((itemEl, idx) => {
      itemEl.addEventListener('click', (e) => {
        e.stopPropagation();
        selectItem(matches[idx]);
      });
    });
  }

  function selectItem(val) {
    inputEl.value = val;
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    hideDropdown();
  }

  inputEl.addEventListener('input', showDropdown);
  inputEl.addEventListener('focus', showDropdown);

  inputEl.addEventListener('keydown', (e) => {
    if (dropdownEl.classList.contains('hidden')) {
      if (e.key === 'ArrowDown') {
        showDropdown();
        e.preventDefault();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      activeIndex = (activeIndex + 1) % matches.length;
      renderMatches();
      const activeEl = dropdownEl.children[activeIndex];
      if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      activeIndex = (activeIndex - 1 + matches.length) % matches.length;
      renderMatches();
      const activeEl = dropdownEl.children[activeIndex];
      if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
      e.preventDefault();
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && activeIndex < matches.length) {
        selectItem(matches[activeIndex]);
        e.preventDefault();
      }
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      hideDropdown();
    }
  });

  document.addEventListener('click', (e) => {
    if (!inputEl.contains(e.target) && !dropdownEl.contains(e.target)) {
      hideDropdown();
    }
  });
}
