/* emi.js — EMI account management: grid cards with table rows, icon actions */

function initEmi(){
  $('add-emi-btn').addEventListener('click',()=>{
    state.editingEmiId=null;
    $('emi-modal-title').textContent='Add EMI Account';
    ['emi-name','emi-amount','emi-received','emi-start','emi-count'].forEach(id=>$(id).value='');
    $('emi-same-amount').checked=false;
    $('emi-mode').value='auto';
    $('emi-frequency').value='monthly';
    $$('.seg-btn').forEach(b => b.classList.toggle('active', b.dataset.val === 'auto'));
    $('emi-manual-section').classList.add('hidden');
    $('emi-date-inputs').innerHTML='';
    delete $('emi-date-inputs').dataset.start;
    openModal('emi-modal');
  });
  $('emi-same-amount').addEventListener('change', (e) => {
    if(e.target.checked) $('emi-received').value = $('emi-amount').value;
  });
  $('emi-amount').addEventListener('input', (e) => {
    if($('emi-same-amount').checked) $('emi-received').value = e.target.value;
    buildManualRows();
  });
  $$('.seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      $('emi-mode').value = btn.dataset.val;
      buildManualRows();
    });
  });
  ['emi-start','emi-count'].forEach(id=>$(id).addEventListener('input',buildManualRows));
  $('emi-frequency').addEventListener('change',buildManualRows);
  $('emi-save-btn').addEventListener('click',saveEmi);
  if($('emi-filter')) $('emi-filter').addEventListener('change', renderEmiList);
  if($('emi-sort')) $('emi-sort').addEventListener('change', renderEmiList);
}

function buildManualRows(){
  const start=$('emi-start').value, count=parseInt($('emi-count').value)||0;
  const mode = $('emi-mode').value;
  if(!start || !count || !mode){$('emi-manual-section').classList.add('hidden');return;}
  
  const isCustom = (mode === 'manual');
  $('emi-manual-section').classList.remove('hidden');
  const c=$('emi-date-inputs');
  const prev={};
  c.querySelectorAll('.emi-date-row').forEach(r=>{
    prev[r.dataset.idx]={date:r.querySelector('.edr-date').value,amt:r.querySelector('.edr-amt').value};
  });
  const startChanged = (c.dataset.start !== start);
  c.dataset.start = start;
  c.innerHTML='';
  const [y,m,day] = start.split('-').map(Number);
  const freq = $('emi-frequency').value || 'monthly';
  for(let i=0;i<count;i++){
    let d;
    if(freq === 'daily'){
      d = new Date(y, m-1, day + i);
    } else if(freq === 'weekly'){
      d = new Date(y, m-1, day + (i * 7));
    } else {
      d = new Date(y, m-1 + i, 1);
      const lastDay = new Date(y, m-1 + i + 1, 0).getDate();
      d.setDate(Math.min(day, lastDay));
    }
    const dStr = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    
    const row=document.createElement('div'); row.className='emi-date-row'; row.dataset.idx=i;
    const totalAmount = parseFloat($('emi-amount').value) || 0;
    const defaultAmt = count > 0 ? Math.round(totalAmount / count) : '';
    const valAmt = (!isCustom) ? defaultAmt : ((prev[i]?.amt !== undefined && prev[i].amt !== '') ? prev[i].amt : defaultAmt);
    const valDate = (!isCustom || startChanged) ? dStr : (prev[i]?.date || dStr);
    
    row.innerHTML=`<span>EMI ${i+1}</span>
      <input class="edr-date" type="date" value="${valDate}"/>
      <div style="display:flex;gap:0.3rem">
        <input class="edr-amt" type="number" step="0.01" value="${valAmt}" min="0.01" placeholder="Amount"/>
        <button type="button" class="ghost-btn sm apply-rem-btn" title="Apply to remaining" onclick="applyToRem(${i})" style="padding:0 0.4rem;font-size:0.9rem">↓</button>
      </div>`;
    c.appendChild(row);

    const checkCustom = () => {
      if($('emi-mode').value !== 'manual') {
        $('emi-mode').value = 'manual';
        $$('.seg-btn').forEach(b => b.classList.toggle('active', b.dataset.val === 'manual'));
      }
    };
    row.querySelector('.edr-date').addEventListener('input', checkCustom);
    row.querySelector('.edr-amt').addEventListener('input', checkCustom);
  }
}

