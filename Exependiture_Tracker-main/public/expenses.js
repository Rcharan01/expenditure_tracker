/* expenses.js — expense accounts (recurring/one-time) — grid card layout */

/* Expense category icons */
const EXP_ICONS = {
  'fuel': '⛽', 'groceries': '🛒', 'rent': '🏠', 'food': '🍔', 'transport': '🚗',
  'electricity': '⚡', 'water': '💧', 'internet': '🌐', 'phone': '📱', 'gas': '🔥',
  'insurance': '🛡️', 'medical': '💊', 'education': '📚', 'entertainment': '🎬',
  'shopping': '🛍️', 'subscription': '📺', 'gym': '💪', 'laundry': '👕',
  'default': '💰'
};

function getExpIcon(name) {
  const lower = name.toLowerCase();
  for (const [key, icon] of Object.entries(EXP_ICONS)) {
    if (lower.includes(key)) return icon;
  }
  return EXP_ICONS.default;
}

function initExpenses() {
  $('add-expense-btn').addEventListener('click', () => {
    state.editingExpId = null;
    $('exp-modal-title').textContent = 'Add Expense';
    ['exp-name', 'exp-amount', 'exp-date', 'exp-end-date'].forEach(id => $(id).value = '');
    $('exp-type').value = 'recurring';
    $('exp-freq-field').style.display = 'block';
    openModal('expense-modal');
  });
  $('exp-type').addEventListener('change', (e) => {
    $('exp-freq-field').style.display = e.target.value === 'recurring' ? 'block' : 'none';
  });
  $('exp-save-btn').addEventListener('click', saveExpense);
  if($('exp-sort')) $('exp-sort').addEventListener('change', renderExpenseList);
}

function saveExpense() {
  const name = $('exp-name').value.trim(), amount = parseFloat($('exp-amount').value);
  const date = $('exp-date').value, type = $('exp-type').value;
  const endDate = $('exp-end-date').value || '';
  const freq = $('exp-frequency').value || 'monthly';
  if (!name || !amount || !date) { showToast('Fill all required fields', 'error'); return; }
  if (amount <= 0) { showToast('Amount must be positive', 'error'); return; }

  if (state.editingExpId) {
    const e = state.expenses.find(x => x.id === state.editingExpId);
    if (e) { e.name = name; e.amount = amount; e.dueDate = date; e.type = type; e.endDate = endDate; e.frequency = freq; }
  } else {
    state.expenses.push({ id: uid(), name, amount, dueDate: date, type, paid: false, paidMonths: [], endDate, frequency: freq });
  }
  if (!state.savedNames.includes(name)) state.savedNames.push(name);
  save(); closeModal('expense-modal'); renderExpenseList(); renderDashboard();
  showToast(state.editingExpId ? 'Expense updated' : 'Expense added', 'success');
  state.editingExpId = null;
}



