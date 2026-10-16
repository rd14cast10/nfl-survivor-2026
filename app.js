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
  span.append(cell("small", "record", record));
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

function gameFor(week, team) {
  return week.games?.find((game) => game.favorite === team);
}

function kickedOff(week, team) {
  return Boolean(week.finals?.[team]);
}

function opponentText(week, team) {
  const game = gameFor(week, team);
  if (!game) return "";
  return game.favorite === game.home ? `vs. ${game.away}` : `at ${game.home}`;
}

const TEAM_COLORS = {
  Arizona: "#97233F",
  Atlanta: "#A71930",
  Baltimore: "#241773",
  Buffalo: "#00338D",
  Carolina: "#0085CA",
  Chicago: "#C83803",
  Cincinnati: "#FB4F14",
  Cleveland: "#FF3C00",
  Dallas: "#003594",
  Denver: "#FB4F14",
  Detroit: "#0076B6",
  "Green Bay": "#FFB612",
  Houston: "#C8102E",
  Indianapolis: "#002C5F",
  Jacksonville: "#006778",
  "Kansas City": "#E31837",
  "L.A. Chargers": "#0080C6",
  "L.A. Rams": "#003594",
  "Las Vegas": "#A5ACAF",
  Miami: "#008E97",
  Minnesota: "#4F2683",
  "New England": "#C60C30",
  "New Orleans": "#D3BC8D",
  "New York Giants": "#0B2265",
  "N.Y. Jets": "#125740",
  Philadelphia: "#004C54",
  Pittsburgh: "#FFB612",
  "San Francisco": "#AA0000",
  Seattle: "#69BE28",
  "Tampa Bay": "#D50A0A",
  Tennessee: "#4B92DB",
  Washington: "#5A1414",
};

function accent(name) {
  return TEAM_COLORS[name] || "#162B6F";
}

function labeledCell(className, label, text) {
  const td = cell("td", className, text);
  td.dataset.label = label;
  return td;
}

function resultBadge(resultText, result) {
  const bonus = resultText.includes("Bonus");
  const score = bonus ? resultText.replace(/\s*·\s*Bonus/, "") : resultText;
  const kind = result === "loss" ? "loss" : result === "tie" ? "tie" : "win";
  const wrap = document.createElement("span");
  wrap.append(cell("span", `badge badge-${kind}`, score));
  if (bonus) wrap.append(cell("span", "badge badge-bonus", "Bonus"));
  return wrap;
}

function finalRow(week) {
  const tr = document.createElement("tr");
  tr.className = "pick-row";
  tr.append(labeledCell("week-num", "Week", padWeek(week.week)));
  if (!week.pick) {
    const selection = labeledCell("", "Selection");
    selection.append(cell("span", "badge badge-miss", "No pick recorded"));
    tr.append(selection);
    tr.append(labeledCell("", "Result", "—"));
    tr.append(labeledCell("points points-loss", "Points", "−25"));
    return tr;
  }
  const selection = labeledCell("", "Selection");
  selection.append(cell("span", "team-name", week.pick.team));
  selection.append(document.createElement("br"));
  selection.append(cell("span", "opponent", week.pick.opponent));
  tr.append(selection);
  const result = labeledCell("", "Result");
  result.append(resultBadge(week.pick.resultText, week.pick.result));
  tr.append(result);
  const negative = (week.pick.points ?? 0) < 0;
  tr.append(labeledCell(negative ? "points points-loss" : "points points-win", "Points", week.pick.pointsText));
  return tr;
}

