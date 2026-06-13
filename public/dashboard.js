/* dashboard.js — dashboard stats + activity */

function calcStats(){
  const accs=state.emiAccounts, exps=state.expenses;
  const now=todayStr(), thisM=monthKey(now);
  const archivedKeys = new Set(state.archives.map(a=>a.monthKey));
  let borrowed=0,paid=0,activeEmi=0,pending=0,cleared=0,totalExpected=0,receivedSum=0;
  accs.forEach(acc=>{
    borrowed+=acc.amountTaken;
    receivedSum+=(acc.amountReceived || acc.amountTaken);
    const pi=acc.emiItems.filter(i=>i.paid);
    const pa=pi.reduce((s,i)=>s+i.amount,0);
    const ta=acc.emiItems.reduce((s,i)=>s+i.amount,0);
    totalExpected+=ta;
    paid+=pa;
    if(pi.length<acc.emiItems.length) activeEmi++;
    acc.emiItems.forEach(i=>{ 
      const mk = monthKey(i.date);
      if (archivedKeys.has(mk)) return;
      if(!i.paid) pending++; 
      else if(mk===thisM) cleared++; 
    });
  });
  exps.forEach(e=>{ 
    if (e.type === 'recurring') {
      const lastMonth = e.endDate || getLastEmiMonth();
      if (lastMonth) {
        let cur = parseLocalDate(e.dueDate);
        const end = e.endDate ? parseLocalDate(e.endDate) : parseLocalDate(lastMonth + '-01');
        if (!e.endDate) end.setMonth(end.getMonth() + 1);
        let idx = 0;
        while (cur <= end) {
          const mk = monthKey(cur);
          if (!archivedKeys.has(mk)) {
            const isPaid = e.paidMonths && e.paidMonths.includes(idx);
            if (!isPaid) pending++;
            else if (mk === thisM) cleared++;
          }
          if (e.frequency === 'daily') cur.setDate(cur.getDate() + 1);
          else if (e.frequency === 'weekly') cur.setDate(cur.getDate() + 7);
          else cur.setMonth(cur.getMonth() + 1);
          idx++;
        }
      }
    } else {
      const mk = monthKey(e.dueDate);
      if (archivedKeys.has(mk)) return;
      if(!e.paid) pending++; 
      else if(mk===thisM) cleared++; 
    }
  });
  const emiRemaining = Math.max(0, totalExpected - paid);

  // Sum up remaining amount of Monthly Long Term Expenses (recurring expenses with an endDate)
  const longTermRemaining = exps.filter(e => e.type === 'recurring' && e.endDate).reduce((s, e) => {
    const freq = e.frequency || 'monthly';
    const count = getRecurringCount(e.dueDate, e.endDate, freq);
    const paidMonthsCount = (e.paidMonths || []).length;
    const remainingCount = Math.max(0, count - paidMonthsCount);
    return s + (remainingCount * e.amount);
  }, 0);

  // Aggregated installment counts
  let emiPaidCount = 0, emiTotalCount = 0;
  accs.forEach(acc => {
    emiPaidCount += acc.emiItems.filter(i => i.paid).length;
    emiTotalCount += acc.emiItems.length;
  });

  const ltPaidCount = exps.filter(e => e.type === 'recurring' && e.endDate).reduce((s, e) => s + (e.paidMonths || []).length, 0);
  const ltTotalCount = exps.filter(e => e.type === 'recurring' && e.endDate).reduce((s, e) => s + getRecurringCount(e.dueDate, e.endDate, e.frequency || 'monthly'), 0);

  const remaining = emiRemaining + longTermRemaining;
  const extra = Math.max(0, totalExpected - receivedSum);
  const monthlyExp = exps.filter(e => {
    if (e.type !== 'recurring') return false;
    const freq = e.frequency || 'monthly';
    const count = getRecurringCount(e.dueDate, e.endDate, freq);
    let allArchived = true;
    for (let i = 0; i < count; i++) {
      const d = getRecurringDate(e.dueDate, i, freq);
      if (!state.archives.some(a => a.monthKey === d.toISOString().slice(0, 7))) allArchived = false;
    }
    return !allArchived;
  }).reduce((s, e) => {
    const freq = e.frequency || 'monthly';
    let mult = 1;
    if (freq === 'weekly') mult = 4;
    else if (freq === 'daily') mult = 30;
    return s + (e.amount * mult);
  }, 0);
  const pct = totalExpected ? paid / totalExpected : 0;
  return { borrowed, paid, remaining, extra, activeEmi, pending, cleared, monthlyExp, pct, emiRemaining, longTermRemaining, emiPaidCount, emiTotalCount, ltPaidCount, ltTotalCount };
}

