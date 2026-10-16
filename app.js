// Standalone replacement for the hosted /api/pick store.
// The original key held a team name. This page also accepts that string
// and otherwise stores the full pick: team, result, margin, points, updated_at.
const STORAGE_KEY = "raul-survivor-week-5-pick";
const BASE_POINTS = 57;
const USED = new Set(["Detroit", "San Francisco", "Kansas City", "Baltimore"]);

// Week 5 finals for the projected favorite on each confidence-board game.
// Scores: Pro Football Reference week 5, 2026. Houston 26–3 matches the
// hosted pick (win, margin 23, +23).
const FINALS = {
  Dallas: { result: "loss", margin: 8 },
  Cincinnati: { result: "win", margin: 7 },
  Houston: { result: "win", margin: 23 },
  Jacksonville: { result: "win", margin: 2 },
  Detroit: { result: "win", margin: 24 },
  "New England": { result: "win", margin: 28 },
  Washington: { result: "tie", margin: 0 },
  Seattle: { result: "loss", margin: 3 },
  "L.A. Rams": { result: "loss", margin: 3 },
  Atlanta: { result: "loss", margin: 7 },
  Minnesota: { result: "win", margin: 10 },
  Denver: { result: "win", margin: 6 },
  "N.Y. Jets": { result: "win", margin: 5 },
  Pittsburgh: { result: "win", margin: 12 },
  Chicago: { result: "loss", margin: 24 },
};

// Pick saved on the hosted dashboard before this static copy was made.
const DEFAULT_PICK = {
  team: "Houston",
  result: "win",
  margin: 23,
  points: 23,
  updated_at: 1791868007387,
};

function pointsFor(result, margin) {
  if (result === "win") return margin;
  if (result === "loss") return margin * -2;
  if (result === "tie") return 0;
  return null;
}

function scoredPick(team, updatedAt) {
  const final = FINALS[team];
  if (!final || USED.has(team)) return null;
  const points = pointsFor(final.result, final.margin);
  if (points === null) return null;
  return {
    team,
    result: final.result,
    margin: final.margin,
    points,
    updated_at: updatedAt || Date.now(),
  };
}

function pickFromStored(raw) {
  if (typeof raw !== "string" || raw.length === 0) return null;
  if (Object.prototype.hasOwnProperty.call(FINALS, raw)) return scoredPick(raw);
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed === "string") return pickFromStored(parsed);
  if (!parsed || typeof parsed.team !== "string" || USED.has(parsed.team)) return null;
  if (parsed.result == null) return scoredPick(parsed.team, parsed.updated_at);
  if (!["win", "loss", "tie"].includes(parsed.result)) return null;
  if (!Number.isInteger(parsed.margin) || parsed.margin < 0) return null;
  const points = pointsFor(parsed.result, parsed.margin);
  if (points === null) return null;
  return {
    team: parsed.team,
    result: parsed.result,
    margin: parsed.margin,
    points,
    updated_at: parsed.updated_at || Date.now(),
  };
}

function statusText(pick) {
  if (!pick) return "Open — select an eligible projected favorite before its kickoff.";
  if (!pick.result) return "Saved securely · You can change your pick before kickoff.";
  const label = pick.result === "win" ? "Won" : pick.result === "loss" ? "Lost" : "Tied";
  const points = (pick.points ?? 0) > 0 ? `+${pick.points}` : `${pick.points}`;
  return `${label} by ${pick.margin} · ${points} points`;
}

function showError(message) {
  const el = document.getElementById("pick-error");
  if (!message) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = message;
}

function paint(pick, saving) {
  const extra = pick?.points ?? 0;
  const total = BASE_POINTS + extra;
  document.getElementById("stat-points").textContent = `${total >= 0 ? "+" : ""}${total}`;
  document.getElementById("stat-record").textContent =
    pick?.result === "win" ? "5–0" : pick?.result === "loss" ? "4–1" : "4–0";
  document.getElementById("stat-used").textContent = pick ? "5" : "4";
  document.getElementById("stat-remain").textContent = pick ? "27 remain eligible" : "28 remain eligible";

  const cell = document.getElementById("week5-cell");
  const wrap = document.createElement("div");
  wrap.className = "flex items-center justify-between gap-4";
  if (pick) {
    const left = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = pick.team;
    const status = document.createElement("p");
    status.className = "mt-1 text-sm font-bold text-emerald-300";
    status.textContent = statusText(pick);
    left.append(strong, status);
    const link = document.createElement("a");
    link.className =
      "shrink-0 rounded-lg border border-blue-400/70 bg-blue-500/20 px-3 py-2 text-xs font-extrabold text-blue-100";
    link.href = "#confidence";
    link.textContent = "Change pick";
    wrap.append(left, link);
  } else {
    const span = document.createElement("span");
    span.textContent = statusText(null);
    const link = document.createElement("a");
    link.className = "shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-xs font-extrabold text-white";
    link.href = "#confidence";
    link.textContent = "Choose Week 5 pick";
    wrap.append(span, link);
  }
  cell.replaceChildren(wrap);

  document.querySelectorAll("[data-team]").forEach((button) => {
    const team = button.getAttribute("data-team");
    const selected = pick?.team === team;
    button.disabled = saving !== null;
    button.className =
      "rounded-lg border px-3 py-1.5 text-sm font-extrabold transition " +
      (selected
        ? "border-blue-100 bg-blue-500 text-white shadow-lg shadow-blue-900/60"
        : "border-blue-400/80 bg-blue-500/15 text-blue-200 hover:bg-blue-500/30");
    button.textContent = saving === team ? "Saving…" : selected ? `${team} · Selected` : `Pick ${team}`;
  });
}

let current = null;
let saving = null;

function persist(pick) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pick));
}

function load() {
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    showError("Your saved pick is temporarily unavailable.");
    current = null;
    paint(null, null);
    return;
  }
  if (raw === null) {
    current = { ...DEFAULT_PICK };
    try {
      persist(current);
    } catch {
      showError("Unable to save your pick.");
    }
    paint(current, null);
    return;
  }
  const pick = pickFromStored(raw);
  if (!pick) {
    showError("Your saved pick is temporarily unavailable.");
    current = null;
    paint(null, null);
    return;
  }
  current = pick;
  paint(current, null);
}

function choose(team) {
  if (saving) return;
  const pick = scoredPick(team, Date.now());
  if (!pick) {
    showError("That team is not available for Week 5.");
    return;
  }
  saving = team;
  showError("");
  paint(current, saving);
  try {
    persist(pick);
    current = pick;
    document.getElementById("weekly")?.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch {
    showError("Unable to save your pick.");
  } finally {
    saving = null;
    paint(current, null);
  }
}

document.querySelectorAll("[data-team]").forEach((button) => {
  button.addEventListener("click", () => choose(button.getAttribute("data-team")));
});

load();
