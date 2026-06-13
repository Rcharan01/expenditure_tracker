/* archive.js — archive view using same calendar-style month cards */

function renderArchive(){
  const el=$('archive-list');
  if(!state.archives.length){
    el.innerHTML='<div class="empty-state" style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:2.5rem">📦 No archived months yet. Months will appear here once archived from the Calendar.</div>';
    return;
  }
  
  /* Sort archives by monthKey descending (newest first) */
  const sorted = [...state.archives].sort((a,b) => b.monthKey.localeCompare(a.monthKey));
  
  el.innerHTML='<div class="hcal-scroll">'+sorted.map(a=>{
    const all=[...a.emiEntries,...a.expEntries];
    const total = all.reduce((s,x)=>s+x.amount,0);
    
    return `<div class="hcal-col hcal-archived">
      <div class="hcal-month-hdr">
        <span>📦 ${a.label}</span>
        <div class="hcal-hdr-actions">
          <button class="hcal-icon-btn hcal-restore-btn" onclick="restoreArchive('${a.monthKey}')" title="Restore to calendar">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 105.64-11.36L1 10"/></svg>
          </button>
          <button class="hcal-icon-btn icon-danger" onclick="deleteArchive('${a.monthKey}')" title="Delete archive">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          </button>
        </div>
      </div>
      <table class="hcal-table">
        <thead><tr><th>Name</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead>
        <tbody>
        ${all.map(item=>`
          <tr class="${item.paid?'hcal-paid':'hcal-pending'}">
            <td class="hcal-name">${item.name}${item.emiNum?' #'+item.emiNum:''}</td>
            <td class="hcal-date">${calShortDate(item.date)}</td>
            <td class="hcal-amt ${item.paid?'paid':'pending'}">${fmt(item.amount)}</td>
            <td><span class="status-pill ${item.paid?'pill-paid':'pill-pending'}">${item.paid?'Paid':'Pending'}</span></td>
          </tr>`).join('')}
          <tr class="hcal-total">
            <td><b>TOTAL</b></td>
            <td></td>
            <td><b>${fmt(total)}</b></td>
            <td>
              <span style="color:var(--green);font-size:.72rem">${fmt(a.totalPaid)} ✓</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>`;
  }).join('')+'</div>';
}

/* Restore an archived month back to calendar */
window.restoreArchive=key=>confirm2('Restore Archive',`Restore ${monthLbl(key)} back to Monthly Expenses?`,()=>{
  state.archives=state.archives.filter(a=>a.monthKey!==key);
  save(); renderArchive(); renderCalendar(); renderDashboard();
  showToast(`${monthLbl(key)} restored to calendar`,'success');
});

window.deleteArchive=key=>confirm2('Remove Archive','Delete this archive record permanently?',()=>{
  state.archives=state.archives.filter(a=>a.monthKey!==key);
  save(); renderArchive(); renderDashboard(); showToast('Archive removed','info');
});
