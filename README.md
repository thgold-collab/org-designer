# Org Designer

A local-only browser app for org-design scenario planning. Ingest a worker roster,
get an interactive org chart, drag boxes to reorganize, and watch your key org-health
metrics update live against a baseline.

**Everything runs in your browser — roster data never leaves your machine.**

## Run it

```bash
npm install
npm run dev      # http://localhost:5180
npm run build    # production build into dist/
```

## What it does

- **Import** a CSV roster (or click *Load sample* to explore immediately). Column names
  are matched flexibly — `Manager ID`, `Reports To`, `Supervisor`, etc. all work, and a
  manager *name* column is resolved to IDs automatically.
- **Org chart** with pan (drag background), zoom (scroll), and fit-to-screen. Multiple
  roots / disconnected trees are handled as a forest.
- **Reorg by dragging** a box onto another box to re-assign reporting lines — or use the
  *Reports to* dropdown in the Detail tab. Cycles (putting a manager under their own
  report) are blocked.
- **Live metrics** with before/after deltas vs a baseline snapshot:
  - Spans of control — avg, median, min/max, narrow/wide flags, distribution histogram,
    and a sortable per-manager table.
  - Layers / depth — max & average layers, headcount per layer.
  - Headcount, manager ratio, IC:manager ratio, total & management comp.
- **Baseline diffing** — *Set baseline* snapshots the current org; every metric then
  shows how your edits move it. *Reset to baseline* reverts.
- **Undo / redo** (⌘Z / ⌘⇧Z) and **Export CSV** of any scenario.
- **Works on phone & tablet** — responsive layout (a bottom Chart/Metrics switch on
  narrow screens) with full touch support: one-finger pan, pinch-to-zoom, and
  drag-a-box to reassign. iPad landscape shows the full side-by-side desktop view.
  An **Auto-center** toggle (on by default on mobile) snaps the org back to center
  whenever you lift your finger, so it can never wander off-screen.

## Roster columns

Minimum: an ID/Name column and a manager/reports-to column. Optional and used in metrics:
`Salary`, `Level`, `FTE`, `Department`, `Location`, `Cost Center`, `Tenure`, `Rating`,
`Vacancy`. Click **Get template** in the app for a ready-to-edit sample CSV.

## Stack

Vite + React + TypeScript, `d3-hierarchy` for tree layout, `papaparse` for CSV, `zustand`
for state. No backend, no network calls.
