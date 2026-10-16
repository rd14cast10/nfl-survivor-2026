# nfl-survivor-2026

Raul’s 2026 NFL Survivor Pool weekly pick tracker.

https://rd14cast10.github.io/nfl-survivor-2026/

Each week lives in `data/weeks/NN.json`. `data/season.json` lists those files and sets `currentWeek`.

- A finished week with a pick uses `"status": "final"` and a `pick` object (`team`, `short`, `opponent`, `resultText`, `pointsText`, `result`, `margin`, `points`). `short` is the name blocked on later boards.
- A finished week with no pick uses `"status": "final"` and `"pick": null`. The table shows “No pick recorded” and scores −25. Do not fill in a guess.
- The open week uses `"status": "open"`, a `games` array from the [NFELO confidence board](https://www.nfeloapp.com/games/nfl-confidence-picks/) (`away`, `home`, records, `favorite`, `rank`, `winsPer100`), and `finals` only for projected winners whose games are already final. The browser stores that week’s choice under `storageKey`.

To roll forward, add the new week file, append its id to `weeks`, set `currentWeek`, and move the previous open week to `final` with the saved pick or `pick: null`.
