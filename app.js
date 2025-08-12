let portfolio = [
  { name: "Vanguard All-World", code:"IE00BK5BQT80", value:1680, target:60 },
  { name: "MSCI Emerging", code:"IE00B4L5YC18", value:240, target:15 },
  { name: "Global Bond", code:"IE00B3F81R35", value:240, target:15 },
  { name: "Euro Infl. Linked", code:"IE00B0M63177", value:120, target:5 },
  { name: "Gold", code:"IE00B4ND3602", value:120, target:5 }
];
let history = [];

// -- Salvataggio anche tramite localStorage come backup extra --
function manualSave() {
  try {
    localStorage.setItem("portfolio_permanent", JSON.stringify(portfolio));
    localStorage.setItem("history_permanent", JSON.stringify(history));
    savePortfolio();
    notif("Portafoglio e storico salvati! Riaprendo la pagina saranno recuperati.");
  } catch(e) { notif("Errore salvataggio! Forse quota storage superata."); }
}

// --- IndexedDB persistente ---
let db;
let request = indexedDB.open("InvestDashDB", 1);
request.onupgradeneeded = e => {
  db = e.target.result;
  db.createObjectStore("portfolio", { keyPath: "code"});
  db.createObjectStore("history", { keyPath: "date"});
};
request.onsuccess = e => {
  db = e.target.result;
  loadPortfolio();
  loadHistory();
};
request.onerror = ()=> notif("IndexedDB inattivo: funzionamento limitato.");

// -- Portfolio / input generazione dinamica e smart highlight --
function renderPortfolio() {
  let total=portfolio.reduce((s,a)=>s+a.value,0);
  let rebPct = parseFloat(document.getElementById("inpReb").value);
  let html = `<div class='table-box'><table>
    <tr><th>Asset</th><th>Codice</th><th>Valore</th><th>Alloc.%</th></tr>`;
  portfolio.forEach((a,idx) => {
    let perc=((a.value/total)*100).toFixed(2);
    let needsReb = Math.abs(perc-a.target) > rebPct;
    html+=`<tr${needsReb?' style="background:#ffe0e0"':''}>
      <td>${a.name}</td>
      <td>${a.code}</td>
      <td><input type="number" value="${a.value}" onchange="updateValue(${idx},this.value)"/></td>
      <td><input class="alloc-input" type="number" min="0" max="100" value="${a.target}" style="width:50px">%</td>
    </tr>`;
  });
  html+=`</table></div>`;
  document.getElementById("portfolio").innerHTML=html;
}

// -- Aggiornamenti asset anche lato storage
function updateValue(index,v) { portfolio[index].value=parseFloat(v); savePortfolio(); renderPortfolio(); }
function savePortfolio() {
  if(!db)return;
  let tx = db.transaction("portfolio", "readwrite");
  let store = tx.objectStore("portfolio");
  portfolio.forEach(asset => { store.put(asset); });
}
function loadPortfolio() {
  if(!db)return;
  let tx = db.transaction("portfolio", "readonly");
  let store = tx.objectStore("portfolio");
  let req = store.getAll();
  req.onsuccess = ()=>{ if(req.result.length>0) portfolio=req.result; renderPortfolio();}
}

// -- Storico snapshot
function saveSnapshot() {
  let total=portfolio.reduce((s,a)=>s+a.value,0);
  let today=new Date().toISOString().slice(0,10);
  let snapshot={date:today,total};
  let tx=db.transaction("history","readwrite");
  let store=tx.objectStore("history");
  store.put(snapshot);
  history.push(snapshot);
  notif("Snapshot salvato! "+today);
  drawLineChart("historyChart", history.map(x=>x.date), history.map(x=>x.total), "Totale €", 1);
}
function loadHistory(){
  if(!db)return;
  let tx=db.transaction("history","readonly");
  let store=tx.objectStore("history");
  let req=store.getAll();
  req.onsuccess = ()=>{ if(req.result.length>0)history=req.result.sort((a,b)=> new Date(a.date)-new Date(b.date));drawLineChart("historyChart",history.map(x=>x.date),history.map(x=>x.total),"Totale €",1);}
}

