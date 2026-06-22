import type { Employee, OrgMetrics, Thresholds } from "./types";
import { computeMetrics } from "./metrics";

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;"
  );
}

const money = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : `$${Math.round(n / 1000)}k`;

interface Move {
  name: string;
  from: string;
  to: string;
}
interface AddRemove {
  name: string;
  title: string;
  manager: string;
}
interface FieldChange {
  name: string;
  changes: { field: string; from: string; to: string }[];
}

const EDIT_FIELDS: [keyof Employee, string][] = [
  ["name", "Name"],
  ["title", "Title"],
  ["department", "Department"],
  ["location", "Location"],
  ["level", "Level"],
  ["salary", "Salary"],
  ["status", "Status"],
];

const statusLabel = (v: unknown) =>
  v === "open" ? "Open role" : v === "future" ? "Future hire" : "Filled";

function diffRosters(baseline: Employee[], current: Employee[]) {
  const base = new Map(baseline.map((e) => [e.id, e]));
  const cur = new Map(current.map((e) => [e.id, e]));
  // Resolve manager ids to names across both snapshots.
  const nameById = new Map<string, string>();
  for (const e of [...baseline, ...current]) nameById.set(e.id, e.name);
  const mgrName = (id: string | null | undefined) =>
    id == null || id === "" ? "(top of org)" : nameById.get(id) ?? "(unknown)";

  const moves: Move[] = [];
  const added: AddRemove[] = [];
  const removed: AddRemove[] = [];
  const edits: FieldChange[] = [];

  for (const e of current) {
    const b = base.get(e.id);
    if (!b) {
      added.push({ name: e.name, title: e.title ?? "—", manager: mgrName(e.managerId) });
      continue;
    }
    if ((b.managerId ?? "") !== (e.managerId ?? "")) {
      moves.push({ name: e.name, from: mgrName(b.managerId), to: mgrName(e.managerId) });
    }
    const changes: FieldChange["changes"] = [];
    for (const [field, label] of EDIT_FIELDS) {
      const bv = field === "status" ? statusLabel(b[field]) : b[field] ?? "—";
      const cv = field === "status" ? statusLabel(e[field]) : e[field] ?? "—";
      if (String(bv) !== String(cv)) {
        changes.push({
          field: label,
          from: field === "salary" ? money(Number(bv) || 0) : String(bv),
          to: field === "salary" ? money(Number(cv) || 0) : String(cv),
        });
      }
    }
    if (changes.length) edits.push({ name: e.name, changes });
  }
  for (const b of baseline) {
    if (!cur.has(b.id)) {
      removed.push({ name: b.name, title: b.title ?? "—", manager: mgrName(b.managerId) });
    }
  }
  return { moves, added, removed, edits };
}

interface MetricRow {
  label: string;
  base: number;
  cur: number;
  fmt: (n: number) => string;
  goodDir: "up" | "down" | "none";
}

function metricRows(base: OrgMetrics, cur: OrgMetrics): MetricRow[] {
  const i = (n: number) => String(Math.round(n));
  const f1 = (n: number) => n.toFixed(1);
  const pct = (n: number) => `${(n * 100).toFixed(0)}%`;
  return [
    { label: "Headcount", base: base.headcount, cur: cur.headcount, fmt: i, goodDir: "none" },
    { label: "Managers", base: base.managers, cur: cur.managers, fmt: i, goodDir: "down" },
    { label: "Individual contributors", base: base.ics, cur: cur.ics, fmt: i, goodDir: "none" },
    { label: "Open roles", base: base.vacancies, cur: cur.vacancies, fmt: i, goodDir: "none" },
    { label: "Future hires", base: base.futureHires, cur: cur.futureHires, fmt: i, goodDir: "none" },
    { label: "Avg span of control", base: base.avgSpan, cur: cur.avgSpan, fmt: f1, goodDir: "up" },
    { label: "Median span", base: base.medianSpan, cur: cur.medianSpan, fmt: f1, goodDir: "up" },
    { label: "Narrow-span managers", base: base.narrowSpans, cur: cur.narrowSpans, fmt: i, goodDir: "down" },
    { label: "Wide-span managers", base: base.wideSpans, cur: cur.wideSpans, fmt: i, goodDir: "down" },
    { label: "Max layers", base: base.maxDepth, cur: cur.maxDepth, fmt: i, goodDir: "down" },
    { label: "IC : Manager ratio", base: base.icPerManager, cur: cur.icPerManager, fmt: f1, goodDir: "up" },
    { label: "% who manage", base: base.managerRatio, cur: cur.managerRatio, fmt: pct, goodDir: "down" },
    { label: "Total comp", base: base.totalComp, cur: cur.totalComp, fmt: money, goodDir: "none" },
    { label: "Management comp", base: base.managerComp, cur: cur.managerComp, fmt: money, goodDir: "down" },
  ];
}

