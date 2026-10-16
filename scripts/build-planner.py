#!/usr/bin/env python3
"""Build data/planner.json for the remaining 2026 survivor season.

Reads local week files for teams already used and whether the bonus pick is
still open. Pulls the regular-season schedule, kickoff times, and DraftKings
spreads from ESPN, and ESPN FPI ratings for games without a posted line.
The current open week also uses NFELO win probabilities from that week file.
"""

from __future__ import annotations

import json
import math
import random
import re
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEASON_PATH = ROOT / "data" / "season.json"
WEEKS_DIR = ROOT / "data" / "weeks"
OUT_PATH = ROOT / "data" / "planner.json"

SIGMA = 13.5
HOME_FIELD = 2.5
SKIP_POINTS = -25.0
REGULAR_SEASON_WEEKS = 18
UA = "Mozilla/5.0 (compatible; nfl-survivor-planner/1.0)"

ABBR_TO_SHORT = {
    "ARI": "Arizona",
    "ATL": "Atlanta",
    "BAL": "Baltimore",
    "BUF": "Buffalo",
    "CAR": "Carolina",
    "CHI": "Chicago",
    "CIN": "Cincinnati",
    "CLE": "Cleveland",
    "DAL": "Dallas",
    "DEN": "Denver",
    "DET": "Detroit",
    "GB": "Green Bay",
    "HOU": "Houston",
    "IND": "Indianapolis",
    "JAX": "Jacksonville",
    "KC": "Kansas City",
    "LAC": "L.A. Chargers",
    "LAR": "L.A. Rams",
    "LA": "L.A. Rams",
    "LV": "Las Vegas",
    "OAK": "Las Vegas",
    "MIA": "Miami",
    "MIN": "Minnesota",
    "NE": "New England",
    "NO": "New Orleans",
    "NYG": "New York Giants",
    "NYJ": "N.Y. Jets",
    "PHI": "Philadelphia",
    "PIT": "Pittsburgh",
    "SF": "San Francisco",
    "SEA": "Seattle",
    "TB": "Tampa Bay",
    "TEN": "Tennessee",
    "WAS": "Washington",
    "WSH": "Washington",
}