// -- Simulazione PAC avanzata e ribilanciamento --
function simulatePAC() {
  let pac = parseFloat(document.getElementById("inpAmount").value);
  let anni = parseInt(document.getElementById("inpYears").value);
  let rendimento = parseFloat(document.getElementById("inpReturn").value) / 100;
  let vol = parseFloat(document.getElementById("inpVol").value) / 100;
  let taxRate = parseFloat(document.getElementById("inpTax").value) / 100;
  let rebPct = parseFloat(document.getElementById("inpReb").value);

  document.querySelectorAll('.alloc-input').forEach((inp,idx)=>portfolio[idx].target=parseFloat(inp.value));
  
  let months = anni*12, val=0, storico=[], totals=[], rebAlert=false;
  let currAlloc = portfolio.map(a=>a.target/100), values = Array(currAlloc.length).fill(0);
  for(let m=1; m<=months; m++) {
    for(let i=0; i<values.length; i++) values[i] += pac * currAlloc[i];
    let percRend = rendimento/12 + (vol/Math.sqrt(12))*randn_bm();
    for(let i=0; i<values.length; i++) values[i] *= (1+percRend);
    // Sim. rebalance: reset ai target
    let tot=values.reduce((a,b)=>a+b,0);
    let allocNow = values.map(v=>v/tot*100);
    let alert=false;
    for(let i=0;i<allocNow.length;i++)
      if(Math.abs(allocNow[i]-portfolio[i].target)>rebPct) alert=true;
    if(alert) { values = portfolio.map(a=>tot*(a.target/100)); rebAlert = true; }
    let time=(new Date(2000,0,1)).setMonth(m);
    storico.push({ date:(new Date(time)).toISOString().slice(0,10), total:tot });
    totals.push(tot);
  }
  // Statistiche
  let profit = totals[totals.length-1] - pac*months; let tax = profit*taxRate;
  let valNet=totals[totals.length-1]-tax;
  let cagr = ((valNet/(pac*months)) ** (1/anni)-1)*100;
  let returns = []; for(let i=1;i<totals.length;i++) returns.push((totals[i]/totals[i-1])-1);
  let stdAnn = Math.sqrt(returns.reduce((a,b)=>a+b**2,0)/returns.length)*Math.sqrt(12)*100;
  let maxDD = calcMaxDrawdown(totals);

  drawLineChart("historyChart", storico.map(x=>x.date), storico.map(x=>x.total), "Valore Portfolio €", true);
  let allocNow = values.map(v=>v/values.reduce((a,b)=>a+b,0)*100);
  drawPieChart("allocationChart", portfolio.map(a=>a.name), allocNow, rebAlert);

  monteCarloPAC(pac, rendimento, vol, anni, 500, taxRate, pac*months);

  document.getElementById("stats").innerHTML =
    `<div class="statsbox">
      <b>CAGR:</b> ${cagr.toLocaleString(undefined,{maximumFractionDigits:2})}%<br>
      <b>Max Drawdown:</b> ${maxDD.toLocaleString(undefined,{maximumFractionDigits:2})}%<br>
      <b>Volatilità annua:</b> ${stdAnn.toLocaleString(undefined,{maximumFractionDigits:2})}%<br>
      <b>Valore netto dopo tasse:</b> €${valNet.toLocaleString(undefined,{maximumFractionDigits:0})}
     </div>`;
  document.getElementById("taxSummary").innerHTML =
    `Investito: <b>€${(pac*months).toLocaleString()}</b> &middot; Plusvalenza: <b>€${profit.toLocaleString(undefined,{maximumFractionDigits:0})}</b><br>
    Tasse: <b style="color:#d32f2f">€${tax.toLocaleString(undefined,{maximumFractionDigits:0})}</b><br>
    Netto: <b style="color:#2e7d32">€${valNet.toLocaleString(undefined,{maximumFractionDigits:0})}</b>`;
  document.getElementById("rebalanceAlert").innerHTML =
    rebAlert? `<div class="rebalance-alert">⚠️ Ribilanciamento automatico effettuato (soglia ${rebPct}%)</div>`:"";
}