function renderDashboard(){
  const s=calcStats();
  $('stat-borrowed').textContent =fmt(s.borrowed);
  $('stat-paid').textContent     =fmt(s.paid);
  $('stat-remaining').textContent=fmt(s.remaining);
  
  const bd = $('stat-remaining-breakdown');
  if (bd) {
    bd.innerHTML = `
      <div style="display:flex;justify-content:space-between;color:var(--text-3);font-size:0.68rem;margin-top:4px">
        <span>🏦 EMI Rem (${s.emiPaidCount}/${s.emiTotalCount}):</span>
        <span style="font-weight:600;color:var(--orange)">${fmt(s.emiRemaining)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;color:var(--text-3);font-size:0.68rem;margin-top:2px">
        <span>📅 Long-Term Rem (${s.ltPaidCount}/${s.ltTotalCount}):</span>
        <span style="font-weight:600;color:var(--text-2)">${fmt(s.longTermRemaining)}</span>
      </div>
    `;
  }
  
  $('stat-extra').textContent    =fmt(s.extra);
  $('stat-emi-count').textContent=s.activeEmi;
  $('stat-monthly').textContent  =fmt(s.monthlyExp);
  $('stat-pending').textContent  =s.pending;
  $('stat-cleared').textContent  =s.cleared;
  $('stat-archived').textContent =state.archives.length;
  setRing('rp-borrowed',s.pct); setRing('rp-paid',s.pct);
  setRing('rp-remaining',1-s.pct);
  renderOverdueBanner();
  renderDashCalendar();
}

function renderOverdueBanner(){
  const now=todayStr(); const od=[];
  state.emiAccounts.forEach(a=>a.emiItems.forEach(i=>{ if(!i.paid&&i.date<now)od.push(a.appName); }));
  state.expenses.forEach(e=>{ if(!e.paid&&e.dueDate<now)od.push(e.name); });
  const b=$('overdue-banner');
  if(!b) return;
  if(od.length){ $('overdue-text').textContent=`${od.length} overdue: ${[...new Set(od)].slice(0,3).join(', ')}`; b.classList.remove('hidden'); }
  else b.classList.add('hidden');
}

/* ── Get all month keys sorted ── */
function getAllMonthKeys(){
  const archivedKeys = new Set(state.archives.map(a=>a.monthKey));
  const keys=new Set();
  state.emiAccounts.forEach(acc=>acc.emiItems.forEach(item=>{
    const mk=monthKey(item.date);
    if(!archivedKeys.has(mk)) keys.add(mk);
  }));
  state.expenses.forEach(e=>{
    if(e.type==='recurring'){
      const lastMonth = e.endDate || getLastEmiMonth();
      if(lastMonth){
        let cur=parseLocalDate(e.dueDate);
        const end = e.endDate ? parseLocalDate(e.endDate) : parseLocalDate(lastMonth+'-01');
        if(!e.endDate) end.setMonth(end.getMonth()+1);
        while(cur<=end){
          const mk=monthKey(cur);
          if(!archivedKeys.has(mk)) keys.add(mk);
          if(e.frequency === 'daily') cur.setDate(cur.getDate()+1);
          else if(e.frequency === 'weekly') cur.setDate(cur.getDate()+7);
          else cur.setMonth(cur.getMonth()+1);
        }
      } else {
        const mk=monthKey(e.dueDate);
        if(!archivedKeys.has(mk)) keys.add(mk);
      }
    } else {
      const mk=monthKey(e.dueDate);
      if(!archivedKeys.has(mk)) keys.add(mk);
    }
  });
  return [...keys].sort();
}

