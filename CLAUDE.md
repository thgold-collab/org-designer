# Org Designer — agent guide

Local-only, client-side org-design tool: ingest a roster, build an interactive org
chart, reorganize (drag / add open roles / edit / delete), and watch spans-of-control,
layers, and other metrics update live against named baselines. **No backend, no network
calls, no telemetry** — roster data never leaves the browser. Keep it that way.

## Run / test / build
```bash
npm run dev      # http://localhost:5180
npm test         # vitest run (unit tests for the pure logic)
npm run build    # tsc -b && vite build  (must pass before committing)
```
Always run `npx tsc -b --noEmit` (or `npm run build`) before committing — TS is strict.

## Architecture
- **State:** `src/store.ts` — single Zustand store. Working set (`employees`), session
  `snapshots` (named baselines) with an active `baselineId`, plus `collapsed` (Set),
  `deptFilter`, `thresholds`, undo/redo (`past`/`future`), and UI nonces
  (`focusNonce`, `editNonce`, `rosterNonce`). Autosaves a subset to `localStorage`
  (key `org-designer-state-v1`) via a debounced `subscribe`; seeds initial state from it.
- **Pure logic (tested):**
  - `src/metrics.ts` — `buildForest` (cycle-safe), `layoutForest` (d3-hierarchy, honors
    a `collapsed` set), `computeMetrics`, `spanRows`, `wouldCreateCycle`. Layout constants
    `NODE_W`/`NODE_H` are shared with rendering + SVG export.
  - `src/csv.ts` — `parseCsvRaw` / `autoMap` (alias-based header matching) /
    `buildEmployees` (resolves managers by **id OR name**, parses `status`, de-dupes ids) /
    `employeesToCsv`. `parseRoster` is the one-shot convenience used by the sample + fast path.
  - `src/report.ts` — `buildChangeReportHtml` / `openChangeReport` (diff vs baseline → printable PDF).
  - `src/chartExport.ts` — current view → standalone SVG, opened for print/download.
- **UI:** `src/components/` — `OrgChart` (canvas: pan/pinch/drag, collapse, diff overlay),
  `MetricsPanel` (+ `DetailPanel`), `Toolbar`, `ImportWizard`, `BaselinePicker`, `SearchBox`.
  `App.tsx` does the responsive (compact) layout + mobile tab bar; `ErrorBoundary` surfaces
  crashes on screen (there's no mobile console).
- **Data model:** `src/types.ts`. A position's fill state is `status?: "open" | "future"`
  (undefined = filled) — NOT a boolean. Update metrics/CSV/report/chart together if you change it.

## Gotchas / conventions
- **iOS Safari/WebKit:** never read a ref inside a `setView`/`setState` *updater* — a
  pointerup can null it before React runs the updater, throwing mid-render (the old
  blank-screen bug). Capture `const p = ref.current` first. Don't put `position: fixed`
  on `html`/`body` (blanks the page on gesture). Handle `pointercancel` like `pointerup`.
- **Custom domain:** served at root of **org.ybloc.us** (GitHub Pages), so `vite.config.ts`
  `base` is `/` and `public/CNAME` holds the domain. If that ever changes, fix both.
- **Build badge:** `__BUILD_SHA__` / `__BUILD_STAMP__` are injected via Vite `define`
  (prefers CI `GITHUB_SHA`) and shown in the toolbar — used to confirm a fresh deploy.
- Match surrounding style. Reuse `metrics.ts` helpers; don't recompute layout ad hoc.

## Deploy
Push to `main` → `.github/workflows/deploy.yml` runs `npm test` then `npm run build` and
publishes to GitHub Pages (org.ybloc.us). **Always ask Ted before pushing.** Repo:
https://github.com/thgold-collab/org-designer
