// ====== Utilitaires ======
const $ = (sel) => document.querySelector(sel);

function parseCSV(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(Boolean);
  if (!lines.length) return [];
  const header = splitCsvLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = splitCsvLine(lines[i]);
    if (!parts.length) continue;
    const obj = {};
    header.forEach((h, idx) => obj[h.trim()] = (parts[idx] ?? "").trim());
    rows.push(obj);
  }
  return rows;
}
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

function toDateISO(d) {
  const dt = new Date(d);
  if (isNaN(dt)) return null;
  return dt;
}
function combineDateTime(dateStr, timeStr) {
  const d = toDateISO(dateStr);
  if (!d) return null;
  const [hh, mm] = (timeStr || "").split(":").map(x => parseInt(x,10));
  if (Number.isInteger(hh) && Number.isInteger(mm)) {
    d.setHours(hh, mm, 0, 0);
  }
  return d;
}
function fmt(d, opts) {
  if (!d) return "";
  try {
    return new Intl.DateTimeFormat('de-DE', opts || {}).format(d);
  } catch {
    return d.toLocaleString();
  }
}
// ====== État ======
let ALL = []; // {date, start, end, name, code, schicht, startDt, endDt}

// ====== Chargement ======
async function loadData() {
  if (!CSV_URL || CSV_URL.startsWith("REMPLACE_MOI")) {
    alert("⚠️ Configure d'abord CSV_URL dans config.js (lien CSV Google Sheet publié).");
    return;
  }
  const res = await fetch(CSV_URL, { cache: "no-store" });
  const text = await res.text();
  const rows = parseCSV(text);

  const mapKey = (obj, key) => {
    const k = Object.keys(obj).find(k => k.toLowerCase() === key.toLowerCase());
    return k ? obj[k] : "";
  };

  ALL = rows.map(r => {
    const date = mapKey(r, "Date");
    const start = mapKey(r, "Start");
    const end = mapKey(r, "End");
    const name = mapKey(r, "Name");
    const code = mapKey(r, "Code");
    const schicht = mapCode(code);
    const startDt = combineDateTime(date, start);
    const endDt = combineDateTime(date, end);
    return { date, start, end, name, code, schicht, startDt, endDt };
  }).filter(x => x.name && x.date);

  render(ALL);
  refreshTeamListForSelectedDate();
}

function render(list) {
  const tb = document.querySelector("#tbody");
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
      tdDate.textContent = fmt(row.startDt || toDateISO(row.date), { year: 'numeric', month: '2-digit', day:'2-digit' }) || row.date;
      tdStart.textContent = row.start || (row.startDt ? fmt(row.startDt,{hour:'2-digit',minute:'2-digit'}) : "");
      tdEnd.textContent = row.end || (row.endDt ? fmt(row.endDt,{hour:'2-digit',minute:'2-digit'}) : "");
      tdName.textContent = row.name;
      tdSchicht.textContent = row.schicht || mapCode(row.code);
      tr.append(tdDate, tdStart, tdEnd, tdName, tdSchicht);
      frag.appendChild(tr);
    });
  tb.appendChild(frag);
}

function applyFilters() {
  const qName = document.querySelector("#qName").value.trim().toLowerCase();
  const qType = document.querySelector("#qType").value;
  const qDateVal = document.querySelector("#qDate").value;

  let list = ALL;
  if (qName) list = list.filter(r => (r.name||"").toLowerCase().includes(qName));
  if (qType) list = list.filter(r => r.schicht === qType);
  if (qDateVal) {
    const d = new Date(qDateVal);
    list = list.filter(r => r.startDt && sameDay(r.startDt, d));
  }
  render(list);
  refreshTeamListForSelectedDate();
}

function sameDay(a, b) {
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}

function refreshTeamListForSelectedDate() {
  const ul = document.querySelector("#teamList");
  ul.innerHTML = "";
  const qDateVal = document.querySelector("#qDate").value;
  if (!qDateVal) {
    const li = document.createElement("li");
    li.textContent = "Choisis un jour pour voir l'équipe.";
    ul.appendChild(li);
    return;
  }
  const d = new Date(qDateVal);
  const dayRows = ALL.filter(r => r.startDt && sameDay(r.startDt, d));
  if (!dayRows.length) {
    const li = document.createElement("li");
    li.textContent = "Aucune garde ce jour.";
    ul.appendChild(li);
    return;
  }
  const byType = groupBy(dayRows, r => r.schicht || mapCode(r.code) || "—");
  Object.keys(byType).sort().forEach(k => {
    const names = [...new Set(byType[k].map(x => x.name))].sort().join(", ");
    const li = document.createElement("li");
    li.textContent = `${k}: ${names}`;
    ul.appendChild(li);
  });
}
function groupBy(arr, fn) {
  return arr.reduce((acc, x) => {
    const k = fn(x);
    (acc[k] ||= []).push(x);
    return acc;
  }, {});
}

// ====== Événements UI ======
document.querySelector("#btnFilter").addEventListener("click", applyFilters);
document.querySelector("#btnReset").addEventListener("click", () => {
  document.querySelector("#qName").value = "";
  document.querySelector("#qType").value = "";
  document.querySelector("#qDate").value = "";
  render(ALL);
  refreshTeamListForSelectedDate();
});
document.querySelector("#qDate").addEventListener("change", refreshTeamListForSelectedDate);

// Auto-Load
loadData().catch(err => {
  console.error(err);
  alert("Erreur de chargement CSV. Vérifie l'URL dans config.js");
});
