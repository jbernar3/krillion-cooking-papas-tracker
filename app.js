import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

const PAPAS = {
  jefferson: { id: "jefferson", name: "Jefferson", full: "Jefferson C. Bernard", color: "var(--p-jefferson)" },
  davide: { id: "davide", name: "Davide", full: "Davide Bianchi", color: "var(--p-davide)" },
  jack: { id: "jack", name: "Jack", full: "Jack Gwertzman", color: "var(--p-jack)" },
  adam: { id: "adam", name: "Adam", full: "Baby Adam", color: "var(--p-adam)", baby: true },
};
const byId = PAPAS;

// Season 2 is the live scoreboard. Season 1 (the original three papas) is the read-only archive.
const SEASONS = {
  current: {
    label: "Season 2",
    table: "scores_season2",
    localKey: "cooking-papas-scores-s2",
    start: "2026-11-19",
    players: [PAPAS.jefferson, PAPAS.davide, PAPAS.jack, PAPAS.adam],
  },
  archive: {
    label: "Season 1",
    table: "scores",
    localKey: "cooking-papas-scores",
    players: [PAPAS.jefferson, PAPAS.davide, PAPAS.jack],
    readOnly: true,
  },
};

const $ = (id) => document.getElementById(id);
const fmt = (n) => n.toLocaleString("en-US");
// Chef's hat for each win. Baby Adam gets his own face (bonnet and pacifier) instead.
const hat = (p, cls = "") =>
  p.baby
    ? `<svg class="${cls}" viewBox="0 0 8 8" aria-hidden="true"><use href="#baby"/></svg>`
    : `<svg class="${cls}" style="--hat-band:${p.color}" aria-hidden="true"><use href="#hat"/></svg>`;
const avatar = (p, sm = false) =>
  p.baby
    ? `<span class="avatar baby${sm ? " sm" : ""}"><svg viewBox="0 0 8 8" aria-hidden="true"><use href="#baby"/></svg></span>`
    : `<span class="avatar${sm ? " sm" : ""}">${p.name[0]}</span>`;

// Dates are plain "YYYY-MM-DD" strings in each person's local time.
const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const todayStr = () => ymd(new Date());
const parseYmd = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const monthOf = (s) => { const d = parseYmd(s); return new Date(d.getFullYear(), d.getMonth(), 1); };

// ---------- Storage: Supabase when configured, this browser otherwise ----------

let supabase = null;

async function initStore() {
  if (SUPABASE_URL && SUPABASE_KEY) {
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  } else {
    $("demo-banner").hidden = false;
  }
}

async function fetchScores(season) {
  if (!supabase) {
    try { return JSON.parse(localStorage.getItem(season.localKey)) || []; } catch { return []; }
  }
  // Supabase returns at most 1000 rows per request, so page through them.
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from(season.table)
      .select("player, play_date, score")
      .order("play_date")
      .range(from, from + 999);
    if (error) {
      if (error.code === "PGRST205" || error.code === "42P01") {
        throw new Error(`the ${season.label} table isn't set up yet. Run supabase/season2.sql in Supabase`);
      }
      throw error;
    }
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

async function saveScore(season, row) {
  if (!supabase) {
    const rows = (await fetchScores(season)).filter((r) => !(r.player === row.player && r.play_date === row.play_date));
    rows.push(row);
    try { localStorage.setItem(season.localKey, JSON.stringify(rows)); } catch {}
    return;
  }
  const { error } = await supabase.from(season.table).upsert(row, { onConflict: "player,play_date" });
  if (error) throw error;
}

// ---------- State ----------

const data = { current: new Map(), archive: new Map() }; // "YYYY-MM-DD" -> { jefferson: 123, ... }
let view = location.hash === "#archive" ? "archive" : "current";
let season = SEASONS[view];
let PLAYERS = season.players;
let days = data[view];
let viewMonth = monthOf(todayStr());
let selected = todayStr();

function indexScores(rows) {
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.play_date)) map.set(r.play_date, {});
    map.get(r.play_date)[r.player] = Number(r.score);
  }
  return map;
}

