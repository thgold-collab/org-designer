import type { Employee, Thresholds } from "./types";
import { layoutForest, spanRows, NODE_W, NODE_H } from "./metrics";
import { filterByDept } from "./store";

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;"
  );
}

/**
 * Render the current chart view (respecting collapse + department filter) as a
 * self-contained SVG, opened in a new window with print + download controls.
 */
export function openChartExport(
  employees: Employee[],
  collapsed: Set<string>,
  deptFilter: string | null,
  thresholds: Thresholds
): boolean {
  const scoped = filterByDept(employees, deptFilter);
  const { nodes, width, height } = layoutForest(scoped, collapsed);
  if (nodes.length === 0) return true;

  const flagById = new Map(spanRows(scoped, thresholds).map((r) => [r.id, r.flag]));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const pad = 40;
  const W = width + pad * 2;
  const H = height + pad * 2;

  const edges: string[] = [];
  for (const n of nodes) {
    if (!n.parentId) continue;
    const p = byId.get(n.parentId);
    if (!p) continue;
    const x1 = p.x + NODE_W / 2 + pad;
    const y1 = p.y + NODE_H + pad;
    const x2 = n.x + NODE_W / 2 + pad;
    const y2 = n.y + pad;
    const my = (y1 + y2) / 2;
    edges.push(`M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`);
  }

  const boxes = nodes
    .map((n) => {
      const x = n.x + pad;
      const y = n.y + pad;
      const flag = flagById.get(n.id);
      const accent = flag === "wide" ? "#dc2626" : flag === "narrow" ? "#d97706" : "#cbd5e1";
      const dashed = n.emp.status ? ` stroke-dasharray="5 4"` : "";
      const fill = n.emp.status === "open" ? "#f8fafc" : n.emp.status === "future" ? "#eff6ff" : "#ffffff";
      const span = n.directReports;
      const statusTag =
        n.emp.status === "open" ? " (open)" : n.emp.status === "future" ? " (future hire)" : "";
      return `
    <g>
      <rect x="${x}" y="${y}" width="${NODE_W}" height="${NODE_H}" rx="10"
        fill="${fill}" stroke="${accent}" stroke-width="2"${dashed}/>
      <rect x="${x}" y="${y}" width="4" height="${NODE_H}" rx="2" fill="${accent}"/>
      <text x="${x + 12}" y="${y + 22}" font-size="13" font-weight="700" fill="#1a2027">${esc(
        truncate(n.emp.name + statusTag, 26)
      )}</text>
      <text x="${x + 12}" y="${y + 39}" font-size="11" fill="#647084">${esc(
        truncate(n.emp.title ?? "", 30)
      )}</text>
      ${
        span > 0
          ? `<text x="${x + 12}" y="${y + 62}" font-size="10" font-weight="600" fill="${accent}">${span} report${
              span === 1 ? "" : "s"
            }</text>`
          : ""
      }
      ${
        n.emp.department
          ? `<text x="${x + NODE_W - 12}" y="${y + 62}" font-size="10" text-anchor="end" fill="#7c8aa0">${esc(
              truncate(n.emp.department, 18)
            )}</text>`
          : ""
      }
    </g>`;
    })
    .join("");

  const svg = `<svg id="org-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  <g fill="none" stroke="#c7d0db" stroke-width="1.5">${edges.map((d) => `<path d="${d}"/>`).join("")}</g>
  ${boxes}
</svg>`;

  const html = `<!doctype html><html><head><meta charset="utf-8"/>
<title>Org Chart</title>
<style>
  body { margin:0; background:#f1f5f9; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif; }
  .bar { position:sticky; top:0; background:#fff; border-bottom:1px solid #e2e8f0; padding:10px 16px; display:flex; gap:10px; align-items:center; }
  .bar button, .bar a { background:#2563eb; color:#fff; border:none; padding:9px 16px; border-radius:8px; font-size:14px; font-weight:600; cursor:pointer; text-decoration:none; }
  .bar a.alt { background:#e2e8f0; color:#1a2027; }
  .scroll { overflow:auto; padding:20px; }
  #org-svg { display:block; box-shadow:0 1px 6px rgba(0,0,0,.15); }
  @media print { .bar { display:none; } body { background:#fff; } .scroll { padding:0; } #org-svg { box-shadow:none; } @page { margin:10mm; } }
</style></head>
<body>
  <div class="bar">
    <button onclick="window.print()">Save as PDF / Print</button>
    <a class="alt" id="dl" download="org-chart.svg">Download SVG</a>
    <span style="color:#647084;font-size:13px">${nodes.length} boxes${deptFilter ? " · " + esc(deptFilter) : ""}</span>
  </div>
  <div class="scroll">${svg}</div>
  <script>
    var blob = new Blob([document.getElementById('org-svg').outerHTML], {type:'image/svg+xml'});
    document.getElementById('dl').href = URL.createObjectURL(blob);
  </script>
</body></html>`;

  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  return true;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