def normsinv(p: float) -> float:
    """Inverse standard-normal CDF (Peter Acklam's approximation)."""
    if p <= 0.0 or p >= 1.0:
        raise ValueError(p)
    a = (
        -3.969683028665376e01,
        2.209460984245205e02,
        -2.759285104469687e02,
        1.383577518672690e02,
        -3.066479806614716e01,
        2.506628277459239e00,
    )
    b = (
        -5.447609879822406e01,
        1.615858368580409e02,
        -1.556989798598866e02,
        6.680131188771972e01,
        -1.328068155288572e01,
    )
    c = (
        -7.784894002430293e-03,
        -3.223964580411365e-01,
        -2.400758277161838e00,
        -2.549732539343734e00,
        4.374664141464968e00,
        2.938163982698783e00,
    )
    d = (
        7.784695709041462e-03,
        3.224671290700398e-01,
        2.445134137142996e00,
        3.754408661907416e00,
    )
    plow = 0.02425
    phigh = 1 - plow
    if p < plow:
        q = math.sqrt(-2 * math.log(p))
        return (
            (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
            / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
        )
    if p > phigh:
        q = math.sqrt(-2 * math.log(1 - p))
        return -(
            (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
            / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
        )
    q = p - 0.5
    r = q * q
    return (
        (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5])
        * q
        / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    )


def phi(z: float) -> float:
    return math.exp(-0.5 * z * z) / math.sqrt(2 * math.pi)


def Phi(z: float) -> float:
    return 0.5 * (1 + math.erf(z / math.sqrt(2)))


def expected_points(mu: float, sigma: float = SIGMA, bonus: bool = False) -> float:
    """Expected survivor points if the margin is Normal(mu, sigma).

    A win scores +1 per point of margin (+2 with the bonus). A loss scores
    −2 per point (−4 with the bonus). Ties have probability zero under a
    continuous margin.
    """
    z = mu / sigma
    p = Phi(z)
    density = phi(z)
    if bonus:
        return mu * (4 - 2 * p) - 2 * sigma * density
    return mu * (2 - p) - sigma * density


def assign_min(cost: list[list[float]]) -> list[int]:
    """Minimum-cost assignment. Rows may be fewer than columns."""
    n = len(cost)
    if n == 0:
        return []
    m = len(cost[0])
    if m < n:
        raise ValueError("assignment needs at least as many columns as rows")
    u = [0.0] * (n + 1)
    v = [0.0] * (m + 1)
    p = [0] * (m + 1)
    way = [0] * (m + 1)
    for i in range(1, n + 1):
        p[0] = i
        j0 = 0
        minv = [float("inf")] * (m + 1)
        used = [False] * (m + 1)
        while True:
            used[j0] = True
            i0 = p[j0]
            delta = float("inf")
            j1 = 0
            for j in range(1, m + 1):
                if used[j]:
                    continue
                cur = cost[i0 - 1][j - 1] - u[i0] - v[j]
                if cur < minv[j]:
                    minv[j] = cur
                    way[j] = j0
                if minv[j] < delta:
                    delta = minv[j]
                    j1 = j
            if not math.isfinite(delta):
                raise RuntimeError("assignment row has no finite cost")
            for j in range(m + 1):
                if used[j]:
                    u[p[j]] += delta
                    v[j] -= delta
                else:
                    minv[j] -= delta
            j0 = j1
            if p[j0] == 0:
                break
        while True:
            j1 = way[j0]
            p[j0] = p[j1]
            j0 = j1
            if j0 == 0:
                break
    result = [-1] * n
    for j in range(1, m + 1):
        if p[j]:
            result[p[j] - 1] = j - 1
    if any(col < 0 for col in result):
        raise RuntimeError("assignment left a row empty")
    return result


def solve_assignment(week_ids, teams, value_of, skip_points=SKIP_POINTS):
    teams = list(teams)
    columns = teams + [f"__skip_{week}" for week in week_ids]
    cost = []
    for week in week_ids:
        row = []
        for team in teams:
            value = value_of(week, team)
            row.append(1e7 if value is None else -float(value))
        for skip_week in week_ids:
            row.append(-skip_points if skip_week == week else 1e7)
        cost.append(row)
    chosen = assign_min(cost)
    picks = []
    for col in chosen:
        name = columns[col]
        picks.append(None if str(name).startswith("__skip_") else name)
    return picks


def optimize(week_ids, teams, value_of, bonus_value_of=None, lock=None):
    """Return (total, rows) with one team or a blank for every week."""

    def assemble(fixed):
        fixed_weeks = {week for week, _team, _bonus in fixed}
        fixed_teams = {team for _week, team, _bonus in fixed if team}
        rows = [week for week in week_ids if week not in fixed_weeks]

        def val(week, team):
            if team in fixed_teams:
                return None
            return value_of(week, team)

        chosen = solve_assignment(rows, teams, val) if rows else []
        plan = {week: (team, False) for week, team in zip(rows, chosen)}
        for week, team, is_bonus in fixed:
            plan[week] = (team, is_bonus)
        detail = []
        total = 0.0
        for week in week_ids:
            team, is_bonus = plan[week]
            if team is None:
                points = SKIP_POINTS
            elif is_bonus:
                points = bonus_value_of(week, team)
            else:
                points = value_of(week, team)
                if points is None:
                    raise RuntimeError(f"missing value for locked {team} in week {week}")
            total += points
            detail.append({"week": week, "team": team, "bonus": is_bonus, "points": points})
        return total, detail

    candidates = []
    if lock:
        lock_week, lock_team = lock
        if bonus_value_of is not None and bonus_value_of(lock_week, lock_team) is not None:
            candidates.append(assemble([(lock_week, lock_team, True)]))
        if value_of(lock_week, lock_team) is not None or True:
            # The saved team is fixed even when the pregame number is all we have.
            if value_of(lock_week, lock_team) is None:
                raise RuntimeError(f"no projection for locked {lock_team} in week {lock_week}")
            candidates.append(assemble([(lock_week, lock_team, False)]))
        if bonus_value_of is not None:
            for week in week_ids:
                if week == lock_week:
                    continue
                for team in teams:
                    if team == lock_team or bonus_value_of(week, team) is None:
                        continue
                    candidates.append(assemble([(lock_week, lock_team, False), (week, team, True)]))
    elif bonus_value_of is not None:
        for week in week_ids:
            for team in teams:
                if bonus_value_of(week, team) is None:
                    continue
                candidates.append(assemble([(week, team, True)]))
    else:
        candidates.append(assemble([]))
    if not candidates:
        raise RuntimeError("no feasible plan")
    return max(candidates, key=lambda item: item[0])


def fmt_points(value: float) -> str:
    rounded = round(value, 1)
    text = f"{abs(rounded):.1f}"
    if rounded > 0:
        return f"+{text}"
    if rounded < 0:
        return f"−{text}"
    return "0.0"


def fmt_margin(value: float) -> str:
    rounded = round(value, 1)
    text = f"{abs(rounded):.1f}"
    return f"+{text}" if rounded > 0 else f"−{text}" if rounded < 0 else "0.0"


def get_json(url: str):
    request = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    last_error = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=40) as response:
                return json.load(response)
        except Exception as error:  # noqa: BLE001 - retry any transport failure
            last_error = error
            time.sleep(0.8 * (attempt + 1))
    raise RuntimeError(f"failed to fetch {url}: {last_error}")


