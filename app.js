const NO_PICK_POINTS = -25;

function pointsFor(result, margin) {
  if (result === "win") return margin;
  if (result === "loss") return margin * -2;
  if (result === "tie") return 0;
  return null;
}

function padWeek(week) {
  return String(week).padStart(2, "0");
}

function signed(points) {
  return `${points > 0 ? "+" : ""}${points}`;
}

function statusText(pick) {
  if (!pick) return "Open — select an eligible projected favorite before its kickoff.";
  if (!pick.result) return "Saved securely · You can change your pick before kickoff.";
  const label = pick.result === "win" ? "Won" : pick.result === "loss" ? "Lost" : "Tied";
  return `${label} by ${pick.margin} · ${signed(pick.points ?? 0)} points`;
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

function cell(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

function logo(logos, name) {
  const img = document.createElement("img");
  img.className = "h-7 w-7 object-contain";
  img.alt = "";
  img.src = `https://a.espncdn.com/i/teamlogos/nfl/500/${logos[name]}.png`;
  return img;
}

function teamLabel(name, record) {
  const span = document.createElement("span");
  span.append(document.createTextNode(`${name} `));
  span.append(cell("small", "text-slate-400", record));
  return span;
}

async function loadSeason() {
  const season = await fetch("data/season.json").then((response) => {
    if (!response.ok) throw new Error("season");
    return response.json();
  });
  const weeks = await Promise.all(
    season.weeks.map(async (id) => {
      const response = await fetch(`data/weeks/${id}.json`);
      if (!response.ok) throw new Error(id);
      return response.json();
    }),
  );
  weeks.sort((a, b) => a.week - b.week);
  return { season, weeks };
}

function usedShortNames(weeks) {
  return new Set(
    weeks.filter((week) => week.status === "final" && week.pick?.short).map((week) => week.pick.short),
  );
}

function completedPoints(weeks) {
  return weeks
    .filter((week) => week.status === "final")
    .reduce((total, week) => total + (week.pick ? week.pick.points : NO_PICK_POINTS), 0);
}

function recordText(weeks, current) {
  let wins = 0;
  let losses = 0;
  for (const week of weeks) {
    if (week.status !== "final" || !week.pick) continue;
    if (week.pick.result === "win") wins += 1;
    if (week.pick.result === "loss") losses += 1;
  }
  if (current?.result === "win") wins += 1;
  if (current?.result === "loss") losses += 1;
  return `${wins}–${losses}`;
}

function renderWeeks(weeks, openWeek, pick) {
  const body = document.getElementById("weeks-body");
  body.replaceChildren();
  for (const week of weeks) {
    if (week.status === "open") {
      body.append(openRow(week, pick));
      continue;
    }
    body.append(finalRow(week));
  }
  if (openWeek && !weeks.some((week) => week.week === openWeek.week && week.status === "open")) {
    body.append(openRow(openWeek, pick));
  }
}

function finalRow(week) {
  const tr = document.createElement("tr");
  tr.className = "border-t border-slate-700";
  tr.append(cell("td", "p-4 font-bold text-slate-400", padWeek(week.week)));
  if (!week.pick) {
    tr.append(cell("td", "p-4 font-bold", "No pick recorded"));
    tr.append(cell("td", "p-4 font-bold text-slate-400", "—"));
    tr.append(cell("td", "p-4 font-black text-rose-200", "−25"));
    return tr;
  }
  const selection = cell("td", "p-4");
  selection.append(cell("strong", "", week.pick.team));
  selection.append(document.createElement("br"));
  selection.append(cell("span", "text-slate-400", week.pick.opponent));
  tr.append(selection);
  tr.append(cell("td", "p-4 font-bold", week.pick.resultText));
  tr.append(cell("td", "p-4 font-black text-emerald-300", week.pick.pointsText));
  return tr;
}

function openRow(week, pick) {
  const tr = document.createElement("tr");
  tr.className = "border-t border-slate-600 bg-blue-400/10";
  tr.append(cell("td", "p-4 font-bold", padWeek(week.week)));
  const td = cell("td", "p-4");
  td.colSpan = 3;
  td.id = "current-week-cell";
  const wrap = cell("div", "flex items-center justify-between gap-4");
  if (pick) {
    const left = document.createElement("div");
    left.append(cell("strong", "", pick.team));
    left.append(cell("p", "mt-1 text-sm font-bold text-emerald-300", statusText(pick)));
    const link = cell(
      "a",
      "shrink-0 rounded-lg border border-blue-400/70 bg-blue-500/20 px-3 py-2 text-xs font-extrabold text-blue-100",
      "Change pick",
    );
    link.href = "#confidence";
    wrap.append(left, link);
  } else {
    wrap.append(cell("span", "", statusText(null)));
    const link = cell(
      "a",
      "shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-xs font-extrabold text-white",
      `Choose Week ${week.week} pick`,
    );
    link.href = "#confidence";
    wrap.append(link);
  }
  td.append(wrap);
  tr.append(td);
  return tr;
}

function renderBoard(week, logos, used, pick, saving) {
  document.getElementById("board-title").textContent = `Week ${week.week} confidence board`;
  const root = document.getElementById("confidence");
  root.replaceChildren();
  const games = [...week.games].sort((a, b) => b.rank - a.rank);
  for (const game of games) {
    const article = cell(
      "article",
      "grid grid-cols-[34px_1fr_auto] items-center gap-3 rounded-xl border border-slate-700 bg-gradient-to-r from-[#122238] to-[#0e1a2a] p-3",
    );
    article.append(cell("p", "text-xs font-extrabold text-slate-400", String(game.rank)));
    const body = cell("div", "min-w-0");
    const matchup = cell("div", "flex flex-wrap items-center gap-2 text-sm font-bold");
    matchup.append(
      logo(logos, game.away),
      teamLabel(game.away, game.awayRecord),
      cell("span", "text-slate-500", "at"),
      logo(logos, game.home),
      teamLabel(game.home, game.homeRecord),
    );
    const action = cell("div", "mt-2");
    if (used.has(game.favorite)) {
      action.append(cell("span", "text-xs font-extrabold uppercase tracking-wide text-slate-500", "Already used"));
    } else {
      const selected = pick?.team === game.favorite;
      const button = cell("button");
      button.type = "button";
      button.dataset.team = game.favorite;
      button.disabled = saving !== null;
      button.className =
        "rounded-lg border px-3 py-1.5 text-sm font-extrabold transition " +
        (selected
          ? "border-blue-100 bg-blue-500 text-white shadow-lg shadow-blue-900/60"
          : "border-blue-400/80 bg-blue-500/15 text-blue-200 hover:bg-blue-500/30");
      button.textContent =
        saving === game.favorite ? "Saving…" : selected ? `${game.favorite} · Selected` : `Pick ${game.favorite}`;
      action.append(button);
    }
    body.append(matchup, action);
    const score = cell("div", "text-right");
    score.append(cell("p", "text-lg font-black text-white", String(game.winsPer100)));
    score.append(cell("p", "text-[10px] font-bold uppercase text-slate-400", "wins / 100"));
    article.append(body, score);
    root.append(article);
  }
}

function renderUsed(weeks) {
  const list = document.getElementById("used-list");
  list.replaceChildren();
  for (const week of weeks) {
    if (week.status !== "final" || !week.pick) continue;
    list.append(
      cell("span", "rounded-full border border-slate-600 bg-[#0b1726] px-3 py-1.5 text-sm font-bold", week.pick.team),
    );
  }
}

function renderStats(season, weeks, pick) {
  const base = completedPoints(weeks);
  const extra = pick?.points ?? 0;
  const total = base + extra;
  const usedCount =
    weeks.filter((week) => week.status === "final" && week.pick).length + (pick ? 1 : 0);
  document.getElementById("stat-points").textContent = signed(total);
  document.getElementById("stat-record").textContent = recordText(weeks, pick);
  document.getElementById("stat-used").textContent = String(usedCount);
  document.getElementById("stat-remain").textContent = `${season.teamCount - usedCount} remain eligible`;
}

function materialize(week, used, team, updatedAt) {
  if (!team || used.has(team)) return null;
  const game = week.games.find((entry) => entry.favorite === team);
  if (!game) return null;
  const final = week.finals?.[team];
  if (!final) {
    return { team, result: null, margin: null, points: null, updated_at: updatedAt || Date.now() };
  }
  const points = pointsFor(final.result, final.margin);
  if (points === null || !Number.isInteger(final.margin) || final.margin < 0) return null;
  return {
    team,
    result: final.result,
    margin: final.margin,
    points,
    updated_at: updatedAt || Date.now(),
  };
}

function readStored(week, used) {
  let raw;
  try {
    raw = localStorage.getItem(week.storageKey);
  } catch {
    return { error: "Your saved pick is temporarily unavailable." };
  }
  if (raw === null || raw === "") return { pick: null };
  let team = raw;
  let updatedAt = null;
  if (raw.startsWith("{") || raw.startsWith("\"")) {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "string") team = parsed;
      else if (parsed && typeof parsed.team === "string") {
        team = parsed.team;
        updatedAt = parsed.updated_at;
      } else return { error: "Your saved pick is temporarily unavailable." };
    } catch {
      team = raw;
    }
  }
  const pick = materialize(week, used, team, updatedAt);
  if (!pick) return { error: "Your saved pick is temporarily unavailable." };
  return { pick };
}

