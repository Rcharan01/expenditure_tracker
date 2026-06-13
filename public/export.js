/* export.js — Excel workbook export */
function initExport(){
  $('export-btn').addEventListener('click',doExport);
}

function doExport(){
  if(typeof XLSX==='undefined'){showToast('XLSX library not loaded','error');return;}
  const wb=XLSX.utils.book_new();
  const s=calcStats();

  // Summary
  const sum=[
    ['Finance Tracker — Financial Summary',''],
    ['Generated',new Date().toLocaleString('en-IN')],['',''],
    ['Metric','Value'],
    ['Total Borrowed',s.borrowed],['Total Paid',s.paid],
    ['Remaining',s.remaining],['Extra/Interest',s.extra],
    ['Active EMI Accounts',s.activeEmi],['Monthly Expenses',s.monthlyExp],
    ['Pending Payments',s.pending],['Cleared This Month',s.cleared],
  ];
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(sum),'Summary');

  // EMI Accounts
  const emiData=[['Account','Amount Taken','EMI #','Date','EMI Amount','Status']];
  state.emiAccounts.forEach(acc=>acc.emiItems.forEach((item,i)=>{
    emiData.push([acc.appName,i===0?acc.amountTaken:'',item.index,item.date,item.amount,item.paid?'Paid':'Pending']);
  }));
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(emiData),'EMI Accounts');

  // Expenses
  const expData=[['Name','Amount','Due Date','Type','Status']];
  state.expenses.forEach(e=>expData.push([e.name,e.amount,e.dueDate,e.type,e.paid?'Paid':'Pending']));
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(expData),'Expenses');

  // Archive
  const archData=[['Month','Item','Date','Amount','Status']];
  state.archives.forEach(a=>[...a.emiEntries,...a.expEntries].forEach(e=>{
    archData.push([a.label,e.name+(e.emiNum?' EMI#'+e.emiNum:''),e.date,e.amount,e.paid?'Paid':'Pending']);
  }));
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(archData),'Archive');

  XLSX.writeFile(wb,'Finance_Tracker_Export.xlsx');
  showToast('Excel exported successfully 📊','success');
}