def short_name(abbreviation: str) -> str:
    if abbreviation not in ABBR_TO_SHORT:
        raise KeyError(f"unknown team abbreviation {abbreviation}")
    return ABBR_TO_SHORT[abbreviation]


def load_local():
    season = json.loads(SEASON_PATH.read_text())
    weeks = []
    for name in sorted(WEEKS_DIR.glob("*.json")):
        weeks.append(json.loads(name.read_text()))
    weeks.sort(key=lambda week: week["week"])
    used = []
    bonus_week = None
    for week in weeks:
        pick = week.get("pick")
        if week.get("status") == "final" and pick and pick.get("short"):
            used.append(pick["short"])
        text = (pick or {}).get("resultText") or ""
        if "Bonus" in text:
            bonus_week = week["week"]
    open_week = next((week for week in weeks if week.get("status") == "open"), None)
    return season, weeks, used, bonus_week, open_week


def parse_spread(odds: dict, home: str, away: str) -> float:
    details = odds.get("details") or ""
    match = re.search(r"([A-Z]{2,4})\s*([+-]?\d+(?:\.\d+)?)", details)
    if not match:
        raise ValueError(f"unreadable spread {details!r}")
    favorite = short_name(match.group(1))
    margin = abs(float(match.group(2)))
    if favorite == home:
        return margin
    if favorite == away:
        return -margin
    raise ValueError(f"spread favorite {favorite} is not in {away} at {home}")


def fetch_inputs():
    fpi_payload = get_json(
        "https://site.web.api.espn.com/apis/fitt/v3/sports/football/nfl/powerindex?season=2026&limit=50"
    )
    ratings = {}
    for row in fpi_payload["teams"]:
        ratings[short_name(row["team"]["abbreviation"])] = float(row["categories"][0]["values"][0])
    if len(ratings) != 32:
        raise RuntimeError(f"expected 32 FPI teams, got {len(ratings)}")

    def fetch_week(week: int):
        url = (
            "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"
            f"?dates=2026&seasontype=2&week={week}"
        )
        return week, get_json(url)

    weeks = {}
    with ThreadPoolExecutor(max_workers=6) as pool:
        for week, payload in pool.map(fetch_week, range(1, REGULAR_SEASON_WEEKS + 1)):
            events = payload.get("events") or []
            if len(events) < 13:
                raise RuntimeError(f"week {week} returned {len(events)} games")
            weeks[week] = events
    return ratings, weeks, fpi_payload.get("lastUpdated")


