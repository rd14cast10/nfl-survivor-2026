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

function notRecommendedTeams(planner) {
  return new Set(
    (planner?.alternatives || []).filter((alt) => alt.recommended === false).map((alt) => alt.team),
  );
}

function favoriteDot(game, used, notRecommended, canPick) {
  if (used.has(game.favorite)) return "used";
  if (notRecommended?.has(game.favorite) || !canPick) return "pass";
  return "pick";
}

function statusDot(kind) {
  const label = kind === "used" ? "Already used" : kind === "pick" ? "Available to pick" : "Not recommended";
  const dot = cell("span", `status-dot is-${kind}`);
  dot.setAttribute("role", "img");
  dot.setAttribute("aria-label", label);
  dot.append(cell("span", "status-dot-core"));
  return dot;
}

async function loadSeason() {
  const season = await fetch("data/season.json", { cache: "no-store" }).then((response) => {
    if (!response.ok) throw new Error("season");
    return response.json();
  });
  const weeks = await Promise.all(
    season.weeks.map(async (id) => {
      const response = await fetch(`data/weeks/${id}.json`, { cache: "no-store" });
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

function proj(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const rounded = Math.round(Number(value) * 10) / 10;
  const text = Math.abs(rounded).toFixed(1);
  if (rounded > 0) return `+${text}`;
  if (rounded < 0) return `−${text}`;
  return "0.0";
}

function pctLabel(value) {
  if (value == null) return "—";
  return `${Math.round(value * 100)}%`;
}

function kickoffLabel(iso) {
  if (!iso) return "Kickoff time not posted";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Kickoff time not posted";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  }).format(date);
}

function logoEl(logos, name, className) {
  const code = logos?.[name];
  if (!code) return null;
  const img = document.createElement("img");
  img.alt = "";
  img.className = className || "logo";
  img.src = `https://a.espncdn.com/i/teamlogos/nfl/500/${code}.png`;
  return img;
}

function scenarioFor(planner, pick) {
  if (!planner?.scenarios) return null;
  if (pick?.team && planner.scenarios[pick.team]) return planner.scenarios[pick.team];
  return planner.scenarios[""] || null;
}

function planRowFor(planner, pick, week) {
  return scenarioFor(planner, pick)?.weeks.find((row) => row.week === week) || null;
}

function scheduledGame(planner, week, team) {
  const entry = planner?.weeks?.find((item) => item.week === week);
  if (!entry || !team) return null;
  return entry.games.find((game) => game.home === team || game.away === team) || null;
}

function placeText(home, opponent) {
  if (!opponent) return "";
  return home ? `vs. ${opponent}` : `at ${opponent}`;
}

function renderCalendar(state) {
  const root = document.getElementById("calendar");
  if (!root) return;
  root.replaceChildren();
  root.classList.add("wx");
  const logos = state.season.logos;
  const rows = [];
  for (let number = 1; number <= 18; number += 1) {
    const record = state.weeks.find((week) => week.week === number);
    const row = { number, team: null, caption: "", tone: "", points: null, text: "", kind: "future", label: "" };
    if (record?.status === "final") {
      row.kind = "past";
      if (record.pick) {
        row.team = record.pick.short;
        row.caption = (record.pick.resultText || "").replace("–", "-");
        row.tone = record.pick.result === "loss" ? "loss" : record.pick.result === "win" ? "win" : "";
        row.points = record.pick.points ?? 0;
        row.text = record.pick.pointsText;
        row.label = `Week ${number}, ${record.pick.team}, ${record.pick.resultText}, ${record.pick.pointsText}`;
      } else {
        row.caption = "No pick"; row.tone = "loss"; row.points = -25; row.text = "−25";
        row.label = `Week ${number}, no pick recorded, minus 25`;
      }
    } else if (state.openWeek && number === state.openWeek.week) {
      row.kind = "open";
      const pick = state.pick;
      if (pick) {
        row.team = pick.team;
        const final = state.openWeek.finals?.[pick.team];
        if (pick.result) {
          row.caption = (final?.resultText || statusText(pick)).replace("–", "-");
          row.tone = pick.result === "loss" ? "loss" : "win";
          row.points = pick.points ?? 0;
          row.text = final?.pointsText || signed(pick.points ?? 0);
        } else {
          const plan = planRowFor(state.planner, pick, number);
          row.caption = "Your pick"; row.tone = "plan";
          if (plan?.team === pick.team) { row.points = plan.expectedPoints; row.text = proj(plan.expectedPoints); row.projected = true; }
          else row.text = "—";
        }
        row.label = `Week ${number}, your pick ${pick.team}`;
      } else {
        const plan = planRowFor(state.planner, null, number);
        row.caption = "Make pick"; row.tone = "make";
        if (plan?.team) { row.ghost = plan.team; row.points = plan.expectedPoints; row.text = proj(plan.expectedPoints); row.projected = true; }
        else row.text = "—";
        row.label = `Week ${number}, make a pick`;
      }
    } else {
      const plan = planRowFor(state.planner, state.pick, number);
      if (plan?.team) {
        row.team = plan.team;
        row.caption = pctLabel(plan.winProb).replace(/[^0-9%]/g, "") || `${Math.round(plan.winProb * 100)}%`;
        row.tone = "plan";
        row.points = plan.expectedPoints; row.text = proj(plan.expectedPoints); row.projected = true;
        row.label = `Week ${number}, recommended ${plan.team} ${placeText(plan.home, plan.opponent)}, ${pctLabel(plan.winProb)}, ${proj(plan.expectedPoints)} projected points`;
      } else { row.caption = "Planning"; row.text = "—"; row.label = `Week ${number}, recommendation unavailable`; }
    }
    rows.push(row);
  }
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.points ?? 0)));
  for (const row of rows) {
    const button = cell("button", `wx-row is-${row.kind}`);
    button.type = "button";
    button.dataset.week = String(row.number);
    if (row.kind === "open") button.id = "current-week-row";
    button.append(cell("span", "wx-week", `W${row.number}`));
    const icon = cell("span", "wx-icon");
    const logoTeam = row.team || row.ghost;
    const img = logoTeam ? logoEl(logos, logoTeam, "wx-logo") : null;
    if (img) { if (!row.team) img.classList.add("is-ghost"); icon.append(img); }
    else icon.append(cell("span", "wx-logo wx-blank"));
    const teamName = row.team || row.ghost || "";
    if (teamName) icon.append(cell("span", row.team ? "wx-team" : "wx-team is-ghost", teamName));
    icon.append(cell("span", `wx-cap tone-${row.tone || "muted"}`, row.caption));
    button.append(icon);
    const track = cell("span", "wx-track");
    track.append(cell("span", "wx-zero"));
    if (row.points !== null && row.points !== undefined) {
      const pct = Math.min(100, (Math.abs(row.points) / max) * 100);
      const bar = cell("span", `wx-bar ${row.points < 0 ? "neg" : "pos"}${row.projected ? " proj" : ""}`);
      bar.style.width = `${row.points === 0 ? 0 : Math.max(pct, 3)}%`;
      bar.style.left = "0";
      track.append(bar);
    }
    if (row.kind === "open") {
      const dot = cell("span", "wx-dot");
      const p = row.points ?? 0;
      dot.style.left = `${Math.max(0, Math.min(100, (Math.abs(p) / max) * 100))}%`;
      track.append(dot);
    }
    button.append(track);
    const pts = cell("span", `wx-pts${row.projected || row.points === null ? " is-proj" : ""}${!row.projected && (row.points ?? 0) < 0 ? " is-neg" : ""}`, row.text);
    button.append(pts);
    button.setAttribute("aria-label", row.label);
    root.append(button);
  }
}

function renderPastTile(button, week, logos) {
  button.classList.add("is-past");
  if (!week.pick) {
    button.append(cell("span", "tile-mark", "No pick"));
    button.append(cell("span", "badge badge-miss", "−25"));
    button.setAttribute("aria-label", `Week ${week.week}, no pick recorded, minus 25`);
    return;
  }
  const img = logoEl(logos, week.pick.short, "tile-logo");
  if (img) button.append(img);
  button.append(cell("span", "tile-team", week.pick.short));
  const badges = cell("span", "tile-badges");
  badges.append(resultBadge(week.pick.resultText, week.pick.result));
  button.append(badges);
  const negative = (week.pick.points ?? 0) < 0;
  button.append(cell("span", negative ? "tile-points points-loss" : "tile-points points-win", week.pick.pointsText));
  button.setAttribute("aria-label", `Week ${week.week}, ${week.pick.team}, ${week.pick.resultText}, ${week.pick.pointsText}`);
}

function renderOpenTile(button, week, pick, logos) {
  button.classList.add("is-open");
  button.id = "current-week-row";
  if (!pick) {
    button.classList.add("is-empty");
    button.append(cell("span", "tile-mark", "Make pick"));
    button.setAttribute("aria-label", `Week ${week.week}, make a pick`);
    return;
  }
  button.classList.add("is-yours");
  button.style.setProperty("--accent", accent(pick.team));
  const img = logoEl(logos, pick.team, "tile-logo");
  if (img) button.append(img);
  button.append(cell("span", "tile-team", pick.team));
  if (pick.result) {
    const final = week.finals?.[pick.team];
    const badges = cell("span", "tile-badges");
    badges.append(resultBadge(final?.resultText || statusText(pick), pick.result));
    button.append(badges);
    const negative = (pick.points ?? 0) < 0;
    button.append(cell("span", negative ? "tile-points points-loss" : "tile-points points-win", final?.pointsText || signed(pick.points ?? 0)));
  } else {
    button.append(cell("span", "badge badge-open", "Your pick"));
    button.append(cell("span", "tile-points points-muted", "Before kickoff"));
  }
  button.setAttribute("aria-label", `Week ${week.week}, your pick ${pick.team}`);
}

function renderFutureTile(button, row, logos, number) {
  button.classList.add("is-future");
  if (!row?.team) {
    button.append(cell("span", "tile-mark", "Planning"));
    button.setAttribute("aria-label", `Week ${number}, recommendation unavailable`);
    return;
  }
  button.classList.add("is-recommended");
  button.style.setProperty("--accent", accent(row.team));
  const img = logoEl(logos, row.team, "tile-logo");
  if (img) button.append(img);
  button.append(cell("span", "tile-team", row.team));
  button.append(cell("span", "badge badge-plan", "Recommended"));
  const negative = row.expectedPoints < 0;
  button.append(cell("span", negative ? "tile-points points-loss" : "tile-points points-win", proj(row.expectedPoints)));
  button.setAttribute(
    "aria-label",
    `Week ${row.week}, recommended ${row.team} ${placeText(row.home, row.opponent)}, ${pctLabel(row.winProb)}, ${proj(row.expectedPoints)} projected points`,
  );
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
  return TEAM_COLORS[name] || "#e4c88a";
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
  wrap.className = "badge-row";
  wrap.append(cell("span", `badge badge-${kind}`, score));
  if (bonus) wrap.append(cell("span", "badge badge-bonus", "Bonus"));
  return wrap;
}

function renderBoard(week, logos, used, pick, saving, notRecommended) {
  if (!document.getElementById("confidence")) return;
  document.getElementById("board-title").textContent = `Week ${week.week} confidence board`;
  const root = document.getElementById("confidence");
  root.replaceChildren();
  appendBoardGames(root, week, logos, used, pick, saving, notRecommended);
}

function appendBoardGames(root, week, logos, used, pick, saving, notRecommended) {
  const locked = Boolean(pick && kickedOff(week, pick.team));
  const games = [...week.games].sort((a, b) => b.rank - a.rank);
  const topRank = games[0]?.rank;
  for (const game of games) {
    const article = cell("article", game.rank === topRank ? "match is-top" : "match");
    article.style.setProperty("--accent", accent(game.favorite));
    if (pick?.team === game.favorite) article.classList.add("is-selected");
    article.append(cell("p", "match-rank", String(game.rank)));
    const body = cell("div", "min-w-0");
    const matchup = cell("div", "matchup matchup-rows");
    const awayRow = cell("div", "team-row");
    awayRow.append(cell("span", "at", ""), logo(logos, game.away), teamLabel(game.away, game.awayRecord));
    const homeRow = cell("div", "team-row");
    homeRow.append(cell("span", "at", "at"), logo(logos, game.home), teamLabel(game.home, game.homeRecord));
    matchup.append(awayRow, homeRow);
    const bar = cell("div", "confidence-bar");
    const fill = cell("span", "confidence-bar-fill");
    fill.style.width = `${game.winsPer100}%`;
    bar.append(fill);
    const action = cell("div");
    const started = kickedOff(week, game.favorite);
    const selected = pick?.team === game.favorite;
    const canPick = selected || !(started || locked);
    if (used.has(game.favorite)) {
      // The red dot under the score is the used marker. No pick button.
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
    const kind = favoriteDot(game, used, notRecommended, canPick);
    const score = cell("div", `match-prob is-${kind}`);
    score.append(cell("strong", "", String(game.winsPer100)));
    score.append(cell("span", "", "wins / 100"));
    score.append(statusDot(kind));
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
  const usedEl = document.getElementById("stat-used");
  if (usedEl) usedEl.textContent = String(usedCount);
  const remainEl = document.getElementById("stat-remain");
  if (remainEl) remainEl.textContent = `${season.teamCount - usedCount} remain eligible`;
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

const CLOUD_URL = "https://zpkrbojtjcuubtjktzat.supabase.co";
const CLOUD_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpwa3Jib2p0amN1dWJ0amt0emF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIyMjIyMTQsImV4cCI6MjEwNzc5ODIxNH0.eV_VQ6cMZHgzid-a8LUMyCOch4L2KdIzJpFky6ELHp0";
const cloudHeaders = { apikey: CLOUD_KEY, Authorization: `Bearer ${CLOUD_KEY}`, "Content-Type": "application/json" };

async function cloudRead(weekNumber) {
  const response = await fetch(`${CLOUD_URL}/rest/v1/picks?week=eq.${weekNumber}&select=team,updated_at`, { headers: cloudHeaders, cache: "no-store" });
  if (!response.ok) throw new Error("cloud read failed");
  const rows = await response.json();
  return rows[0] || null;
}

async function cloudSave(weekNumber, team) {
  const response = await fetch(`${CLOUD_URL}/rest/v1/rpc/save_pick`, {
    method: "POST",
    headers: cloudHeaders,
    body: JSON.stringify({ p_week: weekNumber, p_team: team }),
  });
  if (!response.ok) throw new Error("cloud save failed");
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

function safely(fn) {
  try { fn(); } catch (error) { /* section not on this page */ }
}

function renderBoardLink(state) {
  const link = document.getElementById("board-link");
  if (!link) return;
  const week = state.openWeek;
  const games = [...week.games].sort((a, b) => b.rank - a.rank);
  const top = games[0];
  document.getElementById("board-link-title").textContent = `Week ${week.week} confidence board`;
  document.getElementById("board-link-pick").textContent = state.pick ? `Your pick: ${state.pick.team}` : "No pick yet";
  document.getElementById("board-link-meta").textContent = top
    ? `${games.length} games · Top pick ${top.favorite}, ${top.winsPer100} wins per 100`
    : `${games.length} games`;
}

function paint(state) {
  safely(() => renderStats(state.season, state.weeks, state.pick));
  safely(() => renderCalendar(state));
  safely(() => renderBoard(state.openWeek, state.season.logos, state.used, state.pick, state.saving, notRecommendedTeams(state.planner)));
  safely(() => renderBoardLink(state));
  safely(() => renderUsed(state.weeks));
  safely(() => renderPlanner(state));
  if (state.modalWeek) fillModal(state);
}

function modalStat(label, value) {
  const box = cell("div", "modal-stat");
  box.append(cell("span", "", label), cell("strong", "", value));
  return box;
}

function appendMatchup(parent, logos, team, opponent, home) {
  const row = cell("div", "modal-matchup");
  const left = logoEl(logos, team, "modal-logo");
  const right = logoEl(logos, opponent, "modal-logo");
  if (left) row.append(left);
  row.append(cell("span", "at", home ? "vs" : "at"));
  if (right) row.append(right);
  parent.append(row);
}

function fillPastModal(state, week, title, body) {
  if (!week.pick) {
    title.textContent = "No pick recorded";
    body.append(cell("p", "modal-why", "This week was left blank, so it scores −25."));
    return;
  }
  title.textContent = week.pick.team;
  const game = scheduledGame(state.planner, week.week, week.pick.short);
  const opponent = game ? (game.home === week.pick.short ? game.away : game.home) : null;
  const home = game ? game.home === week.pick.short : String(week.pick.opponent || "").startsWith("vs");
  if (opponent) appendMatchup(body, state.season.logos, week.pick.short, opponent, home);
  body.append(cell("p", "opponent", week.pick.opponent));
  body.append(cell("p", "hint", kickoffLabel(game?.kickoff)));
  const badges = cell("div", "tile-badges");
  badges.append(resultBadge(week.pick.resultText, week.pick.result));
  body.append(badges);
  const negative = (week.pick.points ?? 0) < 0;
  body.append(cell("p", negative ? "tile-points points-loss" : "tile-points points-win", week.pick.pointsText));
}

function fillFutureModal(state, weekNumber, title, body) {
  const row = planRowFor(state.planner, state.pick, weekNumber);
  if (!row?.team) {
    title.textContent = "Plan unavailable";
    body.append(cell("p", "modal-why", "This week does not have a recommendation yet."));
    return;
  }
  title.textContent = row.team;
  body.append(cell("p", "badge badge-plan", "Recommended"));
  appendMatchup(body, state.season.logos, row.team, row.opponent, row.home);
  body.append(cell("p", "opponent", placeText(row.home, row.opponent)));
  body.append(cell("p", "hint", kickoffLabel(row.kickoff)));
  const stats = cell("div", "modal-stats");
  stats.append(
    modalStat("Win chance", pctLabel(row.winProb)),
    modalStat("Expected margin", proj(row.expectedMargin)),
    modalStat("Projected points", proj(row.expectedPoints)),
  );
  body.append(stats);
  body.append(cell("p", "modal-why", row.why));
  if (row.source) body.append(cell("p", "modal-source", row.source));
}

function renderModalPickers(parent, state) {
  const { openWeek, used, pick, saving } = state;
  const locked = Boolean(pick && kickedOff(openWeek, pick.team));
  parent.append(cell("h3", "modal-pick-title", `Week ${openWeek.week} NFELO confidence board`));
  parent.append(cell("p", "hint", locked
    ? "Kickoff has passed. This pick can no longer be changed."
    : "Tap an eligible projected winner to save your pick."));
  const board = cell("div", "board modal-board");
  appendBoardGames(board, openWeek, state.season.logos, used, pick, saving, notRecommendedTeams(state.planner));
  parent.append(board);
}

function fillOpenModal(state, title, body) {
  const { openWeek, pick, planner, season } = state;
  const recommended = planRowFor(planner, null, openWeek.week);
  const lockedRow = pick ? planRowFor(planner, pick, openWeek.week) : null;
  const lead = pick?.team || recommended?.team;
  title.textContent = lead || `Week ${openWeek.week}`;
  if (!pick && recommended?.team) body.append(cell("p", "badge badge-plan", "Recommended"));
  if (pick && !pick.result) body.append(cell("p", "badge badge-open", "Your pick"));
  const game = scheduledGame(planner, openWeek.week, lead);
  const opponent = pick ? (game ? (game.home === pick.team ? game.away : game.home) : null) : recommended?.opponent;
  const home = pick ? (game ? game.home === pick.team : false) : Boolean(recommended?.home);
  if (lead && opponent) appendMatchup(body, season.logos, lead, opponent, home);
  if (pick) body.append(cell("p", "opponent", opponentText(openWeek, pick.team) || placeText(home, opponent)));
  else if (recommended) body.append(cell("p", "opponent", placeText(recommended.home, recommended.opponent)));
  body.append(cell("p", "hint", kickoffLabel(game?.kickoff || recommended?.kickoff)));
  if (pick?.result) {
    const final = openWeek.finals?.[pick.team];
    const badges = cell("div", "tile-badges");
    badges.append(resultBadge(final?.resultText || statusText(pick), pick.result));
    body.append(badges);
    body.append(cell("p", (pick.points ?? 0) < 0 ? "tile-points points-loss" : "tile-points points-win", final?.pointsText || signed(pick.points ?? 0)));
  } else {
    const row = pick ? lockedRow || recommended : recommended;
    if (row) {
      const stats = cell("div", "modal-stats");
      stats.append(
        modalStat("Win chance", pctLabel(row.winProb)),
        modalStat("Expected margin", proj(row.expectedMargin)),
        modalStat("Projected points", proj(row.expectedPoints)),
      );
      body.append(stats);
      body.append(cell("p", "modal-why", row.why));
      if (row.source) body.append(cell("p", "modal-source", row.source));
    }
  }
  if (pick && recommended && pick.team !== recommended.team && !pick.result) {
    body.append(cell("p", "hint", `The open plan would use ${recommended.team} ${placeText(recommended.home, recommended.opponent)} instead.`));
  }
  renderModalPickers(body, state);
}

function fillModal(state) {
  if (!state.modalWeek) return;
  const title = document.getElementById("modal-title");
  const kicker = document.getElementById("modal-kicker");
  const body = document.getElementById("modal-body");
  if (!title || !body) return;
  kicker.textContent = `Week ${padWeek(state.modalWeek)}`;
  body.replaceChildren();
  const record = state.weeks.find((week) => week.week === state.modalWeek);
  if (record?.status === "final") fillPastModal(state, record, title, body);
  else if (state.openWeek && state.modalWeek === state.openWeek.week) fillOpenModal(state, title, body);
  else fillFutureModal(state, state.modalWeek, title, body);
}

function openModal(state, weekNumber, trigger) {
  state.modalWeek = weekNumber;
  state.modalTrigger = trigger || null;
  const root = document.getElementById("pick-modal");
  root.hidden = false;
  document.body.classList.add("modal-open");
  fillModal(state);
  document.getElementById("modal-close")?.focus();
}

function closeModal(state) {
  const root = document.getElementById("pick-modal");
  if (!root || root.hidden) return;
  root.hidden = true;
  document.body.classList.remove("modal-open");
  const trigger = state.modalTrigger;
  state.modalWeek = null;
  state.modalTrigger = null;
  trigger?.focus();
}

function renderPlanner(state) {
  const summary = document.getElementById("planner-summary");
  const alts = document.getElementById("planner-alts");
  const sources = document.getElementById("planner-sources");
  if (!summary || !alts || !sources) return;
  const { planner, pick, openWeek } = state;
  alts.replaceChildren();
  sources.replaceChildren();
  if (!planner) {
    summary.textContent = "The season plan could not be loaded.";
    return;
  }
  const scenario = scenarioFor(planner, pick);
  let total = scenario?.total ?? 0;
  if (pick?.points != null && scenario) {
    const row = scenario.weeks.find((item) => item.week === openWeek.week);
    if (row) total = scenario.total - row.expectedPoints + pick.points;
  }
  const lockNote = pick?.team
    ? ` Week ${openWeek.week} is locked to ${pick.team}.`
    : ` Week ${openWeek.week} is still open.`;
  summary.textContent = `${planner.scoringNote || ""}${lockNote} Remaining projection ${proj(total)}.`;
  for (const alt of planner.alternatives || []) {
    const card = cell("button", "alt-card");
    card.type = "button";
    card.dataset.week = String(openWeek.week);
    if (alt.recommended) card.classList.add("is-recommended");
    if (pick?.team === alt.team) card.classList.add("is-yours");
    card.style.setProperty("--accent", accent(alt.team));
    const img = logoEl(state.season.logos, alt.team, "tile-logo");
    if (img) card.append(img);
    card.append(cell("span", "tile-team", alt.team));
    card.append(cell("span", "opponent", placeText(alt.home, alt.opponent)));
    card.append(cell("span", alt.recommended ? "badge badge-plan" : "badge badge-open", alt.recommended ? "Recommended" : "Alternative"));
    card.append(cell("span", "alt-line", `${pctLabel(alt.winProb)} · ${proj(alt.expectedPoints)} this week · ${proj(alt.seasonTotal)} remaining`));
    card.append(cell("span", "alt-why", alt.why));
    card.setAttribute("aria-label", `${alt.team}, ${alt.recommended ? "recommended" : "alternative"} for week ${openWeek.week}`);
    alts.append(card);
  }
  if (pick?.team && !(planner.alternatives || []).some((alt) => alt.team === pick.team)) {
    alts.append(cell("p", "hint alt-note", `${pick.team} is the saved Week ${openWeek.week} pick, outside these three alternatives. Later weeks move around that choice.`));
  }
  if (planner.updated) sources.append(document.createTextNode(`Updated ${kickoffLabel(planner.updated)}. `));
  for (const source of planner.sources || []) {
    const link = cell("a", "external", source.label);
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    sources.append(link, document.createTextNode(`. ${source.detail} `));
  }
  if (planner.model?.note) sources.append(document.createTextNode(planner.model.note));
}

async function chooseTeam(state, button) {
  const team = button.getAttribute("data-team");
  const { openWeek, used } = state;
  if (!team || state.saving) return;
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
    try { localStorage.setItem(openWeek.storageKey, JSON.stringify(pick)); } catch {}
    await cloudSave(openWeek.week, team);
    state.pick = pick;
    if (button.closest("#confidence")) {
      document.getElementById("weekly")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  } catch {
    showError("Couldn't save your pick online. Check your connection and tap it again.");
  } finally {
    state.saving = null;
    paint(state);
  }
}

async function main() {
  let season;
  let weeks;
  let planner = null;
  try {
    const loaded = await Promise.all([
      loadSeason(),
      fetch("data/planner.json", { cache: "no-store" }).then((response) => (response.ok ? response.json() : null)).catch(() => null),
    ]);
    ({ season, weeks } = loaded[0]);
    planner = loaded[1];
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
  let stored = readStored(openWeek, used);
  try {
    const remote = await cloudRead(openWeek.week);
    if (remote?.team) {
      const pick = materialize(openWeek, used, remote.team, Date.parse(remote.updated_at) || Date.now());
      if (pick) {
        stored = { pick };
        try { localStorage.setItem(openWeek.storageKey, JSON.stringify(pick)); } catch {}
      }
    } else if (stored.pick) {
      cloudSave(openWeek.week, stored.pick.team).catch(() => {});
    }
  } catch {
    /* offline: fall back to this device's saved pick */
  }
  const state = {
    season,
    weeks,
    openWeek,
    used,
    planner,
    pick: stored.pick || null,
    saving: null,
    modalWeek: null,
    modalTrigger: null,
  };
  if (stored.error) showError(stored.error);
  paint(state);

  document.body.addEventListener("click", (event) => {
    if (event.target.closest("#modal-close")) {
      closeModal(state);
      return;
    }
    if (event.target.id === "pick-modal") {
      closeModal(state);
      return;
    }
    const opener = event.target.closest("[data-week]");
    if (opener && opener.closest("#calendar, #planner-alts")) {
      openModal(state, Number(opener.dataset.week), opener);
      return;
    }
    const button = event.target.closest("button[data-team]");
    if (!button || !button.closest("#confidence, #pick-modal")) return;
    chooseTeam(state, button);
  });

  document.addEventListener("keydown", (event) => {
    const root = document.getElementById("pick-modal");
    if (!root || root.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeModal(state);
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...root.querySelectorAll("button, a[href]")].filter((el) => !el.disabled);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}

main();


// Top tab bar: Home / NFELO / Other (index page only switches panels)
(function setupTabs() {
  const panels = document.querySelectorAll(".tab-panel");
  if (!panels.length) return;
  const tabs = document.querySelectorAll(".tabbar .tab");
  const show = () => {
    let key = (location.hash || "#home").slice(1);
    if (![...panels].some((p) => p.dataset.panel === key)) key = "home";
    panels.forEach((p) => { p.hidden = p.dataset.panel !== key; });
    tabs.forEach((t) => {
      const on = t.dataset.tab === key;
      t.classList.toggle("is-active", on);
      if (on) t.setAttribute("aria-current", "page"); else t.removeAttribute("aria-current");
    });
  };
  window.addEventListener("hashchange", () => { show(); window.scrollTo({ top: 0 }); });
  show();
})();

(function setupSidebar() {
  const frame = document.querySelector(".app-frame");
  const toggle = document.querySelector(".sidebar-toggle");
  const scrim = document.querySelector(".sidebar-scrim");
  if (!frame || !toggle) return;
  const setOpen = (open) => {
    frame.classList.toggle("is-nav-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    if (scrim) scrim.hidden = !open;
  };
  toggle.addEventListener("click", () => setOpen(!frame.classList.contains("is-nav-open")));
  if (scrim) scrim.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setOpen(false);
  });
  document.querySelectorAll(".tabbar .tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      if (window.matchMedia("(max-width: 699px)").matches) setOpen(false);
    });
  });
})();
