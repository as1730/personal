const KEY = "focus-tracker-v2";
const blank = { sessions: [], todos: [], theme: "light", settings: { focus: 25, break: 5, longBreak: 15, rounds: 4, auto: false, sound: true } };
let data = read();
let mode = "focus";
let remaining = data.settings.focus * 60;
let interval = null;
let audioContext = null;
const $ = (id) => document.getElementById(id);

function read() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    const merged = { ...blank, ...saved, settings: { ...blank.settings, ...saved.settings } };
    merged.todos.forEach(t => { if (!t.date) t.date = localKey(new Date()); });
    return merged;
  } catch { return structuredClone(blank); }
}
function save() { localStorage.setItem(KEY, JSON.stringify(data)); }
function localKey(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function mins(n) { const h = Math.floor(n / 60), m = n % 60; return h ? `${h}h ${m ? `${m}m` : ""}` : `${m}m`; }
function safe(v) { const s = document.createElement("span"); s.textContent = v; return s.innerHTML; }

function renderStats() {
  const logged = data.sessions.reduce((a, s) => a + s.minutes, 0);
  const days = [...new Set(data.sessions.map(s => localKey(new Date(s.at))))];
  let check = new Date(); check.setHours(0, 0, 0, 0);
  if (!days.includes(localKey(check))) check.setDate(check.getDate() - 1);
  let streak = 0;
  while (days.includes(localKey(check))) { streak++; check.setDate(check.getDate() - 1); }
  $("daysStudied").textContent = days.length;
  $("totalTime").textContent = mins(logged);
  $("streak").textContent = streak;
  $("activityTotal").textContent = `${mins(logged)} logged`;
  const today = localKey(new Date());
  $("sessionsToday").textContent = data.sessions.filter(s => localKey(new Date(s.at)) === today).length;
}

function renderHeatmap() {
  const grid = $("heatmap"), months = $("months");
  grid.innerHTML = ""; months.innerHTML = "";
  const lookup = {};
  data.sessions.forEach(s => { const day = localKey(new Date(s.at)); lookup[day] = (lookup[day] || 0) + s.minutes; });
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = new Date(today); start.setDate(today.getDate() - 370); start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  let lastMonth = -1;
  for (let i = 0; i < 371; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const n = lookup[localKey(d)] || 0;
    const level = n === 0 ? 0 : n < 30 ? 1 : n < 75 ? 2 : n < 150 ? 3 : 4;
    const cell = document.createElement("span"); cell.className = `cell level-${level}`; cell.title = `${d.toLocaleDateString()}: ${mins(n)}`; grid.append(cell);
    if (d.getDate() <= 7 && d.getMonth() !== lastMonth) {
      const label = document.createElement("span"); label.textContent = d.toLocaleDateString(undefined, { month: "short" }); label.style.left = `${Math.floor(i / 7) * 13.7}px`; months.append(label); lastMonth = d.getMonth();
    }
  }
}

function renderTodos() {
  const today = localKey(new Date());
  const todays = data.todos.filter(t => t.date === today);
  const list = $("todoList"), done = todays.filter(t => t.done).length;
  $("todoProgress").textContent = `${done} / ${todays.length}`;
  list.innerHTML = todays.map(t => `<li class="todo ${t.done ? "done" : ""}"><input type="checkbox" data-id="${t.id}" ${t.done ? "checked" : ""} aria-label="Complete task"><span>${safe(t.text)}</span><button class="delete" data-delete="${t.id}" aria-label="Delete task">×</button></li>`).join("");
}

function renderLog() {
  const today = localKey(new Date());
  const byDate = {};
  data.todos.forEach(t => { if (t.date === today) return; (byDate[t.date] ||= []).push(t); });
  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));
  const logList = $("logList");
  if (!dates.length) { logList.innerHTML = '<p class="log-empty">Nothing logged yet.</p>'; return; }
  logList.innerHTML = dates.map(d => {
    const items = byDate[d].map(t => `<li class="${t.done ? "done" : ""}">${safe(t.text)}</li>`).join("");
    const label = new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    return `<div class="log-day"><p class="log-date">${label}</p><ul class="log-todos">${items}</ul></div>`;
  }).join("");
}