function openRow(week, pick) {
  const tr = document.createElement("tr");
  tr.className = "pick-row is-open";
  tr.id = "current-week-row";
  tr.append(labeledCell("week-num", "Week", padWeek(week.week)));

  const selection = labeledCell("", "Selection");
  selection.id = "current-week-cell";
  const locked = Boolean(pick && kickedOff(week, pick.team));
  if (!pick) {
    selection.append(cell("span", "", "No pick yet"));
    const link = cell("a", "pick-btn", `Choose Week ${week.week} pick`);
    link.href = "#confidence";
    selection.append(link);
  } else {
    selection.append(cell("span", "team-name", pick.team));
    selection.append(document.createElement("br"));
    selection.append(cell("span", "opponent", opponentText(week, pick.team)));
    if (!locked) {
      const link = cell("a", "pick-btn pick-btn-quiet", "Change pick");
      link.href = "#confidence";
      selection.append(link);
    }
  }
  tr.append(selection);

  if (pick?.result) {
    const final = week.finals[pick.team];
    const result = labeledCell("", "Result");
    result.append(resultBadge(final.resultText || statusText(pick), pick.result));
    tr.append(result);
    const negative = (pick.points ?? 0) < 0;
    tr.append(labeledCell(negative ? "points points-loss" : "points points-win", "Points", final.pointsText || signed(pick.points ?? 0)));
  } else if (pick) {
    const result = labeledCell("", "Result");
    result.append(cell("span", "badge badge-open", "Before kickoff"));
    tr.append(result);
    tr.append(labeledCell("points points-muted", "Points", "—"));
  } else {
    tr.append(labeledCell("dash", "Result", "—"));
    tr.append(labeledCell("points points-muted", "Points", "—"));
  }
  return tr;
}

function renderBoard(week, logos, used, pick, saving) {
  document.getElementById("board-title").textContent = `Week ${week.week} confidence board`;
  const root = document.getElementById("confidence");
  root.replaceChildren();
  const locked = Boolean(pick && kickedOff(week, pick.team));
  const games = [...week.games].sort((a, b) => b.rank - a.rank);
  const topRank = games[0]?.rank;
  for (const game of games) {
    const article = cell("article", game.rank === topRank ? "match is-top" : "match");
    article.style.setProperty("--accent", accent(game.favorite));
    if (pick?.team === game.favorite) article.classList.add("is-selected");
    article.append(cell("p", "match-rank", String(game.rank)));
    const body = cell("div", "min-w-0");
    const matchup = cell("div", "matchup");
    matchup.append(
      logo(logos, game.away),
      teamLabel(game.away, game.awayRecord),
      cell("span", "at", "at"),
      logo(logos, game.home),
      teamLabel(game.home, game.homeRecord),
    );
    const bar = cell("div", "confidence-bar");
    const fill = cell("span", "confidence-bar-fill");
    fill.style.width = `${game.winsPer100}%`;
    bar.append(fill);
    const action = cell("div");
    const started = kickedOff(week, game.favorite);
    const selected = pick?.team === game.favorite;
    if (used.has(game.favorite)) {
      action.append(cell("span", "status-note", "Already used"));
    } else if (!selected && (started || locked)) {
      action.append(cell("span", "status-note", started ? "Kickoff passed" : "Pick locked"));
    } else {
      const button = cell("button");
      button.type = "button";
      button.dataset.team = game.favorite;
      button.disabled = saving !== null || locked;
      button.className = selected ? "pick-btn is-selected" : "pick-btn is-quiet";
      button.textContent =
        saving === game.favorite ? "Saving…" : selected ? `${game.favorite} · Selected` : `Pick ${game.favorite}`;
      action.append(button);
    }
    body.append(matchup, bar, action);
    const score = cell("div", "match-prob");
    score.append(cell("strong", "", String(game.winsPer100)));
    score.append(cell("span", "", "wins / 100"));
    article.append(body, score);
    root.append(article);
  }
}

function renderUsed(weeks) {
  const list = document.getElementById("used-list");
  list.replaceChildren();
  for (const week of weeks) {
    if (week.status !== "final" || !week.pick) continue;
    const chip = cell("span", "chip", week.pick.team);
    chip.style.setProperty("--accent", accent(week.pick.short));
    list.append(chip);
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
    if (state.pick && kickedOff(openWeek, state.pick.team)) {
      showError("Kickoff has passed. This pick can no longer be changed.");
      return;
    }
    if (kickedOff(openWeek, team)) {
      showError("That team has already kicked off.");
      return;
    }
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