def build_games(events, ratings, nfelo, week_number: int):
    games = []
    for event in events:
        competition = event["competitions"][0]
        teams = {side["homeAway"]: side for side in competition["competitors"]}
        home = short_name(teams["home"]["team"]["abbreviation"])
        away = short_name(teams["away"]["team"]["abbreviation"])
        status = competition.get("status", {}).get("type", {}).get("name") or ""
        started = status != "STATUS_SCHEDULED"
        neutral = bool(competition.get("neutralSite"))
        kickoff = competition.get("date") or event.get("date")
        odds = (competition.get("odds") or [None])[0]
        if odds and odds.get("details"):
            mu_home = parse_spread(odds, home, away)
            margin_source = "DraftKings"
        else:
            hfa = 0.0 if neutral else HOME_FIELD
            mu_home = ratings[home] - ratings[away] + hfa
            margin_source = "ESPN FPI"
        game = {
            "away": away,
            "home": home,
            "kickoff": kickoff,
            "neutral": neutral,
            "started": started,
            "options": [],
        }
        for team, mu in ((home, mu_home), (away, -mu_home)):
            opponent = away if team == home else home
            win_prob = Phi(mu / SIGMA)
            nfelo_prob = None
            if team in nfelo:
                nfelo_prob = nfelo[team]
            elif opponent in nfelo:
                nfelo_prob = 1 - nfelo[opponent]
            if margin_source == "DraftKings" and nfelo_prob is not None:
                source = "DraftKings spread via ESPN; NFELO win probability on the side"
            elif margin_source == "DraftKings":
                source = "DraftKings spread via ESPN"
            elif nfelo_prob is not None:
                source = "ESPN FPI margin; NFELO win probability on the side"
            else:
                source = "ESPN FPI"
            game["options"].append(
                {
                    "team": team,
                    "opponent": opponent,
                    "home": team == home,
                    "winProb": round(win_prob, 4),
                    "nfeloWinProb": None if nfelo_prob is None else round(nfelo_prob, 4),
                    "expectedMargin": round(mu, 2),
                    "expectedPoints": round(expected_points(mu), 2),
                    "bonusPoints": round(expected_points(mu, bonus=True), 2),
                    "source": source,
                    "available": not started,
                    "kickoff": kickoff,
                }
            )
        games.append(game)
    return games


def index_options(games):
    found = {}
    for game in games:
        for option in game["options"]:
            found[option["team"]] = option
    return found


def make_why(choice, options, later, blocked):
    if choice["team"] is None:
        return "Every remaining team projects worse than the −25 for leaving this week blank."
    place = "at home against" if choice["home"] else "at"
    sentence = (
        f"{choice['team']} is {place} {choice['opponent']}, "
        f"a {fmt_margin(choice['expectedMargin'])} expected margin "
        f"({round(choice['winProb'] * 100)}% to win) and about {fmt_points(choice['expectedPoints'])} points."
    )
    nfelo_prob = choice.get("nfeloWinProb")
    if nfelo_prob is not None and abs(nfelo_prob - choice["winProb"]) >= 0.04:
        sentence += f" NFELO has the win chance at {round(nfelo_prob * 100)}%."
    rivals = [
        option
        for option in options
        if option["available"] and option["team"] != choice["team"] and option["team"] not in blocked
    ]
    rivals.sort(key=lambda option: option["expectedPoints"], reverse=True)
    best = rivals[0] if rivals else None
    if best and best["expectedPoints"] > choice["expectedPoints"] + 0.05:
        saved = later.get(best["team"])
        if saved and saved < choice["week"]:
            sentence += f" {best['team']} projects more here, and the plan already uses them in Week {saved}."
        elif saved and saved > choice["week"]:
            sentence += f" {best['team']} projects more here and is saved for Week {saved}."
        else:
            sentence += (
                f" {best['team']} projects more in this week alone, "
                "but using that team lowers the rest of the season."
            )
    else:
        sentence += " Highest projected total still available this week."
    if choice.get("bonus"):
        sentence += " This is the season's bonus pick, so a win is doubled and a loss counts four times."
    return sentence


def materialize(detail_rows, by_week, bonus_used, blocked):
    later = {}
    for row in detail_rows:
        if row["team"]:
            later[row["team"]] = row["week"]
    output = []
    for row in detail_rows:
        options = []
        for game in by_week[row["week"]]["games"]:
            options.extend(game["options"])
        chosen = next((option for option in options if option["team"] == row["team"]), None)
        if row["team"] is None or chosen is None:
            output.append(
                {
                    "week": row["week"],
                    "team": None,
                    "opponent": None,
                    "home": False,
                    "winProb": None,
                    "expectedMargin": None,
                    "expectedPoints": SKIP_POINTS,
                    "kickoff": None,
                    "source": "",
                    "why": make_why({"team": None}, [], later, blocked),
                    "bonus": False,
                    "started": False,
                }
            )
            continue
        record = {
            "week": row["week"],
            "team": chosen["team"],
            "opponent": chosen["opponent"],
            "home": chosen["home"],
            "winProb": chosen["winProb"],
            "expectedMargin": chosen["expectedMargin"],
            "expectedPoints": round(row["points"], 2),
            "kickoff": chosen["kickoff"],
            "source": chosen["source"],
            "bonus": row["bonus"],
            "started": not chosen["available"],
        }
        record["why"] = make_why(
            {**chosen, "week": row["week"], "bonus": row["bonus"], "expectedPoints": row["points"]},
            options,
            later,
            blocked,
        )
        if bonus_used and row["bonus"]:
            record["why"] += " Bonus scoring is applied on this pick."
        output.append(record)
    return output