function renderTimer() {
  const m = Math.floor(remaining / 60), s = remaining % 60;
  $("timer").textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  document.title = `${$("timer").textContent} · focus`;
}
function durationFor(currentMode) { return data.settings[currentMode] * 60; }
function stop() { clearInterval(interval); interval = null; $("timerButton").textContent = "start"; }
function playChime() {
  if (!data.settings.sound) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    const now = audioContext.currentTime;
    [523.25, 659.25].forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
      oscillator.type = "sine"; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, now + index * 0.16);
      gain.gain.linearRampToValueAtTime(0.12, now + index * 0.16 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.16 + 0.55);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start(now + index * 0.16); oscillator.stop(now + index * 0.16 + 0.56);
    });
  } catch { /* The timer still works if this browser blocks audio. */ }
}
function finish() {
  stop();
  playChime();
  if (mode === "focus") {
    data.sessions.unshift({ at: new Date().toISOString(), minutes: data.settings.focus }); save(); renderAll();
    const count = data.sessions.filter(s => localKey(new Date(s.at)) === localKey(new Date())).length;
    mode = count % data.settings.rounds === 0 ? "longBreak" : "break"; selectMode(); if (data.settings.auto) start();
  } else { mode = "focus"; selectMode(); if (data.settings.auto) start(); }
}
function start() {
  if (interval) { stop(); return; }
  if (data.settings.sound && !audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext?.state === "suspended") audioContext.resume();
  interval = setInterval(() => { remaining--; renderTimer(); if (remaining <= 0) finish(); }, 1000);
  $("timerButton").textContent = "pause";
}
function selectMode() { document.querySelectorAll(".mode").forEach(b => b.classList.toggle("active", b.dataset.mode === mode)); remaining = durationFor(mode); renderTimer(); }
function renderAll() { renderStats(); renderHeatmap(); renderTodos(); }

$("timerButton").onclick = start;
$("resetButton").onclick = () => { stop(); selectMode(); };
document.querySelectorAll(".mode").forEach(b => b.onclick = () => { stop(); mode = b.dataset.mode; selectMode(); });
$("todoForm").onsubmit = (e) => { e.preventDefault(); const text = $("todoInput").value.trim(); if (!text) return; data.todos.unshift({ id: crypto.randomUUID(), text, done: false, date: localKey(new Date()) }); save(); $("todoInput").value = ""; renderTodos(); };
$("todoList").onclick = (e) => { const id = e.target.dataset.id || e.target.dataset.delete; if (!id) return; if (e.target.dataset.delete) data.todos = data.todos.filter(t => t.id !== id); else { const todo = data.todos.find(t => t.id === id); todo.done = !todo.done; } save(); renderTodos(); };
$("openSettings").onclick = () => { ["focus", "break", "longBreak"].forEach(k => $(k + "Length").value = data.settings[k]); $("roundsUntilLong").value = data.settings.rounds; $("autoStartBreaks").checked = data.settings.auto; $("timerSound").checked = data.settings.sound; $("settingsDialog").showModal(); };
$("settingsForm").onsubmit = (e) => { if (e.submitter.value !== "save") return; data.settings = { focus: +$("focusLength").value, break: +$("breakLength").value, longBreak: +$("longBreakLength").value, rounds: +$("roundsUntilLong").value, auto: $("autoStartBreaks").checked, sound: $("timerSound").checked }; save(); stop(); selectMode(); };
$("openLog").onclick = () => { renderLog(); $("logDialog").showModal(); };
$("closeLog").onclick = () => $("logDialog").close();
$("statsButton").onclick = () => {
  const showStats = $("statsView").hidden;
  $("statsView").hidden = !showStats;
  $("focusView").hidden = showStats;
  $("statsButton").classList.toggle("active", showStats);
};
$("themeButton").onclick = () => { data.theme = data.theme === "oled" ? "light" : "oled"; save(); applyTheme(); };
function applyTheme() { document.body.classList.toggle("oled", data.theme === "oled"); document.querySelector('meta[name="theme-color"]').content = data.theme === "oled" ? "#000000" : "#ffffff"; }

$("currentDate").textContent = new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
applyTheme(); renderTimer(); renderAll();