window.applyToRem = (idx) => {
  const rows = $('emi-date-inputs').querySelectorAll('.emi-date-row');
  if(idx >= rows.length) return;
  const val = rows[idx].querySelector('.edr-amt').value;
  for(let i = idx + 1; i < rows.length; i++){
    rows[i].querySelector('.edr-amt').value = val;
  }
  if($('emi-mode').value !== 'manual') {
    $('emi-mode').value = 'manual';
    $$('.seg-btn').forEach(b => b.classList.toggle('active', b.dataset.val === 'manual'));
  }
  showToast('Applied to remaining EMIs', 'info');
};

function saveEmi(){
  const name=  $('emi-name').value.trim();
  const amount=parseFloat($('emi-amount').value);
  const amountReceived=parseFloat($('emi-received').value)||amount;
  const start= $('emi-start').value;
  const count= parseInt($('emi-count').value);
  const mode = $('emi-mode').value;
  if(!name||!amount||!start||!count||!mode){showToast('Fill all required fields & select schedule','error');return;}
  if(amount<=0||count<1){showToast('Invalid values','error');return;}
  
  let items=[];
  let hasEmpty = false;
  $('emi-date-inputs').querySelectorAll('.emi-date-row').forEach((row,i)=>{
    const val = row.querySelector('.edr-amt').value;
    if(!val) hasEmpty = true;
    items.push({
      index:i+1,
      date:row.querySelector('.edr-date').value,
      amount:parseFloat(val)||0,
      paid:false
    });
  });
  if(items.length !== count) { showToast('Please enter all dates','error'); return; }
  if(hasEmpty) { showToast('Please fill all EMI amounts','error'); return; }
  if(state.editingEmiId){
    const acc=state.emiAccounts.find(a=>a.id===state.editingEmiId);
    if(acc){
      acc.appName=name;acc.amountTaken=amount;acc.amountReceived=amountReceived;acc.emiCount=count;acc.startDate=start;acc.mode=mode;acc.frequency=$('emi-frequency').value||'monthly';
      // preserve paid status for existing items
      const oldItems = acc.emiItems;
      items.forEach((item,i)=>{
        if(oldItems[i] && oldItems[i].paid) item.paid=true;
      });
      acc.emiItems=items;
    }
  } else {
    state.emiAccounts.push({id:uid(),appName:name,amountTaken:amount,amountReceived,emiCount:count,startDate:start,mode,frequency:$('emi-frequency').value||'monthly',emiItems:items});
  }
  if(!state.savedNames.includes(name)) state.savedNames.push(name);
  save(); closeModal('emi-modal'); renderEmiList(); renderDashboard();
  showToast(state.editingEmiId?'EMI updated':'EMI Account added','success');
  state.editingEmiId=null;
}