def self_test():
    if abs(normsinv(0.975) - 1.95996398454) > 1e-6:
        raise AssertionError("normsinv")
    if abs(Phi(normsinv(0.87)) - 0.87) > 1e-6:
        raise AssertionError("normal round trip")
    samples = [random.gauss(10, SIGMA) for _ in range(40000)]
    simulated = []
    for margin in samples:
        if margin > 0:
            simulated.append(margin)
        elif margin < 0:
            simulated.append(2 * margin)
    if abs(sum(simulated) / len(simulated) - expected_points(10)) > 0.25:
        raise AssertionError("expected points formula")
    # Known minimum of [[1,2,3],[2,4,6],[3,6,9]] is 10.
    columns = assign_min([[1, 2, 3], [2, 4, 6], [3, 6, 9]])
    total = sum([[1, 2, 3], [2, 4, 6], [3, 6, 9]][i][col] for i, col in enumerate(columns))
    if total != 10:
        raise AssertionError(f"hungarian total {total}")
    values = {
        1: {"A": 10, "B": 1},
        2: {"A": 10, "B": 9},
    }

    def value_of(week, team):
        return values[week].get(team)

    picks = solve_assignment([1, 2], ["A", "B"], value_of)
    if picks != ["A", "B"]:
        raise AssertionError(f"opportunity cost {picks}")
    # Bonus belongs on A's bigger week, with B taking the other week.
    def bonus_of(week, team):
        table = {1: {"A": 30, "B": 12}, 2: {"A": 18, "B": 11}}
        return table[week].get(team)

    total, detail = optimize([1, 2], ["A", "B"], value_of, bonus_of)
    chosen = {(row["week"], row["team"], row["bonus"]) for row in detail}
    if abs(total - 39) > 1e-6 or (1, "A", True) not in chosen or (2, "B", False) not in chosen:
        raise AssertionError(f"bonus plan {total} {detail}")
    random.seed(4)
    for _ in range(30):
        weeks = [1, 2, 3, 4]
        teams = ["A", "B", "C", "D", "E", "F"]
        matrix = {
            week: {team: random.uniform(-20, 20) for team in teams} for week in weeks
        }

        def brute():
            best = None

            def walk(index, used, score, picks):
                nonlocal best
                if index == len(weeks):
                    if best is None or score > best[0]:
                        best = (score, list(picks))
                    return
                week = weeks[index]
                walk(index + 1, used, score + SKIP_POINTS, picks + [None])
                for team, value in matrix[week].items():
                    if team in used:
                        continue
                    used.add(team)
                    walk(index + 1, used, score + value, picks + [team])
                    used.remove(team)

            walk(0, set(), 0.0, [])
            return best

        solved_total, solved = optimize(weeks, teams, lambda week, team: matrix[week].get(team))
        brute_total, _ = brute()
        if abs(solved_total - brute_total) > 1e-6:
            raise AssertionError(f"solver {solved_total} != brute {brute_total} {solved}")