function paint(state) {
  renderStats(state.season, state.weeks, state.pick);
  renderWeeks(state.weeks, state.openWeek, state.pick);
  renderBoard(state.openWeek, state.season.logos, state.used, state.pick, state.saving);
  renderUsed(state.weeks);
}

async function main() {
  let season;
  let weeks;
  try {
    ({ season, weeks } = await loadSeason());
  } catch {
    showError("Your saved pick is temporarily unavailable.");
    return;
  }
  const openWeek = weeks.find((week) => week.week === season.currentWeek && week.status === "open");
  if (!openWeek) {
    showError("Your saved pick is temporarily unavailable.");
    return;
  }
  const used = usedShortNames(weeks);
  const stored = readStored(openWeek, used);
  const state = {
    season,
    weeks,
    openWeek,
    used,
    pick: stored.pick || null,
    saving: null,
  };
  if (stored.error) showError(stored.error);
  paint(state);

  document.getElementById("confidence").addEventListener("click", (event) => {
    const button = event.target.closest("[data-team]");
    if (!button || state.saving) return;
    const team = button.getAttribute("data-team");
    const pick = materialize(openWeek, used, team, Date.now());
    if (!pick) {
      showError(`That team is not available for Week ${openWeek.week}.`);
      return;
    }
    state.saving = team;
    showError("");
    paint(state);
    try {
      localStorage.setItem(openWeek.storageKey, JSON.stringify(pick));
      state.pick = pick;
      document.getElementById("weekly")?.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch {
      showError("Unable to save your pick.");
    } finally {
      state.saving = null;
      paint(state);
    }
  });
}

main();
