// ====== Helfer ======
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
function defaultTimesForCode(code) {
  const c = (code || "").toUpperCase();
  if (c === "EF" || c === "FN") return { start: "06:00", end: "14:00" }; // Früh
  if (c === "ES" || c === "SN") return { start: "14:00", end: "22:00" }; // Spät
  if (c === "K2N" || c === "AK2" || c === "AKN") return { start: "22:00", end: "06:00" }; // Nacht
  if (c === "U" || c === "O" || c === "AV") return { start: "", end: "" }; // Urlaub/Frei
  return { start: "", end: "" };
}

function colorForSchicht(s) {
  switch (s) {
    case "Frühschicht":  return "#36d17a";
    case "Spätschicht":  return "#ff9f3a";
    case "Nachtschicht": return "#9b6dff";
    case "Urlaub":       return "#5bb4ff";
    case "Frei":         return "#c3c8d4";
    default:             return "#5b9fff";
  }
}

let calendar; // instance FullCalendar

function buildCalendarEvents(data) {
  const events = [];
  data.forEach(row => {
    const sch = row.schicht || mapCode(row.code) || "";
    const { start: defS, end: defE } = defaultTimesForCode(row.code);
    const startStr = (row.start && row.start.trim()) || defS;
    const endStr   = (row.end && row.end.trim())   || defE;
    const dateISO = row.date;

    if (!startStr || !endStr) {
      events.push({ title: `${row.name} (${row.code})`, start: dateISO, allDay: true, color: colorForSchicht(sch) });
      return;
    }
    const sDate = new Date(`${dateISO}T${startStr}`);
    let eDate = new Date(`${dateISO}T${endStr}`);
    if (eDate <= sDate) eDate = new Date(eDate.getTime() + 24 * 3600 * 1000); // nuit -> lendemain

    events.push({
      title: `${row.name} (${row.code})`,
      start: sDate.toISOString(),
      end: eDate.toISOString(),
      color: colorForSchicht(sch)
    });
  });
  return events;
}

function renderCalendar(data) {
  const events = buildCalendarEvents(data);
  const el = document.getElementById('calendar');
  if (!el) return;

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
function defaultTimesForCode(code) {
  const c = (code || "").toUpperCase();
  if (c === "EF" || c === "FN") return { start: "06:00", end: "14:00" }; // Früh
  if (c === "ES" || c === "SN") return { start: "14:00", end: "22:00" }; // Spät
  if (c === "K2N" || c === "AK2" || c === "AKN") return { start: "22:00", end: "06:00" }; // Nacht

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
// ====== Zustand ======
let ALL = []; // {date, start, end, name, code, schicht, startDt, endDt}

// ====== Laden ======
async function loadData() {
  if (!CSV_URL || CSV_URL.startsWith("REMPLACE_MOI")) {
    alert("⚠️ Bitte zuerst CSV_URL in config.js eintragen (Google Sheet → Veröffentlichen als CSV).");
    return;
  }
  const res = await fetch(CSV_URL, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`CSV laden fehlgeschlagen (HTTP ${res.status})`);
  }
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
function iconForSchicht(s) {
  switch (s) {
    case "Frühschicht":  return "🌅";
    case "Spätschicht":  return "🌇";
    case "Nachtschicht": return "🌙";
    case "Urlaub":       return "🏖️";
    case "Frei":         return "⏸️";
    default:             return "🗓️";
  }
}

function classForSchicht(s) {
  switch (s) {
    case "Frühschicht":  return "badge--frueh";
    case "Spätschicht":  return "badge--spaet";
    case "Nachtschicht": return "badge--nacht";
    case "Urlaub":       return "badge--urlaub";
    case "Frei":         return "badge--frei";
    default:             return "";
  }
}
function render(list) {
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
      tdDate.textContent = fmt(row.startDt || toDateISO(row.date), { year: 'numeric', month: '2-digit', day:'2-digit' }) || row.date;
      tdStart.textContent = row.start || (row.startDt ? fmt(row.startDt,{hour:'2-digit',minute:'2-digit'}) : "");
      tdEnd.textContent = row.end || (row.endDt ? fmt(row.endDt,{hour:'2-digit',minute:'2-digit'}) : "");
      tdName.textContent = row.name;
      const sch = row.schicht || mapCode(row.code) || "";
const badgeCls = classForSchicht(sch);
const emoji = iconForSchicht(sch);
tdSchicht.innerHTML = sch
  ? `<span class="badge ${badgeCls}"><span class="dot"></span>${emoji} ${sch}</span>`
  : "";
      tr.append(tdDate, tdStart, tdEnd, tdName, tdSchicht);
      frag.appendChild(tr);
    });
  tb.appendChild(frag);
}

function applyFilters() {
  const qName = $("#qName").value.trim().toLowerCase();
  const qType = $("#qType").value;
  const qDateVal = $("#qDate").value; // yyyy-mm-dd

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
  const dayRows = ALL.filter(r => r.startDt && sameDay(r.startDt, d));
  if (!dayRows.length) {
    const li = document.createElement("li");
    li.textContent = "Keine Dienste an diesem Tag.";
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

// ====== UI-Events ======
$("#btnFilter").addEventListener("click", applyFilters);
$("#btnReset").addEventListener("click", () => {
  $("#qName").value = "";
  $("#qType").value = "";
  $("#qDate").value = "";
  render(ALL);
  refreshTeamListForSelectedDate();
});
$("#qDate").addEventListener("change", refreshTeamListForSelectedDate);

// Auto-Load
loadData().catch(err => {
  console.error(err);
  alert("Fehler beim Laden der CSV. Bitte URL in config.js prüfen.");
});
