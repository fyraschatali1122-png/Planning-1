/*********** CONFIG ***********/
const WEBAPP_URL = "https://script.google.com/macros/s/AKfycbwDf-FXWlnztoK6DlXLKljOilQsRNVQSC-lnp7WGl5VUFOLsOK98wxNS5ufP_0_XjGp/exec"; // <- remplace par l’URL de ta Web App

/*********** HELPERS **********/
const $ = (sel) => document.querySelector(sel);

function mapCode(code) {
  if (!code) return "";
  const c = (code || "").toUpperCase().trim();
  if (c === "ES" || c === "SN") return "Spätschicht";
  if (c === "EF" || c === "FN") return "Frühschicht";
  if (c === "K2N" || c === "AK2" || c === "AKN") return "Nachtschicht";
  if (c === "U" || c === "O") return "Urlaub";
  if (c === "AV") return "Frei";
  return c;
}
function padTime(t){
  if (!t) return "";
  const parts = String(t).split(":").map(s => s.trim());
  if (!parts[0]) return "";
  const hh = parts[0].padStart(2,"0");
  const mm = (parts[1] ? parts[1].padStart(2,"0") : "00");
  return `${hh}:${mm}`;
}
function sameDay(a, b) {
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}
function badgeClass(s) {
  switch (s) {
    case "Frühschicht":  return "badge badge--frueh";
    case "Spätschicht":  return "badge badge--spaet";
    case "Nachtschicht": return "badge badge--nacht";
    case "Urlaub":       return "badge badge--urlaub";
    case "Frei":         return "badge badge--frei";
    default:             return "badge";
  }
}

/*********** STATE ************/
let ALL = [];     // lignes du CSV {date,start,end,name,code,schicht,startDt,endDt}
let calendar = null;

/*********** CSV LOAD *********/
async function loadData(){
  if (!CSV_URL || CSV_URL.includes("REMPLACE_MOI")) {
    alert("⚠️ Bitte zuerst CSV_URL in config.js eintragen (Google Sheet → Veröffentlichen als CSV).");
    return;
  }
  const res = await fetch(CSV_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`CSV laden fehlgeschlagen (HTTP ${res.status})`);
  const text = await res.text();

  // Parse simple CSV (virgule) – Google publie en virgule
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(l => l.trim().length>0);
  const header = splitCsvLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = splitCsvLine(lines[i]);
    const obj = {};
    header.forEach((h, idx) => obj[h.trim()] = (parts[idx] ?? "").trim());
    rows.push(obj);
  }

  const getKey = (obj, wanted) => {
    const w = wanted.toLowerCase().trim();
    const k = Object.keys(obj).find(x => x && x.toLowerCase().trim() === w);
    return k ?? null;
  };

  ALL = rows.map(r=>{
    const kDate  = getKey(r,"Date")  || getKey(r,"Datum");
    const kStart = getKey(r,"Start") || getKey(r,"Beginn");
    const kEnd   = getKey(r,"End")   || getKey(r,"Ende");
    const kName  = getKey(r,"Name");
    const kCode  = getKey(r,"Code");

    const date  = kDate  ? String(r[kDate]).trim()  : "";
    const start = kStart ? padTime(String(r[kStart]).trim()) : "";
    const end   = kEnd   ? padTime(String(r[kEnd]).trim())   : "";
    const name  = kName  ? String(r[kName]).trim()  : "";
    const code  = kCode  ? String(r[kCode]).trim()  : "";

    const schicht = mapCode(code);
    const startDt = start ? new Date(`${date}T${start}`) : null;
    let   endDt   = end   ? new Date(`${date}T${end}`)   : null;
    if (startDt && endDt && endDt <= startDt) endDt = new Date(endDt.getTime() + 24*3600*1000);

    return { date, start, end, name, code, schicht, startDt, endDt };
  }).filter(x => x.name && x.date);

  renderList(ALL);
  refreshTeamListForSelectedDate();
}

/* Mini CSV splitter qui respecte les guillemets */
function splitCsvLine(line) {
  const out = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQ = !inQ;
    else if (ch === ',' && !inQ) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map(s => s.replace(/^"(.*)"$/, '$1'));
}

/*********** LIST RENDER *********/
function renderList(list){
  const tb = $("#tbody");
  tb.innerHTML = "";
  const frag = document.createDocumentFragment();
  list
    .slice()
    .sort((a,b)=> (a.startDt?.getTime()||0) - (b.startDt?.getTime()||0) || a.name.localeCompare(b.name))
    .forEach(row => {
      const tr = document.createElement("tr");
      const tdDate = document.createElement("td");
      const tdStart = document.createElement("td");
      const tdEnd = document.createElement("td");
      const tdName = document.createElement("td");
      const tdSchicht = document.createElement("td");
      tdDate.textContent = row.date;
      tdStart.textContent = row.start || "";
      tdEnd.textContent = row.end || "";
      tdName.textContent = row.name;
      tdSchicht.innerHTML = `<span class="${badgeClass(row.schicht)}"><span class="dot"></span>${row.schicht||""}</span>`;
      tr.append(tdDate, tdStart, tdEnd, tdName, tdSchicht);
      frag.appendChild(tr);
    });
  tb.appendChild(frag);
}

