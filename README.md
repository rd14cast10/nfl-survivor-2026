# nfl-survivor-2026

Raul’s 2026 NFL Survivor Pool weekly pick tracker.

https://rd14cast10.github.io/nfl-survivor-2026/

Each week lives in `data/weeks/NN.json`. `data/season.json` lists those files and sets `currentWeek`.

- A finished week with a pick uses `"status": "final"` and a `pick` object (`team`, `short`, `opponent`, `resultText`, `pointsText`, `result`, `margin`, `points`). `short` is the name blocked on later boards.
- A finished week with no pick uses `"status": "final"` and `"pick": null`. The table shows “No pick recorded” and scores −25. Do not fill in a guess.
- The open week uses `"status": "open"`, a `games` array from the [NFELO confidence board](https://www.nfeloapp.com/games/nfl-confidence-picks/) (`away`, `home`, records, `favorite`, `rank`, `winsPer100`), and `finals` for projected winners whose kickoff has passed. The weekly table gives that week its own row: Selection holds the pick control, Result stays “Before kickoff,” and Points stays blank until the game is final. The choice is saved in this browser under `storageKey` and can be changed until that team’s kickoff.

To roll the table forward, set the previous open week to `"status": "final"` and put the saved pick on that file (or `"pick": null` if none was saved). Then add the next file as `"status": "open"`, append its id in `data/season.json`, and set `currentWeek` to it. The prior row becomes a normal Week / Selection / Result / Points line, and the new week opens with a pick control.
