# ML-Drift-Lens Frontend

React + Vite dashboard for the ML-Drift-Lens / ModelWatch backend. Talks to the
real Express API only — no mock data anywhere in the app.

## Pages

- **Overview** — KPI strip (active models, open alerts, latest PSI/Z-score with
  threshold sparkline) + drift trend chart + recent alerts + recent retraining jobs.
- **Drift Monitoring** — PSI vs Z-score tabs, per-model filter, trend chart with
  threshold line, full readings table.
- **Models** — accuracy/F1 comparison chart, per-model metric cards.
- **Alerts** — table of alerts with a "Mark resolved" action (calls `PUT /api/alerts/:id`).
- **Retraining** — job history, running/promoted counts.
- **Predictions** — raw inference log.

## Run it

```bash
cd ml-drift-lens-frontend
npm install
npm run dev
```

This starts Vite on **http://localhost:5173**. It proxies any `/api/*` request
to `http://localhost:3000` (see `vite.config.js`), so make sure the backend is
running first:

```bash
cd ml-drift-lens-backend
npm install   # if not already done
node server.js
```

Then open http://localhost:5173.

## Notes on the API integration

- Every function in `src/api/client.js` maps to a real route in the backend
  (`GET/POST/PUT/DELETE` on `/alerts`, `/drift`, `/models`, `/predictions`,
  `/retraining`). Nothing is invented.
- There's no dashboard-summary endpoint, so KPI totals and the PSI/Z-score
  split are computed in the browser from the list responses
  (`src/utils/stats.js`).
- `metric_type` in `drift_scores` is free text. The PSI/Z-score split matches
  on the substrings `"psi"` and `"z"` (case-insensitive), so it works with
  whatever exact string you store (`"PSI"`, `"psi"`, `"Z-SCORE"`, `"zscore"`, etc.).
- Data refreshes automatically every 12–20s per page (simple polling — no
  websocket layer exists in the backend yet).

## Build for production

```bash
npm run build
```

Outputs static files to `dist/`. Serve them with any static host, or point
Express at them with `express.static` if you want a single deployed origin.
