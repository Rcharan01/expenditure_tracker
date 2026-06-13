/* calendar.js — horizontal scroll calendar (months side-by-side) + auto-archive */

function initCalendar(){
  /* No static archive button — archive is now per-month auto-icon */
}

/* Check if a month should show archive icon:
   Show archive icon on month X when current date is past the last day of month X
   (i.e., we are in the next month or later) */
function shouldShowArchiveIcon(mk){
  const [y,m] = mk.split('-').map(Number);
  const now = new Date();
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth()+1; // 1-indexed
  const nowDay = now.getDate();
  
  // Get last day of the month mk
  const lastDay = new Date(y, m, 0).getDate();
  
  // Show archive if: we are past the last day of that month
  // i.e., current month > mk month, OR current month === mk month but day === lastDay
  if(nowYear > y) return true;
  if(nowYear === y && nowMonth > m) return true;
  if(nowYear === y && nowMonth === m && nowDay >= lastDay) return true;
  return false;
}

/* Check if a month is already archived */
function isMonthArchived(mk){
  return state.archives.some(a => a.monthKey === mk);
}

function renderCalendar(){
  const base=new Date();
  base.setMonth(base.getMonth()+state.calOffset); base.setDate(1);
  const curMk=monthKey(base);

  /* Get all months that have entries */
  const allMonths=new Set();
  state.emiAccounts.forEach(acc=>acc.emiItems.forEach(item=>allMonths.add(monthKey(item.date))));
  const lastEmi=getCalLastEmi();
  state.expenses.forEach(e=>{
    if(e.type==='recurring'){
      const endTarget = e.endDate || (lastEmi ? lastEmi : '');
      if(endTarget){
        let c=parseLocalDate(e.dueDate);
        const end = e.endDate ? parseLocalDate(e.endDate) : parseLocalDate(endTarget+'-01');
        if(!e.endDate) end.setMonth(end.getMonth()+1);
        while(c<=end){ 
          allMonths.add(monthKey(c)); 
          if(e.frequency === 'daily') c.setDate(c.getDate()+1);
          else if(e.frequency === 'weekly') c.setDate(c.getDate()+7);
          else c.setMonth(c.getMonth()+1); 
        }
      } else { allMonths.add(monthKey(e.dueDate)); }
    } else { allMonths.add(monthKey(e.dueDate)); }
  });
  
  /* Filter out archived months */
  const archivedKeys = new Set(state.archives.map(a=>a.monthKey));
  const months=[...allMonths].filter(mk => !archivedKeys.has(mk)).sort();

  /* Build entry map */
  const map={};
  state.emiAccounts.forEach(acc=>acc.emiItems.forEach((item,idx)=>{
    const mk=monthKey(item.date);
    if(archivedKeys.has(mk)) return; // skip archived
    if(!map[mk])map[mk]=[];
    map[mk].push({date:item.date,title:acc.appName,amount:item.amount,paid:item.paid,type:'emi',accId:acc.id,itemIdx:idx});
  }));
  state.expenses.forEach(e=>{
    if(e.type==='recurring'){
      const endTarget = e.endDate || (lastEmi ? lastEmi : '');
      if(endTarget){
        let c=parseLocalDate(e.dueDate);
        const end = e.endDate ? parseLocalDate(e.endDate) : parseLocalDate(endTarget+'-01');
        if(!e.endDate) end.setMonth(end.getMonth()+1);
        let idx=0;
        while(c<=end){
          const mk=monthKey(c), d=toLocalYYYYMMDD(c);
          if(!archivedKeys.has(mk)){
            if(!map[mk])map[mk]=[];
            const isPaid=e.paidMonths&&e.paidMonths.includes(idx);
            map[mk].push({date:d,title:e.name,amount:e.amount,paid:isPaid,type:'expense',expId:e.id,monthIdx:idx});
          }
          if(e.frequency === 'daily') c.setDate(c.getDate()+1);
          else if(e.frequency === 'weekly') c.setDate(c.getDate()+7);
          else c.setMonth(c.getMonth()+1);
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

  const container=$('cal-container');
  if(!months.length){
    container.innerHTML='<div class="empty-state" style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:2rem">📅 No data yet</div>';
    return;
  }

  container.innerHTML='<div class="hcal-scroll">'+months.map(mk=>{
    const items=(map[mk]||[]).sort((a,b)=>a.date.localeCompare(b.date));
    const total=items.reduce((s,i)=>s+i.amount,0);
    const paid=items.filter(i=>i.paid).reduce((s,i)=>s+i.amount,0);
    const rem=total-paid;
    const emiRem = items.filter(i => i.type === 'emi' && !i.paid).reduce((s, i) => s + i.amount, 0);
    const expRem = items.filter(i => i.type === 'expense' && !i.paid).reduce((s, i) => s + i.amount, 0);
    const isCurrent=mk===curMk;
    const showArchive = shouldShowArchiveIcon(mk);
    
    return `<div class="hcal-col ${isCurrent?'hcal-current':''}">
      <div class="hcal-month-hdr">
        <span>${monthLbl(mk)}</span>
        <div class="hcal-hdr-actions">
          ${showArchive ? `<button class="hcal-icon-btn hcal-archive-btn" onclick="archiveMonth('${mk}')" title="Archive this month">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></svg>
          </button>` : ''}
          <button class="hcal-icon-btn hcal-add-btn" onclick="calAddEntry('${mk}')" title="Add entry">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>
      </div>
      <table class="hcal-table">
        <thead><tr><th>Name</th><th>Date</th><th>Day</th><th>Amount</th><th></th></tr></thead>
        <tbody>
        ${items.map(item=>{
          const dt=new Date(item.date+'T00:00:00');
          const dateStr=dt.toLocaleDateString('en-IN',{day:'2-digit',month:'short'});
          const dayStr=dt.toLocaleDateString('en-IN',{weekday:'short'});
          return `
          <tr class="${item.paid?'hcal-paid':'hcal-pending'}">
            <td class="hcal-name">${item.title}</td>
            <td class="hcal-date">${dateStr}</td>
            <td class="hcal-day-cell">${dayStr}</td>
            <td class="hcal-amt ${item.paid?'paid':'pending'}">${fmt(item.amount)}</td>
            <td><button class="tick-btn sm ${item.paid?'paid':'pending'}"
              onclick="calToggle2('${item.type}','${item.expId||item.accId}',${item.itemIdx!==undefined?item.itemIdx:'null'},${item.monthIdx!==null&&item.monthIdx!==undefined?item.monthIdx:'null'})">✓</button></td>
          </tr>`;
        }).join('')}
        </tbody>
      </table>
      <div style="padding:.8rem;background:rgba(255,255,255,.015);border-top:1px solid var(--border)">
        <div style="display:flex;justify-content:space-between;font-size:.78rem;margin-bottom:.35rem"><span style="color:var(--text-2)">Total Amount</span><b>${fmt(total)}</b></div>
        <div style="display:flex;justify-content:space-between;font-size:.78rem;margin-bottom:.45rem"><span style="color:var(--green)">Total Paid</span><span style="color:var(--green);font-weight:600">${fmt(paid)}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:.85rem;border-top:1px dashed var(--border2);padding-top:.4rem"><span style="color:var(--red);font-weight:600">Remaining</span><span style="color:var(--red);font-weight:800">${fmt(rem)}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:.73rem;margin-top:.25rem;padding-left:.5rem;color:var(--text-3)"><span>└─ EMI Remaining</span><span>${fmt(emiRem)}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:.73rem;color:var(--text-3);padding-left:.5rem"><span>└─ Expenses Remaining</span><span>${fmt(expRem)}</span></div>
      </div>
    </div>`;
  }).join('')+'</div>';
}

function calShortDate(d){
  const dt = parseLocalDate(d);
  const dateStr = dt.toLocaleDateString('en-IN',{day:'2-digit',month:'short'});
  const dayStr = dt.toLocaleDateString('en-IN',{weekday:'short'});
  return `${dateStr}<span class="hcal-day">${dayStr}</span>`;
}

function getCalLastEmi(){
  let last='';
  state.emiAccounts.forEach(acc=>acc.emiItems.forEach(item=>{
    const mk=monthKey(item.date); if(mk>last)last=mk;
  }));
  return last;
}

window.calToggle2=(type,id,idx,monthIdx)=>{
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
  save(); renderCalendar(); renderDashboard();
};

/* Add entry from calendar "+" button — opens expense modal pre-filled with month */
window.calAddEntry=(mk)=>{
  state.editingExpId=null;
  $('exp-modal-title').textContent='Add Expense';
  ['exp-name','exp-amount','exp-end-date'].forEach(id=>$(id).value='');
  $('exp-type').value='one-time';
  $('exp-freq-field').style.display='none';
  // Pre-fill date to 1st of the clicked month
  const [y,m]=mk.split('-');
  $('exp-date').value=`${y}-${m}-01`;
  openModal('expense-modal');
};

/* Archive a specific month (called from per-month archive icon) */
window.archiveMonth=(mk)=>{
  confirm2('Archive Month',`Archive ${monthLbl(mk)}? A snapshot will be saved and the month will be removed from Monthly Expenses.`,()=>{
    const emiE=[], expE=[];
    state.emiAccounts.forEach(acc=>acc.emiItems.filter(i=>monthKey(i.date)===mk).forEach(i=>{
      emiE.push({name:acc.appName,emiNum:i.index,amount:i.amount,paid:i.paid,date:i.date});
    }));
    
    /* For recurring expenses, find entries for this month */
    state.expenses.forEach(e=>{
      if(e.type==='recurring'){
        let c=parseLocalDate(e.dueDate);
        let idx=0;
        const endTarget = e.endDate || getCalLastEmi();
        if(!endTarget) return;
        const end = e.endDate ? parseLocalDate(e.endDate) : parseLocalDate(endTarget+'-01');
        if(!e.endDate) end.setMonth(end.getMonth()+1);
        while(c<=end){
          if(monthKey(c)===mk){
            const isPaid = e.paidMonths && e.paidMonths.includes(idx);
            expE.push({name:e.name,amount:e.amount,paid:isPaid,date:toLocalYYYYMMDD(c)});
          }
          if(e.frequency === 'daily') c.setDate(c.getDate()+1);
          else if(e.frequency === 'weekly') c.setDate(c.getDate()+7);
          else c.setMonth(c.getMonth()+1);
          idx++;
        }
      } else if(monthKey(e.dueDate)===mk){
        expE.push({name:e.name,amount:e.amount,paid:e.paid,date:e.dueDate});
      }
    });
    
    const all=[...emiE,...expE];
    const rec={monthKey:mk,label:monthLbl(mk),emiEntries:emiE,expEntries:expE,
      totalPaid:all.filter(x=>x.paid).reduce((s,x)=>s+x.amount,0),
      totalPending:all.filter(x=>!x.paid).reduce((s,x)=>s+x.amount,0),
      archivedAt:new Date().toISOString()};
    const existIdx=state.archives.findIndex(a=>a.monthKey===mk);
    if(existIdx>=0)state.archives[existIdx]=rec; else state.archives.unshift(rec);
    save(); renderCalendar(); renderArchive(); renderDashboard();
    showToast(`${monthLbl(mk)} archived ✅`,'success');
  });
};