def main():
    self_test()
    season, _weeks, used, bonus_week, open_week = load_local()
    logos = season["logos"]
    for name in used:
        if name not in logos:
            raise RuntimeError(f"used team {name} has no logo")
    current = int(season["currentWeek"])
    nfelo = {}
    finals = set()
    if open_week and open_week.get("week") == current:
        for game in open_week.get("games") or []:
            favorite = game.get("favorite")
            if favorite and game.get("winsPer100") is not None:
                nfelo[favorite] = float(game["winsPer100"]) / 100
        finals.update((open_week.get("finals") or {}).keys())

    ratings, events_by_week, fpi_updated = fetch_inputs()
    for name in ratings:
        if name not in logos:
            raise RuntimeError(f"FPI team {name} is not in season.json")

    schedule = []
    by_week = {}
    for week in range(1, REGULAR_SEASON_WEEKS + 1):
        games = build_games(events_by_week[week], ratings, nfelo if week == current else {}, week)
        if week == current:
            for game in games:
                if game["away"] in finals or game["home"] in finals:
                    game["started"] = True
                    for option in game["options"]:
                        option["available"] = False
        by_week[week] = {"week": week, "games": games}
        schedule.append(
            {
                "week": week,
                "games": [
                    {
                        "away": game["away"],
                        "home": game["home"],
                        "kickoff": game["kickoff"],
                        "neutral": game["neutral"],
                        "started": game["started"],
                    }
                    for game in games
                ],
            }
        )

    week_ids = list(range(current, REGULAR_SEASON_WEEKS + 1))
    teams = sorted({team for week in week_ids for team in index_options(by_week[week]["games"])})
    blocked = set(used)

    def lookup(week, team):
        return index_options(by_week[week]["games"]).get(team)

    def value_of(week, team, bonus=False):
        if team in blocked:
            return None
        option = lookup(week, team)
        if option is None or not option["available"]:
            return None
        return option["bonusPoints"] if bonus else option["expectedPoints"]

    def bonus_of(week, team):
        return value_of(week, team, bonus=True)

    bonus_fn = None if bonus_week else bonus_of
    # Locked picks still need a number after kickoff, so value_of for a lock
    # falls back to the pregame projection.
    def value_for_lock(week, team, bonus=False):
        if team in blocked:
            return None
        option = lookup(week, team)
        if option is None:
            return None
        if option["available"] or True:
            return option["bonusPoints"] if bonus else option["expectedPoints"]
        return None

    def optimize_lock(lock):
        def base(week, team):
            if lock and team == lock[1] and week != lock[0]:
                return None
            if lock and week == lock[0]:
                return value_for_lock(week, team) if team == lock[1] else None
            return value_of(week, team)

        def extra(week, team):
            if lock and team == lock[1] and week != lock[0]:
                return None
            if lock and week == lock[0]:
                return value_for_lock(week, team, bonus=True) if team == lock[1] else None
            return bonus_of(week, team) if bonus_fn else None

        return optimize(week_ids, teams, base, extra if bonus_fn else None, lock)

    # The lock-aware value functions above return None for the locked week
    # unless the team matches, and optimize() scores fixed rows through the
    # same functions. Kickoff-passed teams stay out of value_of, so they are
    # only used when explicitly locked.
    unlocked_total, unlocked_detail = optimize(
        week_ids,
        teams,
        value_of,
        bonus_fn,
    )
    scenarios = {}

    def store(key, total, detail):
        rows = materialize(detail, by_week, bonus_week, blocked)
        scenarios[key] = {"lock": key or None, "total": round(total, 2), "weeks": rows}

    store("", unlocked_total, unlocked_detail)

    selectable = []
    for option in index_options(by_week[current]["games"]).values():
        if option["team"] in blocked:
            continue
        if option["available"] or option["team"] in finals:
            selectable.append(option["team"])
    for team in sorted(set(selectable)):
        total, detail = optimize_lock((current, team))
        store(team, total, detail)

    recommended = next(row for row in scenarios[""]["weeks"] if row["week"] == current)
    alternatives = []
    for team in selectable:
        if team in finals and team not in (open_week.get("finals") or {}):
            continue
        if team in finals:
            continue
        scenario = scenarios[team]
        row = next(item for item in scenario["weeks"] if item["week"] == current)
        gap = round(unlocked_total - scenario["total"], 2)
        if team == recommended["team"]:
            why = row["why"]
        elif gap > 0.05:
            why = (
                f"Locking {team} this week projects {fmt_points(row['expectedPoints'])} now "
                f"and {fmt_points(scenario['total'])} across the remaining season, "
                f"{fmt_points(-gap)} versus the recommended plan."
            )
        else:
            why = row["why"]
        alternatives.append(
            {
                "team": team,
                "opponent": row["opponent"],
                "home": row["home"],
                "winProb": row["winProb"],
                "expectedMargin": row["expectedMargin"],
                "expectedPoints": row["expectedPoints"],
                "seasonTotal": scenario["total"],
                "kickoff": row["kickoff"],
                "source": row["source"],
                "why": why,
                "recommended": team == recommended["team"],
            }
        )
    alternatives.sort(key=lambda item: item["seasonTotal"], reverse=True)
    alternatives = alternatives[:3]
    if alternatives and not any(item["recommended"] for item in alternatives):
        # The recommended team should be one of the best full-season locks.
        if abs(scenarios[recommended["team"]]["total"] - unlocked_total) > 0.05:
            raise AssertionError("recommended lock does not match the open plan")

    best_lock_total = max(item["seasonTotal"] for item in alternatives) if alternatives else unlocked_total
    if best_lock_total - unlocked_total > 0.05:
        raise AssertionError("a forced pick beat the open plan")

    for key, scenario in scenarios.items():
        seen = set(blocked)
        weeks_seen = set()
        for row in scenario["weeks"]:
            if row["week"] in weeks_seen or not (current <= row["week"] <= REGULAR_SEASON_WEEKS):
                raise AssertionError(f"bad week coverage in {key}")
            weeks_seen.add(row["week"])
            if row["team"] is None:
                continue
            if row["team"] in seen:
                raise AssertionError(f"{row['team']} repeated in scenario {key or 'open'}")
            seen.add(row["team"])
            if row["team"] in blocked:
                raise AssertionError(f"used team {row['team']} was planned")
        if weeks_seen != set(week_ids):
            raise AssertionError("missing weeks")
    if recommended["team"] in finals:
        raise AssertionError("recommended a team whose kickoff has passed")

    options = {}
    for week in week_ids:
        flat = []
        for game in by_week[week]["games"]:
            for option in game["options"]:
                flat.append({key: option[key] for key in (
                    "team", "opponent", "home", "winProb", "expectedMargin",
                    "expectedPoints", "source", "available", "kickoff",
                )})
        options[str(week)] = flat

    payload = {
        "updated": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "season": season["season"],
        "fromWeek": current,
        "throughWeek": REGULAR_SEASON_WEEKS,
        "bonusAvailable": bonus_week is None,
        "bonusUsedWeek": bonus_week,
        "model": {
            "family": "normal",
            "sigma": SIGMA,
            "homeField": HOME_FIELD,
            "note": (
                "Win margin is modeled as normal. A posted DraftKings spread is the mean; "
                "otherwise the mean is the ESPN FPI gap plus 2.5 points for the home team. "
                "The open week shows NFELO's win probability when that board has one."
            ),
        },
        "sources": [
            {
                "label": "ESPN scoreboard",
                "url": "https://www.espn.com/nfl/scoreboard",
                "detail": "2026 regular-season schedule, kickoff times, and DraftKings spreads where ESPN has posted them.",
            },
            {
                "label": "ESPN FPI",
                "url": "https://www.espn.com/nfl/fpi",
                "detail": f"Football Power Index through {fpi_updated or 'the latest update'}. Neutral-field points versus an average team.",
            },
            {
                "label": "NFELO",
                "url": "https://www.nfeloapp.com/games/nfl-confidence-picks/",
                "detail": f"Week {current} win probabilities from the confidence board saved in this repo.",
            },
        ],
        "fpiUpdated": fpi_updated,
        "used": used,
        "weeks": schedule,
        "options": options,
        "scenarios": scenarios,
        "alternatives": alternatives,
        "scoringNote": (
            f"Bonus pick already used in Week {bonus_week}."
            if bonus_week
            else "The bonus pick is still open. The plan spends it on the week where the multiplier adds the most."
        ),
    }
    OUT_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {OUT_PATH}")
    print(f"bonus week: {bonus_week}  from week {current}")
    print(f"open plan total {unlocked_total:.1f}")
    for row in scenarios[""]["weeks"]:
        place = "vs" if row["home"] else "at"
        team = row["team"] or "NO PICK"
        opp = row["opponent"] or ""
        print(
            f"  W{row['week']:02d} {team:16} {place:2} {opp:16} "
            f"{(row['winProb'] or 0) * 100:5.1f}%  {row['expectedPoints']:7.1f}"
        )
    print("alternatives:")
    for item in alternatives:
        print(f"  {item['team']:16} week {item['expectedPoints']:6.1f}  season {item['seasonTotal']:6.1f}  rec={item['recommended']}")


if __name__ == "__main__":
    main()