// --- Monte Carlo + chart con istogramma freq ---
function monteCarloPAC(pac, rate, vol, anni, trials, taxRate, investito) {
  let M=anni*12, results=[];
  for(let t=0;t<trials;t++) {
    let val=0; for(let m=0;m<M;m++) val=val*(1+rate/12+(vol/Math.sqrt(12))*randn_bm())+pac;
    let profit = Math.max(0,val-investito); let taxes = profit*taxRate;
    results.push(val-taxes);
  }
  results.sort((a,b)=>a-b);
  let counts = Array(10).fill(0), min=results[0], max=results[results.length-1], range=max-min;
  results.forEach(r=>{let bin=Math.min(9,Math.floor((r-min)/range*10));counts[bin]++;});
  let labels=[]; for(let i=0;i<10;i++) labels.push(`€${Math.round(min+i*range/10).toLocaleString()}`);
  drawBarChart("mcChart", labels, counts, true);
}

// -- Statistique helpers --
function randn_bm() {var u=0,v=0;while(u===0)u=Math.random();while(v===0)v=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
function calcMaxDrawdown(arr) {let peak=arr[0],maxdd=0;for(let v of arr){if(v>peak)peak=v;let dd=(peak-v)/peak;if(dd>maxdd)maxdd=dd;}return maxdd*100;}

// -- Animazione e chart.js
let _charts={};
function drawLineChart(id, labels, data, label, fill) {
  if(_charts[id])_charts[id].destroy();
  _charts[id]=new Chart(document.getElementById(id),{
    type:'line',data:{labels,datasets:[{label,data,fill:!!fill,borderColor:"#007aff",backgroundColor:"#b2dafe55", tension:.29, pointRadius:2}]},
    options:{animation:{duration:1200},responsive:true,plugins:{legend:{display:true}}}
  });
}
function drawPieChart(id, labels, data, highlight) {
  if(_charts[id])_charts[id].destroy();
  let bg=["#2ecc71","#3498db","#e67e22","#f1c40f","#9b59b6"].map((c,i)=>highlight&&data[i]>0?c:"#bbb");
  _charts[id]=new Chart(document.getElementById(id),{type:'pie',data:{labels,datasets:[{data,backgroundColor:bg}]},options:{animation:{duration:900},responsive:true,plugins:{legend:{position:'bottom'}}}});
}
function drawBarChart(id, labels, data, anim) {
  if(_charts[id])_charts[id].destroy();
  _charts[id]=new Chart(document.getElementById(id),{type:'bar',data:{labels,datasets:[{label:"Frequenza casi",data,backgroundColor:["#B71C1C","#F9A825","#2E7D32","#0277BD","#8E24AA","#424242","#AB47BC","#FBC02D","#FF7043","#00B8D4"]}]},options:{animation:{duration:anim?1200:0},responsive:true}});
}

// -- Notifiche fade-in
function notif(txt) {
  let d = document.createElement('div');
  d.className = "rebalance-alert";
  d.innerHTML = txt;
  document.body.appendChild(d);
  setTimeout(()=>{d.style.opacity=0.2;setTimeout(()=>{d.remove()},600)},2800);
}

// -- Restore all'avvio anche da localStorage se disponibile
window.onload = ()=>{
  if(localStorage.getItem("portfolio_permanent")) {
    try {
      portfolio = JSON.parse(localStorage.getItem("portfolio_permanent"));
      history = JSON.parse(localStorage.getItem("history_permanent")||"[]");
    } catch(e) {}
  }
  renderPortfolio(); simulatePAC();
}
