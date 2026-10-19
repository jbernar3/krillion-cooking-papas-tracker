import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

const PLAYERS = [
  { id: "jefferson", name: "Jefferson", full: "Jefferson C. Bernard", color: "var(--p-jefferson)" },
  { id: "davide", name: "Davide", full: "Davide Bianchi", color: "var(--p-davide)" },
  { id: "jack", name: "Jack", full: "Jack Gwertzman", color: "var(--p-jack)" },
];
const byId = Object.fromEntries(PLAYERS.map((p) => [p.id, p]));

const $ = (id) => document.getElementById(id);
const fmt = (n) => n.toLocaleString("en-US");
const hat = (cls = "") => `<svg class="${cls}" aria-hidden="true"><use href="#hat"/></svg>`;

// Dates are plain "YYYY-MM-DD" strings in each person's local time.
const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const todayStr = () => ymd(new Date());
const parseYmd = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

// ---------- Storage: Supabase when configured, this browser otherwise ----------

const LOCAL_KEY = "cooking-papas-scores";
let supabase = null;

async function initStore() {
  if (SUPABASE_URL && SUPABASE_KEY) {
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  } else {
    $("demo-banner").hidden = false;
  }
}

async function fetchScores() {
  if (!supabase) {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY)) || []; } catch { return []; }
  }
  // Supabase returns at most 1000 rows per request, so page through them.
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("scores")
      .select("player, play_date, score")
      .order("play_date")
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

async function saveScore(row) {
  if (!supabase) {
    const rows = (await fetchScores()).filter((r) => !(r.player === row.player && r.play_date === row.play_date));
    rows.push(row);
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(rows)); } catch {}
    return;
  }
  const { error } = await supabase.from("scores").upsert(row, { onConflict: "player,play_date" });
  if (error) throw error;
}

// ---------- State ----------

let days = new Map(); // "YYYY-MM-DD" -> { jefferson: 123, ... }
let viewMonth = (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); })();
let selected = todayStr();

function indexScores(rows) {
  days = new Map();
  for (const r of rows) {
    if (!days.has(r.play_date)) days.set(r.play_date, {});
    days.get(r.play_date)[r.player] = Number(r.score);
  }
}

// Everyone tied for the top score shares the win.
function winners(date) {
  const day = days.get(date);
  if (!day) return { ids: [], top: null };
  const top = Math.max(...Object.values(day));
  return { ids: PLAYERS.map((p) => p.id).filter((id) => day[id] === top), top };
}

const nameList = (ids) => {
  const names = ids.map((id) => byId[id].name);
  return names.length < 3 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
};

// ---------- Rendering ----------

function renderToday() {
  const t = todayStr();
  const day = days.get(t) || {};
  const { ids } = winners(t);
  const order = [...PLAYERS].sort((a, b) => (day[b.id] ?? -1) - (day[a.id] ?? -1));
  $("today-board").innerHTML = order
    .map((p) => {
      const has = day[p.id] != null;
      const lead = ids.includes(p.id);
      return `<li class="plate${lead ? " lead" : ""}" style="--pc:${p.color}">
        <span class="avatar">${p.name[0]}</span>
        <span class="who">${p.name}${lead ? hat() : ""}</span>
        <span class="pts${has ? "" : " none"}">${has ? fmt(day[p.id]) : "Not cooked yet"}</span>
      </li>`;
    })
    .join("");
}

function cellBackground(ids) {
  const tint = (id) => `color-mix(in srgb, ${byId[id].color} var(--tint), var(--plate))`;
  if (ids.length === 1) return tint(ids[0]);
  const step = 100 / ids.length;
  return `linear-gradient(135deg, ${ids.map((id, i) => `${tint(id)} ${i * step}% ${(i + 1) * step}%`).join(", ")})`;
}

function renderCalendar() {
  const y = viewMonth.getFullYear();
  const m = viewMonth.getMonth();
  $("month-title").textContent = viewMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  $("tally-month-col").textContent = viewMonth.toLocaleDateString("en-US", { month: "short" });

  const t = todayStr();
  const lead = new Date(y, m, 1).getDay();
  const count = new Date(y, m + 1, 0).getDate();
  let html = "";
  for (let i = 0; i < lead; i++) html += `<span class="day blank"></span>`;
  for (let d = 1; d <= count; d++) {
    const date = ymd(new Date(y, m, d));
    const { ids, top } = winners(date);
    const future = date > t;
    const cls = ["day", ids.length && "won", date === t && "today", date === selected && "selected", future && "future"]
      .filter(Boolean)
      .join(" ");
    const label = ids.length
      ? `${parseYmd(date).toLocaleDateString("en-US", { month: "long", day: "numeric" })}: ${nameList(ids)} won with ${fmt(top)}`
      : `${parseYmd(date).toLocaleDateString("en-US", { month: "long", day: "numeric" })}: no scores`;
    html += `<button type="button" class="${cls}" data-date="${date}" ${future ? "disabled" : ""}
      aria-label="${label}" ${ids.length ? `style="--cell-bg:${cellBackground(ids)}"` : ""}>
      <span class="num">${d}</span>
      ${ids.length ? `<span class="hats${ids.length > 1 ? " tie" : ""}">${ids.map((id) => `<span style="color:${byId[id].color}">${hat()}</span>`).join("")}</span>
      <span class="top">${fmt(top)}</span>` : ""}
    </button>`;
  }
  $("grid").innerHTML = html;

  const now = new Date();
  $("next-month").disabled = y > now.getFullYear() || (y === now.getFullYear() && m >= now.getMonth());
}