/* ── SVG Icon helpers ── */
const ICON = {
  edit: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  delete: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`,
  detail: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
};

function renderEmiList(){
  const el=$('emi-list');
  let activeEmis = state.emiAccounts.filter(acc => {
    return !acc.emiItems.every(item => state.archives.some(a => a.monthKey === item.date.slice(0,7)));
  });

  const filterVal = $('emi-filter') ? $('emi-filter').value : 'all';
  const sortVal = $('emi-sort') ? $('emi-sort').value : 'date-desc';

  if (filterVal === 'active') {
    activeEmis = activeEmis.filter(acc => acc.emiItems.filter(i=>i.paid).length < acc.emiItems.length);
  } else if (filterVal === 'done') {
    activeEmis = activeEmis.filter(acc => acc.emiItems.filter(i=>i.paid).length === acc.emiItems.length);
  }

  activeEmis.sort((a, b) => {
    if (sortVal === 'date-desc') return b.startDate.localeCompare(a.startDate);
    if (sortVal === 'date-asc') return a.startDate.localeCompare(b.startDate);
    if (sortVal === 'amount-desc') return b.amountTaken - a.amountTaken;
    if (sortVal === 'amount-asc') return a.amountTaken - b.amountTaken;
    if (sortVal === 'name') return a.appName.localeCompare(b.appName);
    return 0;
  });

  if(!activeEmis.length){
    el.innerHTML='<div class="empty-state" style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:2.5rem">💳 No EMIs found for this filter.</div>';
    return;
  }
  
  const viewScroll = el.closest('.view') ? el.closest('.view').scrollTop : 0;
  const scrolls = {};
  el.querySelectorAll('.emi-grid-card').forEach(c => {
    const w = c.querySelector('.egc-table-wrap');
    if (w) scrolls[c.dataset.id] = w.scrollTop;
  });

  el.innerHTML='<div class="emi-grid">'+activeEmis.map(acc=>{
    const pi=acc.emiItems.filter(i=>i.paid), done=pi.length===acc.emiItems.length;
    const pa=pi.reduce((s,i)=>s+i.amount,0);
    const ta=acc.emiItems.reduce((s,i)=>s+i.amount,0);
    const rem=Math.max(0,ta-pa);
    const received=acc.amountReceived||acc.amountTaken;
    const extra=ta-received;
    const pct=acc.emiItems.length?Math.round(pi.length/acc.emiItems.length*100):0;
    return `<div class="emi-grid-card" data-id="${acc.id}">
      <div class="egc-accent"></div>
      <div class="egc-header">
        <div class="egc-title" onclick="openEmiDetail('${acc.id}')" style="cursor:pointer" title="View detail">
          <span class="egc-name">${acc.appName}</span>
          <span class="emi-badge ${done?'badge-done':'badge-active'}">${done?'Done':'Active'}</span>
          <span class="egc-pct">${pct}%</span>
          <span class="egc-pct" style="color:var(--text-3);background:rgba(255,255,255,.05);font-weight:600">${pi.length}/${acc.emiItems.length}</span>
        </div>
        <div class="egc-actions">
          <button class="icon-action" onclick="editEmi('${acc.id}')" title="Edit">${ICON.edit}</button>
          <button class="icon-action" onclick="duplicateEmi('${acc.id}')" title="Duplicate">${ICON.copy}</button>
          <button class="icon-action icon-danger" onclick="deleteEmi('${acc.id}')" title="Delete">${ICON.delete}</button>
        </div>
      </div>
      <div class="egc-progress"><div class="egc-progress-bar" style="width:${pct}%"></div></div>
      <div class="egc-summary" style="display:flex; justify-content:space-between; flex-wrap:nowrap; gap:0.25rem; overflow-x:auto;">
        <div class="egc-stat"><span class="egc-stat-label">Taken</span><span class="egc-stat-val" style="font-size:0.9rem">${fmt(acc.amountTaken)}</span></div>
        <div class="egc-stat"><span class="egc-stat-label" style="color:var(--text-2)">Received</span><span class="egc-stat-val" style="color:var(--text-2);font-size:0.9rem">${fmt(received)}</span></div>
        <div class="egc-stat"><span class="egc-stat-label" style="color:var(--green)">Paid</span><span class="egc-stat-val" style="color:var(--green);font-size:0.9rem">${fmt(pa)}</span></div>
        <div class="egc-stat"><span class="egc-stat-label" style="color:var(--orange)">Remain</span><span class="egc-stat-val" style="color:var(--orange);font-size:0.9rem">${fmt(rem)}</span></div>
        <div class="egc-stat"><span class="egc-stat-label" style="color:var(--pink)">Extra</span><span class="egc-stat-val" style="color:var(--pink);font-size:0.9rem">${fmt(extra)}</span></div>
      </div>
      <div class="egc-table-wrap">
        <table class="egc-table">
          <thead><tr><th>#</th><th>Date</th><th>Day</th><th>Amount</th><th>Status</th></tr></thead>
          <tbody>
          ${acc.emiItems
            .map((item, idx) => ({ ...item, idx }))
            .sort((a, b) => {
              if (acc.emiItems.length >= 12) {
                if (a.paid !== b.paid) return a.paid ? 1 : -1;
              }
              return a.index - b.index;
            })
            .map(item => {
              return `<tr class="${item.paid?'row-paid':'row-pending'}">
                <td>${item.index}</td>
                <td class="egc-date">${fmtDate(item.date)}</td>
                <td class="hcal-day-cell" style="font-size:0.65rem">${fmtDay(item.date)}</td>
                <td class="egc-amt">${fmt(item.amount)}</td>
                <td><button class="tick-btn sm ${item.paid?'paid':'pending'}" onclick="toggleEmiPay('${acc.id}',${item.idx})">✓</button></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  }).join('')+'</div>';
  
  requestAnimationFrame(() => {
    window.applyMasonry();
    if (el.closest('.view')) el.closest('.view').scrollTop = viewScroll;
    el.querySelectorAll('.emi-grid-card').forEach(c => {
      const w = c.querySelector('.egc-table-wrap');
      if (w && scrolls[c.dataset.id]) w.scrollTop = scrolls[c.dataset.id];
    });
  });
}

/* Toggle the ⋮ dropdown menu */
window.toggleEmiMenu=(e)=>{
  e.stopPropagation();
  const dd = e.currentTarget.nextElementSibling;
  const wasOpen = dd.classList.contains('open');
  // Close all others first
  document.querySelectorAll('.egc-dropdown.open').forEach(d=>d.classList.remove('open'));
  if(!wasOpen) dd.classList.add('open');
};
/* Close dropdown on any outside click */
document.addEventListener('click',()=>{
  document.querySelectorAll('.egc-dropdown.open').forEach(d=>d.classList.remove('open'));
});

window.toggleEmiPay=(accId,idx)=>{
  const acc=state.emiAccounts.find(a=>a.id===accId); if(!acc)return;
  if (acc.emiItems[idx]) {
    acc.emiItems[idx].paid=!acc.emiItems[idx].paid;
    save(); renderEmiList(); renderDashboard();
    showToast(acc.emiItems[idx].paid?'Marked Paid ✅':'Marked Pending',acc.emiItems[idx].paid?'success':'info');
  }
};

window.editEmi=id=>{
  const acc=state.emiAccounts.find(a=>a.id===id); if(!acc)return;
  state.editingEmiId=id;
  $('emi-modal-title').textContent='Edit EMI Account';
  $('emi-name').value=acc.appName;
  $('emi-amount').value=acc.amountTaken;
  $('emi-received').value=acc.amountReceived||acc.amountTaken;
  $('emi-same-amount').checked=(acc.amountReceived===acc.amountTaken || !acc.amountReceived);
  $('emi-start').value=acc.startDate;
  $('emi-count').value=acc.emiCount;
  $('emi-mode').value=acc.mode||'auto';
  $$('.seg-btn').forEach(b => b.classList.toggle('active', b.dataset.val === (acc.mode||'auto')));
  openModal('emi-modal');
  
  $('emi-manual-section').classList.remove('hidden');
  const c=$('emi-date-inputs');
  c.dataset.start=acc.startDate;
  c.innerHTML='';
  acc.emiItems.forEach((item, i) => {
    const row=document.createElement('div'); row.className='emi-date-row'; row.dataset.idx=i;
    row.innerHTML=`<span>EMI ${i+1}</span>
      <input class="edr-date" type="date" value="${item.date}"/>
      <div style="display:flex;gap:0.3rem">
        <input class="edr-amt" type="number" step="0.01" value="${item.amount}" min="0.01"/>
        <button type="button" class="ghost-btn sm apply-rem-btn" title="Apply to remaining" onclick="applyToRem(${i})" style="padding:0 0.4rem;font-size:0.9rem">↓</button>
      </div>`;
    c.appendChild(row);
    const checkCustom = () => {
      if($('emi-mode').value !== 'manual') {
        $('emi-mode').value = 'manual';
        $$('.seg-btn').forEach(b => b.classList.toggle('active', b.dataset.val === 'manual'));
      }
    };
    row.querySelector('.edr-date').addEventListener('input', checkCustom);
    row.querySelector('.edr-amt').addEventListener('input', checkCustom);
  });
};

window.duplicateEmi=id=>{
  const acc=state.emiAccounts.find(a=>a.id===id); if(!acc)return;
  
  $('clone-exact-btn').onclick = () => {
    closeModal('clone-modal');
    state._dupAccId = id;
    $('dup-name').value = '';
    $('dup-title').textContent = `Duplicate "${acc.appName}"`;
    openModal('dup-modal');
    setTimeout(()=>$('dup-name').focus(),100);
  };
  
  $('clone-edit-btn').onclick = () => {
    closeModal('clone-modal');
    state.editingEmiId = null;
    $('emi-modal-title').textContent = 'Clone EMI Account';
    
    $('emi-name').value = '';
    $('emi-amount').value = acc.amountTaken;
    $('emi-received').value = acc.amountReceived || acc.amountTaken;
    $('emi-same-amount').checked = (acc.amountReceived===acc.amountTaken || !acc.amountReceived);
    $('emi-start').value = acc.startDate;
    $('emi-count').value = acc.emiCount;
    $('emi-mode').value = acc.mode || 'auto';
    $$('.seg-btn').forEach(b => b.classList.toggle('active', b.dataset.val === (acc.mode||'auto')));
    
    $('emi-manual-section').classList.remove('hidden');
    const c=$('emi-date-inputs');
    c.dataset.start=acc.startDate;
    c.innerHTML='';
    acc.emiItems.forEach((item, i) => {
      const row=document.createElement('div'); row.className='emi-date-row'; row.dataset.idx=i;
      row.innerHTML=`<span>EMI ${i+1}</span>
        <input class="edr-date" type="date" value="${item.date}"/>
        <div style="display:flex;gap:0.3rem">
          <input class="edr-amt" type="number" step="0.01" value="${item.amount}" min="0.01"/>
          <button type="button" class="ghost-btn sm apply-rem-btn" title="Apply to remaining" onclick="applyToRem(${i})" style="padding:0 0.4rem;font-size:0.9rem">↓</button>
        </div>`;
      c.appendChild(row);
      const checkCustom = () => {
        if($('emi-mode').value !== 'manual') {
          $('emi-mode').value = 'manual';
          $$('.seg-btn').forEach(b => b.classList.toggle('active', b.dataset.val === 'manual'));
        }
      };
      row.querySelector('.edr-date').addEventListener('input', checkCustom);
      row.querySelector('.edr-amt').addEventListener('input', checkCustom);
    });
    
    openModal('emi-modal');
  };
  
  openModal('clone-modal');
};

window.doDuplicate=()=>{
  const acc=state.emiAccounts.find(a=>a.id===state._dupAccId); if(!acc)return;
  const newName = $('dup-name').value.trim();
  if(!newName){showToast('Enter a name','error');return;}
  const clone={
    id:uid(), appName:newName,
    amountTaken:acc.amountTaken, amountReceived:acc.amountReceived||acc.amountTaken, emiCount:acc.emiCount,
    startDate:acc.startDate, mode:acc.mode,
    emiItems:acc.emiItems.map(i=>({...i,paid:false}))
  };
  state.emiAccounts.push(clone);
  if(!state.savedNames.includes(newName)) state.savedNames.push(newName);
  save(); closeModal('dup-modal'); renderEmiList(); renderDashboard();
  showToast(`"${newName}" duplicated ✅`,'success');
};

window.deleteEmi=id=>confirm2('Delete EMI Account','Are you sure? This cannot be undone.',()=>{
  state.emiAccounts=state.emiAccounts.filter(a=>a.id!==id);
  save(); renderEmiList(); renderDashboard(); showToast('EMI Account deleted','info');
});

window.openEmiDetail=id=>{
  const acc=state.emiAccounts.find(a=>a.id===id); if(!acc)return;
  const pi=acc.emiItems.filter(i=>i.paid);
  const pa=pi.reduce((s,i)=>s+i.amount,0);
  const ta=acc.emiItems.reduce((s,i)=>s+i.amount,0);
  const rem=Math.max(0,ta-pa);
  const received=acc.amountReceived||acc.amountTaken;
  const ext=ta-received;
  $('emi-detail-title').textContent=acc.appName+' — Full Detail';
  $('emi-detail-body').innerHTML=`
    <div class="detail-summary">
      <div class="detail-stat"><p>Amount Taken</p><h4>${fmt(acc.amountTaken)}</h4></div>
      <div class="detail-stat"><p>Received</p><h4 style="color:var(--text-2)">${fmt(received)}</h4></div>
      <div class="detail-stat"><p>Total Paid</p><h4 style="color:var(--green)">${fmt(pa)}</h4></div>
      <div class="detail-stat"><p>Remaining</p><h4 style="color:var(--orange)">${fmt(rem)}</h4></div>
      <div class="detail-stat"><p>Extra/Interest</p><h4 style="color:var(--pink)">${fmt(ext)}</h4></div>
      <div class="detail-stat"><p>EMIs Paid</p><h4>${pi.length} / ${acc.emiItems.length}</h4></div>
      <div class="detail-stat"><p>Per EMI (avg)</p><h4>${fmt(Math.round(ta/acc.emiCount))}</h4></div>
      <div class="detail-stat"><p>Start Date</p><h4>${fmtDate(acc.startDate)} <span class="hcal-day-cell" style="font-size:0.75rem;margin-left:4px">${fmtDay(acc.startDate)}</span></h4></div>
    </div>
    <div style="overflow-x:auto; width:100%;">
      <table class="emi-table" style="width:100%">
        <thead><tr><th>#</th><th>Date</th><th>Day</th><th>Amount</th><th>Status</th><th>Pay</th></tr></thead>
        <tbody>${acc.emiItems
          .map((item, idx) => ({ ...item, idx }))
          .sort((a, b) => {
            if (acc.emiItems.length >= 12) {
              if (a.paid !== b.paid) return a.paid ? 1 : -1;
            }
            return a.index - b.index;
          })
          .map(item => `<tr class="${item.paid?'row-paid':'row-pending'}">
            <td>${item.index}</td>
            <td>${fmtDate(item.date)}</td>
            <td class="hcal-day-cell">${fmtDay(item.date)}</td>
            <td>${fmt(item.amount)}</td>
            <td><span class="status-pill ${item.paid?'pill-paid':'pill-pending'}">${item.paid?'Paid':'Pending'}</span></td>
            <td style="text-align:center"><button class="tick-btn ${item.paid?'paid':'pending'}" onclick="toggleEmiPayDetail('${acc.id}',${item.idx})">✓</button></td>
          </tr>`).join('')}</tbody>
      </table>
    </div>`;
  openModal('emi-detail-modal');
};

window.toggleEmiPayDetail=(accId,idx)=>{
  const acc=state.emiAccounts.find(a=>a.id===accId); if(!acc)return;
  if (acc.emiItems[idx]) {
    acc.emiItems[idx].paid=!acc.emiItems[idx].paid;
    save(); openEmiDetail(accId); renderEmiList(); renderDashboard();
  }
};