function getLastEmiMonth(){
  let last='';
  state.emiAccounts.forEach(acc=>acc.emiItems.forEach(item=>{
    const mk=monthKey(item.date);
    if(mk>last) last=mk;
  }));
  return last;
}

function buildCalMap(){
  const archivedKeys = new Set(state.archives.map(a=>a.monthKey));
  const map={};
  state.emiAccounts.forEach(acc=>acc.emiItems.forEach((item,idx)=>{
    const mk=monthKey(item.date);
    if(archivedKeys.has(mk)) return;
    if(!map[mk])map[mk]=[];
    map[mk].push({date:item.date,title:acc.appName,amount:item.amount,paid:item.paid,type:'emi',accId:acc.id,itemIdx:idx});
  }));
  state.expenses.forEach(e=>{
    if(e.type==='recurring'){
      const lastMonth = e.endDate || getLastEmiMonth();
      if(lastMonth){
        let cur=parseLocalDate(e.dueDate);
        const end = e.endDate ? parseLocalDate(e.endDate) : parseLocalDate(lastMonth+'-01');
        if(!e.endDate) end.setMonth(end.getMonth()+1);
        let idx=0;
        while(cur<=end){
          const mk=monthKey(cur);
          const d=toLocalYYYYMMDD(cur);
          if(!archivedKeys.has(mk)){
            if(!map[mk])map[mk]=[];
            const isPaid=e.paidMonths&&e.paidMonths.includes(idx);
            map[mk].push({date:d,title:e.name,amount:e.amount,paid:isPaid,type:'expense',expId:e.id,monthIdx:idx});
          }
          if(e.frequency === 'daily') cur.setDate(cur.getDate()+1);
          else if(e.frequency === 'weekly') cur.setDate(cur.getDate()+7);
          else cur.setMonth(cur.getMonth()+1);
          idx++;
        }
      }
    } else if(e.type!=='recurring'){
      const mk=monthKey(e.dueDate);
      if(archivedKeys.has(mk)) return;
      if(!map[mk])map[mk]=[];
      map[mk].push({date:e.dueDate,title:e.name,amount:e.amount,paid:e.paid,type:'expense',expId:e.id,monthIdx:null});
    }
  });
  return map;
}

function shortDate(d){
  const dt = parseLocalDate(d);
  const dateStr = dt.toLocaleDateString('en-IN',{day:'2-digit',month:'short'});
  const dayStr = dt.toLocaleDateString('en-IN',{weekday:'short'});
  return `${dateStr}<span class="hcal-day">${dayStr}</span>`;
}