function renderDetail() {
  const day = days.get(selected) || {};
  const { ids } = winners(selected);
  const when = parseYmd(selected).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const order = [...PLAYERS].sort((a, b) => (day[b.id] ?? -1) - (day[a.id] ?? -1));
  const heading = ids.length
    ? `${when}: ${nameList(ids)} ${selected === todayStr() ? (ids.length > 1 ? "are tied" : "leads") : ids.length > 1 ? "shared the hat" : "took the hat"}`
    : `${when}: no scores yet`;
  $("day-detail").innerHTML = `<h3>${heading}</h3><ol>${order
    .map((p) => `<li style="--pc:${p.color}">
        <span class="avatar sm">${p.name[0]}</span>${p.name}
        ${ids.includes(p.id) ? hat("hat-inline") : ""}
        <span class="pts${day[p.id] == null ? " none" : ""}">${day[p.id] == null ? "No score" : fmt(day[p.id])}</span>
      </li>`)
    .join("")}</ol>`;
}

function renderTally() {
  const monthPrefix = ymd(viewMonth).slice(0, 7);
  const stats = Object.fromEntries(PLAYERS.map((p) => [p.id, { month: 0, all: 0, best: null }]));
  for (const [date, day] of days) {
    for (const id of winners(date).ids) {
      stats[id].all++;
      if (date.startsWith(monthPrefix)) stats[id].month++;
    }
    for (const [id, s] of Object.entries(day)) {
      if (stats[id] && (stats[id].best == null || s > stats[id].best)) stats[id].best = s;
    }
  }
  $("tally-body").innerHTML = [...PLAYERS]
    .sort((a, b) => stats[b.id].month - stats[a.id].month || stats[b.id].all - stats[a.id].all)
    .map((p) => {
      const s = stats[p.id];
      return `<tr style="--pc:${p.color}">
        <td><span class="avatar sm">${p.name[0]}</span><span class="name">${p.full}</span><span class="short">${p.name}</span></td>
        <td class="big">${s.month}</td><td>${s.all}</td><td>${s.best == null ? "None yet" : fmt(s.best)}</td>
      </tr>`;
    })
    .join("");
}

function render() {
  renderToday();
  renderCalendar();
  renderDetail();
  renderTally();
}

async function refresh() {
  try {
    indexScores(await fetchScores());
    render();
  } catch (err) {
    console.error(err);
    showMsg(`Couldn't load scores: ${err.message || err}. Check config.js and the Supabase setup.`, true);
  }
}

function showMsg(text, isError = false) {
  const el = $("form-msg");
  el.textContent = text;
  el.classList.toggle("err", isError);
}

// ---------- Wiring ----------

function setupForm() {
  const select = $("player");
  for (const p of PLAYERS) select.add(new Option(p.full, p.id));
  try {
    const me = localStorage.getItem("cooking-papas-me");
    if (me && byId[me]) select.value = me;
  } catch {}

  const date = $("date");
  date.value = todayStr();
  date.max = todayStr();

  $("score-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const player = select.value;
    const raw = $("score").value.replace(/[,\s_.]/g, "");
    if (!player) return showMsg("Pick your name first.", true);
    if (!/^\d+$/.test(raw)) return showMsg("Enter your score as a whole number, like 412.", true);
    if (!date.value || date.value > todayStr()) return showMsg("Pick today or an earlier day.", true);

    const score = Number(raw);
    const replacing = days.get(date.value)?.[player] != null;
    const btn = e.submitter || $("score-form").querySelector("button");
    btn.disabled = true;
    showMsg("Saving…");
    try {
      await saveScore({ player, play_date: date.value, score });
      try { localStorage.setItem("cooking-papas-me", player); } catch {}
      $("score").value = "";
      selected = date.value;
      const d = parseYmd(date.value);
      viewMonth = new Date(d.getFullYear(), d.getMonth(), 1);
      await refresh();
      showMsg(`${replacing ? "Updated" : "Saved"}: ${byId[player].name}, ${fmt(score)}.`);
    } catch (err) {
      console.error(err);
      showMsg(`Couldn't save: ${err.message || err}. Try again.`, true);
    } finally {
      btn.disabled = false;
    }
  });
}

function setupCalendar() {
  $("grid").addEventListener("click", (e) => {
    const cell = e.target.closest(".day[data-date]");
    if (!cell || cell.disabled) return;
    selected = cell.dataset.date;
    renderCalendar();
    renderDetail();
  });
  const shift = (n) => {
    viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + n, 1);
    renderCalendar();
    renderTally();
  };
  $("prev-month").addEventListener("click", () => shift(-1));
  $("next-month").addEventListener("click", () => shift(1));
}

setupForm();
setupCalendar();
await initStore();
await refresh();

// Pick up the others' scores when someone comes back to the tab.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refresh();
});