/*********** CALENDAR **********/
function buildCalendarEvents(data){
  const events = [];
  data.forEach(r => {
    const title = `${r.name} (${r.code})`;
    if (!r.startDt) {
      events.push({ title, start: r.date, allDay: true });
      return;
    }
    const evt = { title, start: r.startDt.toISOString() };
    if (r.endDt && !isNaN(r.endDt)) evt.end = r.endDt.toISOString();
    events.push(evt);
  });
  return events;
}
function renderCalendar(data){
  const el = document.getElementById('calendar');
  if (!el) return;
  const events = buildCalendarEvents(data);
  if (calendar) {
    calendar.removeAllEvents();
    calendar.addEventSource(events);
    calendar.render();
    return;
  }
  calendar = new FullCalendar.Calendar(el, {
    initialView: 'dayGridMonth',
    locale: 'de',
    firstDay: 1,
    headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' },
    events
  });
  calendar.render();
}

/*********** FILTERS **********/
function applyFilters() {
  const qName = $("#qName").value.trim().toLowerCase();
  const qType = $("#qType").value;
  const qDateVal = $("#qDate").value;

  let list = ALL;
  if (qName) list = list.filter(r => (r.name||"").toLowerCase().includes(qName));
  if (qType) list = list.filter(r => r.schicht === qType);
  if (qDateVal) {
    const d = new Date(qDateVal);
    list = list.filter(r => r.startDt ? sameDay(r.startDt, d) : (r.date === qDateVal));
  }
  renderList(list);
  refreshTeamListForSelectedDate();
  if (document.getElementById("calendarSection").style.display !== "none") {
    renderCalendar(list);
  }
}
function refreshTeamListForSelectedDate() {
  const ul = $("#teamList");
  ul.innerHTML = "";
  const qDateVal = $("#qDate").value;
  if (!qDateVal) {
    const li = document.createElement("li");
    li.textContent = "Wähle ein Datum, um das Team zu sehen.";
    ul.appendChild(li);
    return;
  }
  const d = new Date(qDateVal);
  const dayRows = ALL.filter(r => r.startDt ? sameDay(r.startDt, d) : (r.date===qDateVal));
  if (!dayRows.length) {
    const li = document.createElement("li");
    li.textContent = "Keine Dienste an diesem Tag.";
    ul.appendChild(li);
    return;
  }
  const byType = dayRows.reduce((acc, r) => {
    const k = r.schicht || "-";
    (acc[k] ||= []).push(r.name);
    return acc;
  }, {});
  Object.keys(byType).sort().forEach(k => {
    const names = [...new Set(byType[k])].sort().join(", ");
    const li = document.createElement("li");
    li.textContent = `${k}: ${names}`;
    ul.appendChild(li);
  });
}

/*********** WUNSCH (Requests) **********/
async function loadRequests(){
  if (!WEBAPP_URL || WEBAPP_URL.includes("TON_ID")) return; // éviter erreur si pas encore déployé
  try{
    const r = await fetch(`${WEBAPP_URL}?action=requests`, { cache:"no-store" });
    const data = await r.json();
    if (!data.ok) throw new Error(data.error || "Fehler");
    const ul = document.getElementById("wList");
    ul.innerHTML = "";
    data.items.forEach(it => {
      const li = document.createElement("li");
      li.innerHTML = `<strong>${it.date}</strong> – ${it.name} ${it.note ? `<em>(${it.note})</em>` : ""}
        <button data-id="${it.id}" class="btn-accept">Akzeptieren</button>`;
      ul.appendChild(li);
    });
    ul.querySelectorAll(".btn-accept").forEach(btn => {
      btn.addEventListener("click", async () => {
        const accepter = prompt("Dein Name, um zu akzeptieren:");
        if (!accepter) return;
        const resp = await fetch(WEBAPP_URL, {
          method:"POST",
          headers:{ "Content-Type":"application/json" },
          body: JSON.stringify({ action:"accept", request_id: btn.dataset.id, accepter_name: accepter })
        }).then(r=>r.json());
        if (!resp.ok) { alert("Fehler: " + (resp.error||"")); return; }
        alert("Übernommen! Plan wird aktualisiert.");
        await loadRequests();
        await loadData(); // recharge le planning
      });
    });
  }catch(e){
    console.error(e);
  }
}

async function createRequest(){
  if (!WEBAPP_URL || WEBAPP_URL.includes("TON_ID")) { alert("Backend (Web App) noch nicht konfiguriert."); return; }
  const name = document.getElementById("wName").value.trim();
  const date = document.getElementById("wDate").value;
  const note = document.getElementById("wNote").value.trim();
  if (!name || !date) { alert("Name und Datum sind erforderlich."); return; }
  const resp = await fetch(WEBAPP_URL, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ action:"create", name, date, note })
  }).then(r=>r.json());
  if (!resp.ok) { alert("Fehler: " + (resp.error||"")); return; }
  document.getElementById("wName").value = "";
  document.getElementById("wDate").value = "";
  document.getElementById("wNote").value = "";
  await loadRequests();
}

/*********** UI BINDINGS **********/
$("#btnFilter").addEventListener("click", applyFilters);
$("#btnReset").addEventListener("click", () => {
  $("#qName").value = ""; $("#qType").value = ""; $("#qDate").value = "";
  renderList(ALL); refreshTeamListForSelectedDate();
  if (document.getElementById("calendarSection").style.display !== "none") renderCalendar(ALL);
});
$("#qDate").addEventListener("change", refreshTeamListForSelectedDate);

document.getElementById('btnShowCal').addEventListener('click', () => {
  document.getElementById('calendarSection').style.display = '';
  document.getElementById('listSection').style.display = 'none';
  renderCalendar(ALL);
});
document.getElementById('btnShowList').addEventListener('click', () => {
  document.getElementById('calendarSection').style.display = 'none';
  document.getElementById('listSection').style.display = '';
});

document.getElementById('wSend').addEventListener('click', createRequest);

/*********** START **********/
loadData().catch(err => {
  console.error(err);
  alert("Fehler beim Laden der CSV. Bitte URL in config.js prüfen.");
});
loadRequests();
