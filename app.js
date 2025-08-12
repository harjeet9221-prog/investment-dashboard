let portfolio = [
  { name: "Vanguard All-World", code:"IE00BK5BQT80", value:1680, target:60 },
  { name: "MSCI Emerging", code:"IE00B4L5YC18", value:240, target:15 },
  { name: "Global Bond", code:"IE00B3F81R35", value:240, target:15 },
  { name: "Euro Infl. Linked", code:"IE00B0M63177", value:120, target:5 },
  { name: "Gold", code:"IE00B4ND3602", value:120, target:5 }
];
let history = [];

function simulatePAC() {
  let pac = parseFloat(document.getElementById("inpAmount").value);
  let anni = parseInt(document.getElementById("inpYears").value);
  let rendimento = parseFloat(document.getElementById("inpReturn").value) / 100;
  let vol = parseFloat(document.getElementById("inpVol").value) / 100;
  let taxRate = parseFloat(document.getElementById("inpTax").value) / 100;
  let rebPct = parseFloat(document.getElementById("inpReb").value);
  document.querySelectorAll('.alloc-input').forEach((inp,idx)=>portfolio[idx].target=parseFloat(inp.value));

  let months = anni*12, val=0, storico=[], totals=[];
  let currAlloc = portfolio.map(a=>a.target/100);
  let values = Array(currAlloc.length).fill(0);
  let rebAlert = false;

  for(let m=1; m<=months; m++) {
    for(let i=0; i<values.length; i++) values[i] += pac * currAlloc[i];
    let percRend = rendimento/12 + (vol/Math.sqrt(12))*randn_bm();
    for(let i=0; i<values.length; i++) values[i] *= (1+percRend);

    // Ribilanciamento se uno scostamento supera soglia
    let tot=values.reduce((a,b)=>a+b,0);
    let allocNow = values.map(v=>v/tot*100);
    let alert=false;
    for(let i=0;i<allocNow.length;i++)
      if(Math.abs(allocNow[i]-portfolio[i].target)>rebPct) alert=true;
    if(alert) { // Simulazione rebalance: riporta asset ai target
      let newVal = tot;
      values = portfolio.map(a=>newVal*(a.target/100));
      rebAlert = true;
    }

    let time=(new Date(2000,0,1)).setMonth(m);
    storico.push({ date:(new Date(time)).toISOString().slice(0,10), total:tot });
    totals.push(tot);
  }

  // Statistiche
  let profit = totals[totals.length-1] - pac*months; let tax = profit*taxRate;
  let valNet=totals[totals.length-1]-tax;
  let cagr = ((valNet/(pac*months)) ** (1/anni)-1)*100;
  let returns = [];
  for(let i=1;i<totals.length;i++) returns.push((totals[i]/totals[i-1])-1);
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
      <b>Valore finale netto:</b> €${valNet.toLocaleString(undefined,{maximumFractionDigits:0})}
     </div>`;
  document.getElementById("taxSummary").innerHTML = 
    `Investito: <b>€${(pac*months).toLocaleString()}</b> &middot; Plusvalenza: <b>€${profit.toLocaleString(undefined,{maximumFractionDigits:0})}</b><br>
    Tasse stimate: <b style="color:#d32f2f">€${tax.toLocaleString(undefined,{maximumFractionDigits:0})}</b><br>
    Netto finale: <b style="color:#2e7d32">€${valNet.toLocaleString(undefined,{maximumFractionDigits:0})}</b>`;

  document.getElementById("rebalanceAlert").innerHTML =
    rebAlert? `<div class="rebalance-alert">⚠️ Ribilanciamento effettuato secondo la soglia definita (${rebPct}%)</div>`:"";
}

// Monte Carlo: istogramma delle proiezioni future
function monteCarloPAC(pac, rate, vol, anni, trials, taxRate, investito) {
  let M=anni*12, results=[];
  for(let t=0;t<trials;t++) {
    let val=0;
    for(let m=0;m<M;m++) {
      let percRend=rate/12+(vol/Math.sqrt(12))*randn_bm();
      val=val*(1+percRend)+pac;
    }
    let profit = Math.max(0,val-investito);
    let taxes = profit*taxRate;
    results.push(val-taxes);
  }
  results.sort((a,b)=>a-b);
  let counts = Array(10).fill(0), min=results[0], max=results[results.length-1], range=max-min;
  results.forEach(r=>{
    let bin=Math.min(9,Math.floor((r-min)/range*10));
    counts[bin]++;
  });
  let labels=[];
  for(let i=0;i<10;i++) labels.push(`€${Math.round(min+i*range/10).toLocaleString()}`);
  drawBarChart("mcChart", labels, counts, true);
}

// -- Metrics helpers --
function randn_bm() {var u=0,v=0;while(u===0)u=Math.random();while(v===0)v=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
function calcMaxDrawdown(arr) {let peak=arr[0],maxdd=0;for(let v of arr){if(v>peak)peak=v;let dd=(peak-v)/peak;if(dd>maxdd)maxdd=dd;}return maxdd*100;}

// -- Chart dinamici --
let _charts={};
function drawLineChart(id, labels, data, label, fill) {
  if(_charts[id]) _charts[id].destroy();
  _charts[id]=new Chart(document.getElementById(id), {
    type:'line', data:{labels,datasets:[{label,data,fill:!!fill,borderColor:"#007aff",backgroundColor:"#b2dafe55"}]},
    options:{animation:{duration:1200}, responsive:true, plugins:{legend:{display:true}}}
  });
}
function drawPieChart(id, labels, data, highlight) {
  if(_charts[id]) _charts[id].destroy();
  let bg=["#2ecc71","#3498db","#e67e22","#f1c40f","#9b59b6"].map((c,i)=>highlight&&data[i]>0?c:"#bbb");
  _charts[id]=new Chart(document.getElementById(id),{type:'pie',data:{labels,datasets:[{data,backgroundColor:bg}]},options:{animation:{duration:900},responsive:true,plugins:{legend:{position:'bottom'}}}});
}
function drawBarChart(id, labels, data, anim) {
  if(_charts[id]) _charts[id].destroy();
  _charts[id]=new Chart(document.getElementById(id),{type:'bar',data:{labels,datasets:[{label:"Frequenza casi",data,backgroundColor:["#B71C1C","#F9A825","#2E7D32","#0277BD","#8E24AA","#424242","#AB47BC","#FBC02D","#FF7043","#00B8D4"]}]},options:{animation:{duration:anim?1200:0},responsive:true}});
}

// -- Tabella allocazione customizzata e highlight rebalance
function renderPortfolio() {
  let total=portfolio.reduce((s,a)=>s+a.value,0);
  let html = `<table><tr><th>Asset</th><th>Codice</th><th>Valore</th><th>Alloc.%</th></tr>`;
  portfolio.forEach((a,idx) => {
    let perc=((a.value/total)*100).toFixed(2);
    html+=`<tr${Math.abs(perc-a.target)>parseFloat(document.getElementById("inpReb").value)?' style="background:#ffe0e0"':''}>
      <td>${a.name}</td>
      <td>${a.code}</td>
      <td><input type="number" value="${a.value}" onchange="updateValue(${idx},this.value)"/></td>
      <td><input class="alloc-input" type="number" min="0" max="100" value="${a.target}" style="width:50px">%</td>
    </tr>`;
  });
  html+=`</table>`;
  document.getElementById("portfolio").innerHTML=html;
}
function updateValue(index,v) { portfolio[index].value=parseFloat(v);renderPortfolio();}

// -- Snapshot storico ed export
function saveSnapshot() {
  let total=portfolio.reduce((s,a)=>s+a.value,0);
  let today=new Date().toISOString().slice(0,10);
  history.push({ date: today, total });
  drawLineChart("historyChart", history.map(x=>x.date), history.map(x=>x.total), "Totale €", 1);
}
function exportCSV() {
  let csv = "data:text/csv;charset=utf-8,Data,Totale\n";
  history.forEach(row=>csv+=`${row.date},${row.total}\n`);
  let enc = encodeURI(csv); let link = document.createElement('a'); link.setAttribute('href', enc); link.setAttribute('download', 'storico.csv'); document.body.appendChild(link); link.click(); document.body.removeChild(link);
}

// -- Start --
window.onload=()=>{renderPortfolio();simulatePAC();}