function deltaCell(r: MetricRow): string {
  const d = r.cur - r.base;
  if (Math.abs(d) < 1e-9) return `<td class="num muted">—</td>`;
  const isGood = r.goodDir === "none" ? null : (d > 0) === (r.goodDir === "up");
  const cls = isGood === null ? "" : isGood ? "good" : "bad";
  const sign = d > 0 ? "+" : "−";
  return `<td class="num ${cls}">${sign}${r.fmt(Math.abs(d))}</td>`;
}

export function buildChangeReportHtml(
  baseline: Employee[],
  current: Employee[],
  thresholds: Thresholds,
  dateStr: string,
  baselineLabel: string,
  baselineAt: string
): string {
  const { moves, added, removed, edits } = diffRosters(baseline, current);
  const base = computeMetrics(baseline, thresholds);
  const cur = computeMetrics(current, thresholds);
  const rows = metricRows(base, cur);
  const totalChanges = moves.length + added.length + removed.length + edits.length;

  const section = (title: string, count: number, body: string) =>
    count === 0
      ? ""
      : `<h2>${esc(title)} <span class="count">${count}</span></h2>${body}`;

  const movesTable = `<table><thead><tr><th>Person</th><th>From manager</th><th>To manager</th></tr></thead><tbody>${moves
    .map((m) => `<tr><td>${esc(m.name)}</td><td>${esc(m.from)}</td><td>→ ${esc(m.to)}</td></tr>`)
    .join("")}</tbody></table>`;

  const addTable = `<table><thead><tr><th>New role</th><th>Title</th><th>Reports to</th></tr></thead><tbody>${added
    .map((a) => `<tr><td>${esc(a.name)}</td><td>${esc(a.title)}</td><td>${esc(a.manager)}</td></tr>`)
    .join("")}</tbody></table>`;

  const remTable = `<table><thead><tr><th>Removed</th><th>Title</th><th>Was reporting to</th></tr></thead><tbody>${removed
    .map((a) => `<tr><td>${esc(a.name)}</td><td>${esc(a.title)}</td><td>${esc(a.manager)}</td></tr>`)
    .join("")}</tbody></table>`;

  const editTable = `<table><thead><tr><th>Person</th><th>Field</th><th>Before</th><th>After</th></tr></thead><tbody>${edits
    .map((e) =>
      e.changes
        .map(
          (c, i) =>
            `<tr><td>${i === 0 ? esc(e.name) : ""}</td><td>${esc(c.field)}</td><td>${esc(
              c.from
            )}</td><td>→ ${esc(c.to)}</td></tr>`
        )
        .join("")
    )
    .join("")}</tbody></table>`;

  const metricsTable = `<table class="metrics"><thead><tr><th>Metric</th><th class="num">Before</th><th class="num">After</th><th class="num">Change</th></tr></thead><tbody>${rows
    .map(
      (r) =>
        `<tr><td>${esc(r.label)}</td><td class="num">${r.fmt(r.base)}</td><td class="num">${r.fmt(
          r.cur
        )}</td>${deltaCell(r)}</tr>`
    )
    .join("")}</tbody></table>`;

  return `<!doctype html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Org Design Change Report</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1a2027; margin: 0; padding: 40px; background: #fff; }
  .wrap { max-width: 820px; margin: 0 auto; }
  header { border-bottom: 3px solid #2563eb; padding-bottom: 14px; margin-bottom: 8px; }
  h1 { font-size: 24px; margin: 0 0 4px; }
  .sub { color: #647084; font-size: 13px; }
  .lead { margin: 18px 0; font-size: 14px; color: #33414f; }
  h2 { font-size: 15px; text-transform: uppercase; letter-spacing: .6px; color: #2563eb; margin: 28px 0 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; }
  h2 .count { background: #eef2ff; color: #2563eb; border-radius: 20px; padding: 1px 9px; font-size: 12px; margin-left: 6px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 6px; }
  th { text-align: left; color: #647084; font-weight: 600; border-bottom: 2px solid #e2e8f0; padding: 6px 8px; font-size: 11px; text-transform: uppercase; letter-spacing: .4px; }
  td { padding: 6px 8px; border-bottom: 1px solid #eef2f6; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .good { color: #15803d; font-weight: 600; }
  .bad { color: #b91c1c; font-weight: 600; }
  .muted { color: #94a3b8; }
  table.metrics tbody tr:nth-child(odd) { background: #f8fafc; }
  .none { color: #647084; font-style: italic; margin: 12px 0; }
  .toolbar { margin: 20px 0 8px; }
  .toolbar button { background: #2563eb; color: #fff; border: none; padding: 10px 18px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
  footer { margin-top: 32px; color: #94a3b8; font-size: 11px; border-top: 1px solid #e2e8f0; padding-top: 10px; }
  @media print { .toolbar { display: none; } body { padding: 0; } @page { margin: 18mm; } }
</style></head>
<body><div class="wrap">
  <header>
    <h1>Org Design — Change Report</h1>
    <div class="sub">Baseline: <strong>${esc(baselineLabel)}</strong> <span class="muted">(set ${esc(baselineAt)})</span></div>
    <div class="sub">Generated ${esc(dateStr)} · ${totalChanges} change${totalChanges === 1 ? "" : "s"} since baseline · span flags: narrow &lt;${thresholds.narrow}, wide &gt;${thresholds.wide}</div>
  </header>

  <div class="toolbar"><button onclick="window.print()">Save as PDF / Print</button></div>

  <p class="lead">Headcount moved from <strong>${base.headcount}</strong> to <strong>${cur.headcount}</strong>, with <strong>${moves.length}</strong> reporting-line change${moves.length === 1 ? "" : "s"}, <strong>${added.length}</strong> new role${added.length === 1 ? "" : "s"}, and <strong>${removed.length}</strong> removal${removed.length === 1 ? "" : "s"}. Average span of control went from <strong>${base.avgSpan.toFixed(1)}</strong> to <strong>${cur.avgSpan.toFixed(1)}</strong> and the org is <strong>${cur.maxDepth}</strong> layer${cur.maxDepth === 1 ? "" : "s"} deep (was ${base.maxDepth}).</p>

  ${totalChanges === 0 ? '<p class="none">No structural changes since the baseline was set.</p>' : ""}
  ${section("Reporting-line moves", moves.length, movesTable)}
  ${section("New / open roles added", added.length, addTable)}
  ${section("Roles removed", removed.length, remTable)}
  ${section("Other edits", edits.length, editTable)}

  <h2>Metrics summary</h2>
  ${metricsTable}

  <footer>Produced by Org Designer. Metrics computed over the full organization.</footer>
</div>
<script>setTimeout(function(){try{window.print()}catch(e){}}, 350);</script>
</body></html>`;
}

/** Open the report in a new window so it prints cleanly without the app chrome. */
export function openChangeReport(
  baseline: Employee[],
  current: Employee[],
  thresholds: Thresholds,
  baselineLabel: string,
  baselineAt: string
): boolean {
  const dateStr = new Date().toLocaleString(undefined, {
    dateStyle: "long",
    timeStyle: "short",
  });
  const html = buildChangeReportHtml(baseline, current, thresholds, dateStr, baselineLabel, baselineAt);
  const w = window.open("", "_blank");
  if (!w) return false; // popup blocked
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  return true;
}
