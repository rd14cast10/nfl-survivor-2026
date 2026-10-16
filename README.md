# nfl-survivor-2026

Raul’s 2026 NFL Survivor Pool weekly pick tracker.

https://rd14cast10.github.io/nfl-survivor-2026/

Each week lives in `data/weeks/NN.json`. `data/season.json` lists those files and sets `currentWeek`.

- A finished week with a pick uses `"status": "final"` and a `pick` object (`team`, `short`, `opponent`, `resultText`, `pointsText`, `result`, `margin`, `points`). `short` is the name blocked on later boards.
- A finished week with no pick uses `"status": "final"` and `"pick": null`. The table shows “No pick recorded” and scores −25. Do not fill in a guess.
- The open week uses `"status": "open"`, a `games` array from the [NFELO confidence board](https://www.nfeloapp.com/games/nfl-confidence-picks/) (`away`, `home`, records, `favorite`, `rank`, `winsPer100`), and `finals` for projected winners whose kickoff has passed. The calendar shows that week as the open pick. The choice is saved in this browser under `storageKey` and can be changed until that team’s kickoff.

The weekly section is an 18-week calendar. Finished weeks show the saved result. Later weeks show the recommendation in `data/planner.json`.

To roll forward, set the previous open week to `"status": "final"` and put the saved pick on that file (or `"pick": null` if none was saved). Then add the next file as `"status": "open"`, append its id in `data/season.json`, and set `currentWeek` to it. Pushing to `main` reruns `scripts/build-planner.py` before the Pages deploy, so the calendar’s future tiles follow the new week.

## Season planner

`scripts/build-planner.py` writes `data/planner.json`. It blocks every final `pick.short`, and it treats the bonus as already used when a result includes “Bonus.” The remaining schedule and kickoff times come from the ESPN scoreboard. A posted DraftKings spread is the expected margin; otherwise the margin is the ESPN FPI gap plus 2.5 points at home. Expected points assume a normal margin with σ = 13.5: a win is +1 per point, a loss is −2, and the bonus (if it is still open) doubles a win and multiplies a loss by four. The assignment is the maximum-weight matching of teams to weeks. The page keeps a precomputed plan for every legal open-week pick, so a choice saved in the browser updates the later weeks without another fetch.
