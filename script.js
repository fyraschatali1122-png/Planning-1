// URL CSV definiert in config.js
// const CSV_URL = "https://docs.google.com/.../output=csv";

// Falls Wunsch-Backend aktiv:
const WEBAPP_URL = "https://script.google.com/macros/s/AKfycbzjLpFTbPsrye8ZbxS0Wiqgyusw9FWYcVk3hM6buVBnuTMsBR36pTfyXurRFUK1I0iK2w/exec"; // <- später hier dein Apps Script /exec Link

let allData = [];

function status(msg) {
  console.log(msg);
}

function loadData() {
  if (!CSV_URL) {
    status("CSV_URL nicht definiert.");
    return;
  }
  Papa.parse(CSV_URL, {
    download: true,
    header: true,
    complete: function(results) {
      allData = results.data.filter(r => r.Date);
      renderList(allData);
      renderCalendar(allData);
    },
    error: function(err) {
      status("Fehler CSV: " + err);
    }
  });
}

function renderList(list) {
  const tbody = document.getElementById("tableBody");
  tbody.innerHTML = "";
  list.forEach(row => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.Date}</td>
      <td>${row.Start}</td>
      <td>${row.End}</td>
      <td>${row.Name}</td>
      <td>${row.Code}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderCalendar(list) {
  const events = list.map(r => ({
    title: r.Name + " (" + r.Code + ")",
    start: r.Date + (r.Start ? "T" + r.Start : ""),
    end: r.Date + (r.End ? "T" + r.End : "")
  }));
  const calendarEl = document.getElementById("calendar");
  const calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: "dayGridMonth",
    locale: "de",
    events: events
  });
  calendar.render();
}

// Filter
document.getElementById("searchName").addEventListener("input", applyFilters);
document.getElementById("searchCode").addEventListener("change", applyFilters);

function applyFilters() {
  const name = document.getElementById("searchName").value.toLowerCase();
  const code = document.getElementById("searchCode").value;
  const filtered = allData.filter(r =>
    (!name || r.Name.toLowerCase().includes(name)) &&
    (!code || r.Code === code)
  );
  renderList(filtered);
  renderCalendar(filtered);
}

// Toggle
document.getElementById("btnList").addEventListener("click", () => {
  document.getElementById("listView").style.display = "";
  document.getElementById("calendarView").style.display = "none";
});
document.getElementById("btnCalendar").addEventListener("click", () => {
  document.getElementById("listView").style.display = "none";
  document.getElementById("calendarView").style.display = "";
});

// Wünsche
document.getElementById("wunschForm").addEventListener("submit", async e => {
  e.preventDefault();
  if (!WEBAPP_URL) {
    alert("Kein Backend verbunden.");
    return;
  }
  const req = {
    action: "create",
    name: document.getElementById("reqName").value,
    date: document.getElementById("reqDate").value,
    note: document.getElementById("reqNote").value
  };
  const res = await fetch(WEBAPP_URL, {
    method: "POST",
    body: JSON.stringify(req),
    headers: { "Content-Type": "application/json" }
  });
  const data = await res.json();
  alert("Gesendet: " + JSON.stringify(data));
  loadRequests();
});

async function loadRequests() {
  if (!WEBAPP_URL) return;
  const res = await fetch(WEBAPP_URL + "?action=requests");
  const data = await res.json();
  const list = document.getElementById("requestList");
  list.innerHTML = "";
  if (data.items) {
    data.items.forEach(r => {
      const li = document.createElement("li");
      li.textContent = `${r.date} – ${r.name} (${r.note})`;
      list.appendChild(li);
    });
  }
}

// Init
loadData();
loadRequests();