function renderExpenseList() {
  const el = $('expense-list');
  if (!state.expenses.length) {
    el.innerHTML = '<div class="empty-state" style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:2.5rem">💳 No expenses yet. Click <b>+ Add Expense</b></div>';
    return;
  }
  const recList = state.expenses.filter(e => {
      if (e.type !== 'recurring') return false;
      const freq = e.frequency || 'monthly';
      const count = getRecurringCount(e.dueDate, e.endDate, freq);
      let allArchived = true;
      for (let i = 0; i < count; i++) {
        const d = getRecurringDate(e.dueDate, i, freq);
        if (!state.archives.some(a => a.monthKey === d.toISOString().slice(0, 7))) allArchived = false;
      }
      return !allArchived;
    });

    const oneList = state.expenses.filter(e => {
      if (e.type === 'recurring') return false;
      const mk = e.dueDate.slice(0, 7);
      return !state.archives.some(a => a.monthKey === mk);
    });

    if (!recList.length && !oneList.length) {
      el.innerHTML = '<div class="empty-state" style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:2.5rem">💳 No active expenses found. Click <b>+ Add Expense</b></div>';
      return;
    }

    const renderCard = e => {
      const isRec = e.type === 'recurring';
      const freq = e.frequency || 'monthly';
      const count = isRec ? getRecurringCount(e.dueDate, e.endDate, freq) : 1;
      const paidMonths = e.paidMonths || [];
      const icon = getExpIcon(e.name);
      
      const freqLabel = freq === 'daily' ? 'Per Day' : freq === 'weekly' ? 'Per Week' : 'Per Month';

      if (isRec) {
        return `<div class="emi-grid-card" data-id="${e.id}">
        <div class="egc-header">
          <div class="egc-title">
            <span class="egc-icon">${icon}</span>
            <span class="egc-name">${e.name}</span>
            <span class="emi-badge badge-active">Recurring</span>
            <span class="egc-pct" style="color:var(--text-3);background:rgba(255,255,255,.05);font-weight:600;font-size:0.75rem">${paidMonths.length}/${count}</span>
          </div>
          <div class="egc-actions">
            <div class="egc-menu-wrap">
              <button class="icon-action egc-menu-btn" onclick="toggleEmiMenu(event)" title="Actions">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
              </button>
              <div class="egc-dropdown">
                <button onclick="editExp('${e.id}')">${ICON.edit} <span>Edit</span></button>
                <button class="dd-danger" onclick="deleteExp('${e.id}')">${ICON.delete} <span>Delete</span></button>
              </div>
            </div>
          </div>
        </div>
        ${e.endDate ? `
        <div class="egc-summary" style="display:flex; justify-content:space-between; flex-wrap:nowrap; gap:0.25rem; overflow-x:auto;">
          <div class="egc-stat"><span class="egc-stat-label">Total</span><span class="egc-stat-val" style="font-size:0.9rem">${fmt(count * e.amount)}</span></div>
          <div class="egc-stat"><span class="egc-stat-label" style="color:var(--green)">Paid</span><span class="egc-stat-val" style="color:var(--green);font-size:0.9rem">${fmt(paidMonths.length * e.amount)}</span></div>
          <div class="egc-stat"><span class="egc-stat-label" style="color:var(--orange)">Remain</span><span class="egc-stat-val" style="color:var(--orange);font-size:0.9rem">${fmt((count - paidMonths.length) * e.amount)}</span></div>
          <div class="egc-stat"><span class="egc-stat-label">To</span><span class="egc-stat-val" style="font-size:0.9rem">${fmtDate(e.endDate)} <span class="hcal-day-cell" style="font-size:0.65rem">${fmtDay(e.endDate)}</span></span></div>
        </div>
        ` : `
        <div class="egc-summary">
          <div class="egc-stat"><span class="egc-stat-label">${freqLabel}</span><span class="egc-stat-val">${fmt(e.amount)}</span></div>
          <div class="egc-stat"><span class="egc-stat-label">From</span><span class="egc-stat-val">${fmtDate(e.dueDate)} <span class="hcal-day-cell" style="font-size:0.65rem">${fmtDay(e.dueDate)}</span></span></div>
          <div class="egc-stat"><span class="egc-stat-label" style="color:var(--green)">Paid</span><span class="egc-stat-val" style="color:var(--green)">${paidMonths.length}/${count}</span></div>
        </div>
        `}
        <div class="egc-table-wrap">
          <table class="egc-table">
            <thead><tr><th>#</th><th>Date</th><th>Day</th><th>Amount</th><th>Status</th></tr></thead>
            <tbody>
            ${Array.from({ length: count }, (_, i) => {
              const d = getRecurringDate(e.dueDate, i, freq);
              const isPaid = paidMonths.includes(i);
              const mLabel = d.toLocaleDateString('en-IN', freq === 'monthly' ? { month: 'short', year: 'numeric' } : { day: '2-digit', month: 'short', year: 'numeric' });
              const dStr = toLocalYYYYMMDD(d);
              return { i, d, isPaid, mLabel, dStr };
            })
            .sort((a, b) => {
              if (count >= 12) {
                if (a.isPaid !== b.isPaid) return a.isPaid ? 1 : -1;
              }
              return a.i - b.i;
            })
            .map(item => {
              return `<tr class="${item.isPaid ? 'row-paid' : 'row-pending'}">
                <td>${item.i + 1}</td>
                <td class="egc-date">${item.mLabel}</td>
                <td class="hcal-day-cell" style="font-size:0.65rem">${fmtDay(item.dStr)}</td>
                <td class="egc-amt">${fmt(e.amount)}</td>
                <td><button class="tick-btn sm ${item.isPaid ? 'paid' : 'pending'}" onclick="toggleExpMonth('${e.id}',${item.i})">✓</button></td>
              </tr>`;
            }).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
      } else {
        return `<div class="emi-grid-card" data-id="${e.id}" style="height:fit-content">
        <div class="egc-header">
          <div class="egc-title">
            <span class="egc-icon">${icon}</span>
            <span class="egc-name">${e.name}</span>
            <span class="emi-badge badge-done">One-time</span>
          </div>
          <div class="egc-actions">
            <div class="egc-menu-wrap">
              <button class="icon-action egc-menu-btn" onclick="toggleEmiMenu(event)" title="Actions">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
              </button>
              <div class="egc-dropdown">
                <button onclick="editExp('${e.id}')">${ICON.edit} <span>Edit</span></button>
                <button class="dd-danger" onclick="deleteExp('${e.id}')">${ICON.delete} <span>Delete</span></button>
              </div>
            </div>
          </div>
        </div>
        <div class="egc-summary" style="border-bottom:none;padding-bottom:1.1rem">
          <div class="egc-stat"><span class="egc-stat-label">Amount</span><span class="egc-stat-val">${fmt(e.amount)}</span></div>
          <div class="egc-stat"><span class="egc-stat-label">Date</span><span class="egc-stat-val">${fmtDate(e.dueDate)} <span class="hcal-day-cell" style="font-size:0.65rem;margin-left:4px">${fmtDay(e.dueDate)}</span></span></div>
          <div class="egc-stat" style="align-items:flex-end">
            <span class="egc-stat-label" style="color:var(--${e.paid ? 'green' : 'text-3'})">${e.paid ? 'Paid' : 'Pending'}</span>
            <button class="tick-btn sm ${e.paid ? 'paid' : 'pending'}" onclick="toggleExpPay('${e.id}')" style="margin-top:2px;width:38px;height:24px;border-radius:4px" title="Mark as ${e.paid ? 'Pending' : 'Paid'}">✓</button>
          </div>
        </div>
      </div>`;
      }
    };

    const sortVal = $('exp-sort') ? $('exp-sort').value : 'date-desc';
    const sortFn = (a, b) => {
      if (sortVal === 'date-desc') return b.dueDate.localeCompare(a.dueDate);
      if (sortVal === 'date-asc') return a.dueDate.localeCompare(b.dueDate);
      if (sortVal === 'amount-desc') return b.amount - a.amount;
      if (sortVal === 'amount-asc') return a.amount - b.amount;
      if (sortVal === 'name') return a.name.localeCompare(b.name);
      return 0;
    };

    let html = '';
    const contList = recList.filter(e => !e.endDate).sort(sortFn);
    const longList = recList.filter(e => e.endDate).sort(sortFn);
    oneList.sort(sortFn);
    
    if (oneList.length) {
      html += `<h3 style="margin:0 0 1rem 0;color:var(--text-2);font-size:.85rem;text-transform:uppercase;letter-spacing:.05em">One-Time Expenses</h3>`;
      html += `<div class="emi-grid" style="margin-bottom:2rem">${oneList.map(renderCard).join('')}</div>`;
    }
    if (contList.length) {
      html += `<h3 style="margin:0 0 1rem 0;color:var(--text-2);font-size:.85rem;text-transform:uppercase;letter-spacing:.05em">Recurring Expenses</h3>`;
      html += `<div class="emi-grid" style="margin-bottom:2rem">${contList.map(renderCard).join('')}</div>`;
    }
    if (longList.length) {
      const longRemaining = longList.reduce((s, e) => {
        const count = getRecurringCount(e.dueDate, e.endDate, e.frequency || 'monthly');
        const paidCount = (e.paidMonths || []).length;
        return s + (Math.max(0, count - paidCount) * e.amount);
      }, 0);
      const totalPaidCount = longList.reduce((s, e) => s + (e.paidMonths || []).length, 0);
      const totalCount = longList.reduce((s, e) => s + getRecurringCount(e.dueDate, e.endDate, e.frequency || 'monthly'), 0);

      html += `<h3 style="margin:0 0 1rem 0;color:var(--text-2);font-size:.85rem;text-transform:uppercase;letter-spacing:.05em;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem">
        <span>Long Term Expenses</span>
        <span style="color:var(--orange);font-weight:600;text-transform:none">Remaining: ${fmt(longRemaining)} (Paid: ${totalPaidCount}/${totalCount})</span>
      </h3>`;
      html += `<div class="emi-grid">${longList.map(renderCard).join('')}</div>`;
    }

    const viewScroll = el.closest('.view') ? el.closest('.view').scrollTop : 0;
    const scrolls = {};
    el.querySelectorAll('.emi-grid-card').forEach(c => {
      const w = c.querySelector('.egc-table-wrap');
      if (w) scrolls[c.dataset.id] = w.scrollTop;
    });

    el.innerHTML = html;

    requestAnimationFrame(() => {
      window.applyMasonry();
      if (el.closest('.view')) el.closest('.view').scrollTop = viewScroll;
      el.querySelectorAll('.emi-grid-card').forEach(c => {
        const w = c.querySelector('.egc-table-wrap');
        if (w && scrolls[c.dataset.id]) w.scrollTop = scrolls[c.dataset.id];
      });
    });
  }

  window.toggleExpPay = id => {
    const e = state.expenses.find(x => x.id === id); if (!e) return;
    e.paid = !e.paid; save(); renderExpenseList(); renderDashboard();
    showToast(e.paid ? 'Marked Paid ✅' : 'Marked Due', e.paid ? 'success' : 'info');
  };

  window.toggleExpMonth = (id, monthIdx) => {
    const e = state.expenses.find(x => x.id === id); if (!e) return;
    if (!e.paidMonths) e.paidMonths = [];
    const idx = e.paidMonths.indexOf(monthIdx);
    if (idx >= 0) e.paidMonths.splice(idx, 1);
    else e.paidMonths.push(monthIdx);
    save(); renderExpenseList(); renderDashboard();
  };

  window.editExp = id => {
    const e = state.expenses.find(x => x.id === id); if (!e) return;
    state.editingExpId = id;
    $('exp-modal-title').textContent = 'Edit Expense';
    $('exp-name').value = e.name; $('exp-amount').value = e.amount;
    $('exp-date').value = e.dueDate; $('exp-type').value = e.type || 'one-time';
    $('exp-end-date').value = e.endDate || '';
    $('exp-frequency').value = e.frequency || 'monthly';
    $('exp-freq-field').style.display = $('exp-type').value === 'recurring' ? 'block' : 'none';
    openModal('expense-modal');
  };
  window.deleteExp = id => confirm2('Delete Expense', 'Delete this expense? All monthly entries will be removed.', () => {
    state.expenses = state.expenses.filter(e => e.id !== id);
    save(); renderExpenseList(); renderDashboard(); showToast('Expense deleted', 'info');
  });