// First and last days the calendar can show for the season on screen.
function seasonRange() {
  const dates = [...days.keys()].sort();
  const first = season.start || dates[0] || todayStr();
  const last = season.readOnly ? dates.at(-1) || first : todayStr();
  return { first, last };
}

// Everyone tied for the top score shares the win.
function winners(date, map = days, players = PLAYERS) {
  const day = map.get(date);
  if (!day) return { ids: [], top: null };
  const top = Math.max(...Object.values(day));
  return { ids: players.map((p) => p.id).filter((id) => day[id] === top), top };
}

const nameList = (ids) => {
  const names = ids.map((id) => byId[id].name);
  return names.length < 3 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
};

// All-season points per papa.
function totalsFor(map, players) {
  const totals = Object.fromEntries(players.map((p) => [p.id, 0]));
  for (const day of map.values()) {
    for (const [id, score] of Object.entries(day)) if (id in totals) totals[id] += score;
  }
  return totals;
}

// ---------- Rendering ----------

function renderChrome() {
  const archived = view === "archive";
  document.body.classList.toggle("archived", archived);
  $("season-label").textContent = archived ? `${season.label} archive` : season.label;
  const link = $("archive-link");
  link.href = archived ? "#" : "#archive";
  link.textContent = archived ? `Back to ${SEASONS.current.label}` : `${SEASONS.archive.label} archive`;
  $("archive-banner").hidden = !archived;
  $("kitchen").hidden = archived;
  $("reigning").hidden = archived;
  $("lebron-title").textContent = archived ? `${season.label} Lebron` : "Current Lebron";
  $("jester-title").textContent = archived ? `${season.label} Jestermaxxer` : "Current Jestermaxxer";
  $("mookfish-title").textContent = archived ? `${season.label} Mookfish` : "Current Mookfish";
  $("doofus-title").textContent = archived ? `${season.label} doofus` : "Current doofus";

  if (archived) {
    const { first, last } = seasonRange();
    const span = (s) => parseYmd(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    $("archive-banner-text").textContent =
      `${season.label}: ${nameList(PLAYERS.map((p) => p.id))}, ${span(first)} to ${span(last)}. Scores are final.`;
  }
}

function renderToday() {
  if (view === "archive") return;
  const t = todayStr();
  const day = days.get(t) || {};
  const { ids } = winners(t);
  const order = [...PLAYERS].sort((a, b) => (day[b.id] ?? -1) - (day[a.id] ?? -1));
  $("today-board").innerHTML = order
    .map((p) => {
      const has = day[p.id] != null;
      const lead = ids.includes(p.id);
      return `<li class="plate${lead ? " lead" : ""}" style="--pc:${p.color}">
        ${avatar(p)}
        <span class="who">${p.name}${lead ? hat(p) : ""}</span>
        <span class="pts${has ? "" : " none"}">${has ? fmt(day[p.id]) : p.baby ? "Still napping" : "Not cooked yet"}</span>
      </li>`;
    })
    .join("");
}

function cellBackground(ids) {
  const tint = (id) => `color-mix(in srgb, ${byId[id].color} var(--tint), var(--deep))`;
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
  const { first, last } = seasonRange();
  const lead = new Date(y, m, 1).getDay();
  const count = new Date(y, m + 1, 0).getDate();
  let html = "";
  for (let i = 0; i < lead; i++) html += `<span class="day blank"></span>`;
  for (let d = 1; d <= count; d++) {
    const date = ymd(new Date(y, m, d));
    const { ids, top } = winners(date);
    const off = date > last || date < first;
    const cls = ["day", ids.length && "won", date === t && !season.readOnly && "today", date === selected && "selected", off && "future"]
      .filter(Boolean)
      .join(" ");
    const label = ids.length
      ? `${parseYmd(date).toLocaleDateString("en-US", { month: "long", day: "numeric" })}: ${nameList(ids)} won with ${fmt(top)}`
      : `${parseYmd(date).toLocaleDateString("en-US", { month: "long", day: "numeric" })}: no scores`;
    html += `<button type="button" class="${cls}" data-date="${date}" ${off ? "disabled" : ""}
      aria-label="${label}" ${ids.length ? `style="--cell-bg:${cellBackground(ids)}"` : ""}>
      <span class="num">${d}</span>
      ${ids.length ? `<span class="hats${ids.length > 1 ? " tie" : ""}">${ids.map((id) => `<span>${hat(byId[id])}</span>`).join("")}</span>
      <span class="top">${fmt(top)}</span>` : ""}
    </button>`;
  }
  $("grid").innerHTML = html;

  $("prev-month").disabled = viewMonth <= monthOf(first);
  $("next-month").disabled = viewMonth >= monthOf(last);
}

function renderDetail() {
  const day = days.get(selected) || {};
  const { ids } = winners(selected);
  const when = parseYmd(selected).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const order = [...PLAYERS].sort((a, b) => (day[b.id] ?? -1) - (day[a.id] ?? -1));
  const live = selected === todayStr() && !season.readOnly;
  const heading = ids.length
    ? `${when}: ${nameList(ids)} ${live ? (ids.length > 1 ? "are tied" : "leads") : ids.length > 1 ? "shared the hat" : "took the hat"}`
    : `${when}: no scores yet`;
  $("day-detail").innerHTML = `<h3>${heading}</h3><ol>${order
    .map((p) => `<li style="--pc:${p.color}">
        ${avatar(p, true)}${p.name}
        ${ids.includes(p.id) ? hat(p, "hat-inline") : ""}
        <span class="pts${day[p.id] == null ? " none" : ""}">${day[p.id] == null ? "No score" : fmt(day[p.id])}</span>
      </li>`)
    .join("")}</ol>`;
}

function seasonStats(map, players) {
  const stats = Object.fromEntries(players.map((p) => [p.id, { month: 0, all: 0, best: null }]));
  const monthPrefix = ymd(viewMonth).slice(0, 7);
  for (const [date, day] of map) {
    for (const id of winners(date, map, players).ids) {
      stats[id].all++;
      if (date.startsWith(monthPrefix)) stats[id].month++;
    }
    for (const [id, s] of Object.entries(day)) {
      if (stats[id] && (stats[id].best == null || s > stats[id].best)) stats[id].best = s;
    }
  }
  return stats;
}

function renderTally() {
  const stats = seasonStats(days, PLAYERS);
  $("tally-body").innerHTML = [...PLAYERS]
    .sort((a, b) => stats[b.id].month - stats[a.id].month || stats[b.id].all - stats[a.id].all)
    .map((p) => {
      const s = stats[p.id];
      return `<tr style="--pc:${p.color}">
        <td>${avatar(p, true)}<span class="name">${p.full}</span><span class="short">${p.name}</span></td>
        <td class="big">${s.month}</td><td>${s.all}</td><td>${s.best == null ? "None yet" : fmt(s.best)}</td>
      </tr>`;
    })
    .join("");
}

// Season points, ranked by distinct totals: the Lebron has the most, then the Jestermaxxer (2nd),
// then the Mookfish (3rd); the doofus has the fewest. Tied totals share the title. The doofus title
// wins over 2nd/3rd, so with three papas there's no Mookfish.
function renderStandings() {
  const middle = [["jester", "jester"], ["mookfish", "mookfish"]];
  if (days.size === 0) {
    $("lebron-body").innerHTML = `<p class="standing-empty">No scores yet, so the crown is up for grabs.</p>`;
    $("doofus-body").innerHTML = `<p class="standing-empty">No scores yet, so nobody's the doofus. Yet.</p>`;
    for (const [id] of middle) $(id).hidden = true;
    return;
  }
  const totals = totalsFor(days, PLAYERS);
  const tiers = [...new Set(Object.values(totals))].sort((a, b) => b - a);
  const high = tiers[0];
  const low = tiers[tiers.length - 1];
  const holders = (t) => PLAYERS.filter((p) => totals[p.id] === t);
  const gaps = (i) => [
    i > 0 ? `${fmt(tiers[i - 1] - tiers[i])} behind the papa above` : "",
    i < tiers.length - 1 ? `${fmt(tiers[i] - tiers[i + 1])} ahead of the next papa` : "",
  ].filter(Boolean).join(", ") || "all tied up";
  const why = (i) => `Total points: <strong>${fmt(tiers[i])}</strong>, ${gaps(i)}`;

  $("lebron-body").innerHTML = standingCard("crown", "--jewel", holders(high), why(0));
  middle.forEach(([id, icon], n) => {
    const i = n + 1;
    const has = i < tiers.length - 1;
    $(id).hidden = !has;
    $(`${id}-body`).innerHTML = has ? standingCard(icon, "--ribbon", holders(tiers[i]), why(i)) : "";
  });
  $("doofus-body").innerHTML = standingCard("dunce", "--cap-band", holders(low), why(tiers.length - 1));
}

function standingCard(icon, colorVar, holders, why) {
  return `<ul class="standing-list">${holders
    .map((p) => `<li style="--pc:${p.color}">
        <svg class="standing-icon ${icon}" style="${colorVar}:${p.color}" aria-hidden="true"><use href="#${icon}"/></svg>
        <div class="standing-text">
          <span class="standing-name">${p.full}</span>
          <span class="standing-why">${why}</span>
        </div>
      </li>`)
    .join("")}</ul>`;
}

// The Season 1 champion holds the title of Reigning Lebron until Season 2 crowns someone new.
function renderReigning() {
  if (view === "archive") return;
  const past = SEASONS.archive;
  const map = data.archive;
  if (map.size === 0) {
    $("reigning-body").innerHTML = `<p class="standing-empty">${past.label} scores haven't loaded yet.</p>`;
    return;
  }
  const totals = totalsFor(map, past.players);
  const stats = seasonStats(map, past.players);
  const ranked = [...past.players].sort((a, b) => totals[b.id] - totals[a.id]);
  const high = totals[ranked[0].id];
  const champs = ranked.filter((p) => totals[p.id] === high);
  const runnerUp = ranked.find((p) => totals[p.id] < high);

  $("reigning-body").innerHTML = champs
    .map((p) => {
      const s = stats[p.id];
      return `<div class="reign" style="--pc:${p.color}">
        <svg class="reign-crown" style="--jewel:var(--pink)" aria-hidden="true"><use href="#crown"/></svg>
        <p class="reign-name">${p.full}</p>
        <p class="reign-sub">${past.label} champion${champs.length > 1 ? " (shared)" : ""}. Wears the crown until someone takes it.</p>
        <dl class="reign-stats">
          <div><dt>${past.label} points</dt><dd>${fmt(totals[p.id])}</dd></div>
          <div><dt>Chef's hats</dt><dd>${s.all}</dd></div>
          <div><dt>Best score</dt><dd>${s.best == null ? "None" : fmt(s.best)}</dd></div>
          ${runnerUp ? `<div><dt>Winning margin</dt><dd>+${fmt(high - totals[runnerUp.id])}</dd></div>` : ""}
        </dl>
      </div>`;
    })
    .join("");
}

function render() {
  renderChrome();
  renderToday();
  renderCalendar();
  renderDetail();
  renderTally();
  renderStandings();
  renderReigning();
}

// Point the calendar at the right month for the season on screen.
function resetCalendar() {
  if (season.readOnly) {
    const { last } = seasonRange();
    selected = last;
    viewMonth = monthOf(last);
  } else {
    selected = todayStr();
    viewMonth = monthOf(todayStr());
  }
}

function switchView(next) {
  view = next;
  season = SEASONS[view];
  PLAYERS = season.players;
  days = data[view];
  resetCalendar();
  showMsg("");
  render();
  window.scrollTo({ top: 0 });
}

async function refresh() {
  const [current, archive] = await Promise.allSettled([fetchScores(SEASONS.current), fetchScores(SEASONS.archive)]);
  if (archive.status === "fulfilled") data.archive = indexScores(archive.value);
  if (current.status === "fulfilled") data.current = indexScores(current.value);
  days = data[view];
  render();

  // The archive view only depends on Season 1; the live view needs both (Season 1 feeds Reigning Lebron).
  const failed = (view === "archive" ? [archive] : [current, archive]).find((r) => r.status === "rejected");
  if (failed) {
    console.error(failed.reason);
    showMsg(`Couldn't load scores: ${failed.reason.message || failed.reason}.`, true);
  }
}

function showMsg(text, isError = false) {
  const el = view === "archive" ? $("archive-msg") : $("form-msg");
  for (const id of ["form-msg", "archive-msg"]) $(id).textContent = "";
  el.textContent = text;
  el.classList.toggle("err", isError);
}

// ---------- Wiring ----------

function setupForm() {
  const select = $("player");
  for (const p of SEASONS.current.players) select.add(new Option(p.full, p.id));
  try {
    const me = localStorage.getItem("cooking-papas-me");
    if (me && SEASONS.current.players.some((p) => p.id === me)) select.value = me;
  } catch {}

  const date = $("date");
  date.value = todayStr();
  date.max = todayStr();
  date.min = SEASONS.current.start;

  $("score-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const player = select.value;
    const raw = $("score").value.replace(/[,\s_.]/g, "");
    if (!player) return showMsg("Pick your name first.", true);
    if (!/^\d+$/.test(raw)) return showMsg("Enter your score as a whole number, like 412.", true);
    if (!date.value || date.value > todayStr()) return showMsg("Pick today or an earlier day.", true);
    if (date.value < SEASONS.current.start) return showMsg(`${SEASONS.current.label} started ${parseYmd(SEASONS.current.start).toLocaleDateString("en-US", { month: "long", day: "numeric" })}.`, true);

    const score = Number(raw);
    const replacing = data.current.get(date.value)?.[player] != null;
    const btn = e.submitter || $("score-form").querySelector("button");
    btn.disabled = true;
    showMsg("Saving…");
    try {
      await saveScore(SEASONS.current, { player, play_date: date.value, score });
      try { localStorage.setItem("cooking-papas-me", player); } catch {}
      $("score").value = "";
      selected = date.value;
      viewMonth = monthOf(date.value);
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

function setupArchive() {
  addEventListener("hashchange", () => {
    const next = location.hash === "#archive" ? "archive" : "current";
    if (next !== view) switchView(next);
  });
}

// On iPhone/iPad Safari, explain how to add the site to the home screen (until dismissed or installed).
function setupInstallHint() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const installed = navigator.standalone || matchMedia("(display-mode: standalone)").matches;
  let dismissed = false;
  try { dismissed = localStorage.getItem("cooking-papas-install-hint") === "dismissed"; } catch {}
  if (!ios || installed || dismissed) return;

  $("install-hint").hidden = false;
  $("install-dismiss").addEventListener("click", () => {
    $("install-hint").hidden = true;
    try { localStorage.setItem("cooking-papas-install-hint", "dismissed"); } catch {}
  });
}

setupInstallHint();
setupForm();
setupCalendar();
setupArchive();
await initStore();
await refresh();
if (season.readOnly) {
  resetCalendar();
  render();
}

// Pick up the others' scores when someone comes back to the tab.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refresh();
});