function renderDashCalendar(){
  const el=$('dash-calendar'); if(!el) return;
  const months=getAllMonthKeys();
  const map=buildCalMap();
  if(!months.length){ el.innerHTML='<div class="empty-state">📅 No payments scheduled yet</div>'; return; }
  el.innerHTML='<div class="hcal-scroll">'+months.map(mk=>{
    const items=(map[mk]||[]).sort((a,b)=>a.date.localeCompare(b.date));
    const total=items.reduce((s,i)=>s+i.amount,0);
    const paidTotal=items.filter(i=>i.paid).reduce((s,i)=>s+i.amount,0);
    const rem=total-paidTotal;
    const emiRem = items.filter(i => i.type === 'emi' && !i.paid).reduce((s, i) => s + i.amount, 0);
    const expRem = items.filter(i => i.type === 'expense' && !i.paid).reduce((s, i) => s + i.amount, 0);
    return `<div class="hcal-col">
      <div class="hcal-month-hdr">
        <span>${monthLbl(mk)}</span>
        <div class="hcal-hdr-actions">
          <button class="hcal-icon-btn hcal-add-btn" onclick="calAddEntry('${mk}')" title="Add entry">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>
      </div>
      <table class="hcal-table">
        <thead><tr><th>Name</th><th>Date</th><th>Day</th><th>Amount</th><th></th></tr></thead>
        <tbody>
        ${items.map(item=>{
          const dt=parseLocalDate(item.date);
          const dateStr=dt.toLocaleDateString('en-IN',{day:'2-digit',month:'short'});
          const dayStr=dt.toLocaleDateString('en-IN',{weekday:'short'});
          return `<tr class="${item.paid?'hcal-paid':'hcal-pending'}">
            <td class="hcal-name">${item.title}</td>
            <td class="hcal-date">${dateStr}</td>
            <td class="hcal-day-cell">${dayStr}</td>
            <td class="hcal-amt ${item.paid?'paid':'pending'}">${fmt(item.amount)}</td>
            <td><button class="tick-btn sm ${item.paid?'paid':'pending'}"
              onclick="dashCalToggle('${item.type}','${item.expId||item.accId}',${item.itemIdx!==undefined?item.itemIdx:'null'},${item.monthIdx!==null&&item.monthIdx!==undefined?item.monthIdx:'null'})">✓</button></td>
          </tr>`;
        }).join('')}
        </tbody>
      </table>
      <div style="padding:.8rem;background:rgba(255,255,255,.015);border-top:1px solid var(--border)">
        <div style="display:flex;justify-content:space-between;font-size:.78rem;margin-bottom:.35rem"><span style="color:var(--text-2)">Total</span><b>${fmt(total)}</b></div>
        <div style="display:flex;justify-content:space-between;font-size:.78rem;margin-bottom:.45rem"><span style="color:var(--green)">Paid</span><span style="color:var(--green);font-weight:600">${fmt(paidTotal)}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:.85rem;border-top:1px dashed var(--border2);padding-top:.4rem"><span style="color:var(--red);font-weight:600">Remaining</span><span style="color:var(--red);font-weight:800">${fmt(rem)}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:.73rem;margin-top:.25rem;padding-left:.5rem;color:var(--text-3)"><span>└─ EMI Remaining</span><span>${fmt(emiRem)}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:.73rem;color:var(--text-3);padding-left:.5rem"><span>└─ Expenses Remaining</span><span>${fmt(expRem)}</span></div>
      </div>
    </div>`;
  }).join('')+'</div>';
}

window.dashCalToggle=(type,id,idx,monthIdx)=>{
  if(type==='emi'){
    const acc=state.emiAccounts.find(a=>a.id===id);
    if(acc&&idx!==null&&idx!==undefined&&acc.emiItems[idx]) acc.emiItems[idx].paid=!acc.emiItems[idx].paid;
  } else {
    const e=state.expenses.find(x=>x.id===id); if(!e)return;
    if(monthIdx!==null){
      if(!e.paidMonths) e.paidMonths=[];
      const i=e.paidMonths.indexOf(monthIdx);
      if(i>=0) e.paidMonths.splice(i,1); else e.paidMonths.push(monthIdx);
    } else { e.paid=!e.paid; }
  }
  save(); renderDashboard();
};

/* ── Activity Tab ─── */
function renderActivity(){
  const items=[];
  state.emiAccounts.forEach(acc=>acc.emiItems.forEach((i,idx)=>items.push({
    name:acc.appName+' EMI #'+(idx+1), amt:i.amount, date:i.date, paid:i.paid
  })));
  state.expenses.forEach(e=>items.push({name:e.name,amt:e.amount,date:e.dueDate,paid:e.paid}));
  items.sort((a,b)=>b.date.localeCompare(a.date));
  const el=$('activity-list'); if(!el) return;
  if(!items.length){el.innerHTML='<div class="empty-state">📊 Add EMIs or expenses to see activity</div>';return;}
  el.innerHTML=items.map(i=>`
    <div class="activity-item">
      <div class="activity-dot ${i.paid?'paid':'pending'}"></div>
      <div class="activity-info"><div class="activity-name">${i.name}</div><div class="activity-meta">${fmtDate(i.date)} <span class="hcal-day-cell" style="font-size:0.65rem;margin-left:4px">${fmtDay(i.date)}</span></div></div>
      <div class="activity-amt ${i.paid?'paid':'pending'}">${fmt(i.amt)}</div>
    </div>`).join('');
}
