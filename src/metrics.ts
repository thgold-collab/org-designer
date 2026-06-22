import { hierarchy, tree as d3tree, type HierarchyPointNode } from "d3-hierarchy";
import type { Employee, LayoutNode, OrgMetrics, SpanRow, Thresholds } from "./types";

export const NODE_W = 200;
export const NODE_H = 78;

/** Shared span-distribution bucket definitions (chart + click-to-navigate). */
export const SPAN_BUCKETS: { label: string; test: (s: number) => boolean }[] = [
  { label: "1", test: (s) => s === 1 },
  { label: "2-3", test: (s) => s >= 2 && s <= 3 },
  { label: "4-6", test: (s) => s >= 4 && s <= 6 },
  { label: "7-9", test: (s) => s >= 7 && s <= 9 },
  { label: "10-14", test: (s) => s >= 10 && s <= 14 },
  { label: "15+", test: (s) => s >= 15 },
];
const H_GAP = 28; // horizontal gap between siblings
const V_GAP = 70; // vertical gap between layers

interface TreeDatum {
  emp: Employee;
  children: TreeDatum[];
}

/**
 * Build child lists keyed by manager id. Detects roots and breaks cycles.
 * `collapsed` ids keep their place but their subtree is pruned from the
 * datum trees (used for the chart view only — metrics ignore collapse).
 */
export function buildForest(
  employees: Employee[],
  collapsed?: Set<string>
): {
  roots: TreeDatum[];
  byId: Map<string, Employee>;
  childrenOf: Map<string, Employee[]>;
  orphans: Employee[];
} {
  const byId = new Map<string, Employee>();
  for (const e of employees) byId.set(e.id, e);

  const childrenOf = new Map<string, Employee[]>();
  const roots: Employee[] = [];
  const orphans: Employee[] = [];

  for (const e of employees) {
    const mid = e.managerId;
    if (mid == null || mid === "" || mid === e.id) {
      roots.push(e);
    } else if (!byId.has(mid)) {
      orphans.push(e);
      roots.push(e); // treat as its own root so it still renders
    } else {
      if (!childrenOf.has(mid)) childrenOf.set(mid, []);
      childrenOf.get(mid)!.push(e);
    }
  }

  // Cycle protection while building datum trees.
  const visiting = new Set<string>();
  const built = new Set<string>();

  function toDatum(emp: Employee): TreeDatum {
    visiting.add(emp.id);
    built.add(emp.id);
    const kids = collapsed?.has(emp.id)
      ? []
      : (childrenOf.get(emp.id) ?? [])
          .filter((c) => !visiting.has(c.id) && !built.has(c.id))
          .map(toDatum);
    visiting.delete(emp.id);
    return { emp, children: kids };
  }

  const rootData = roots.map(toDatum);
  return { roots: rootData, byId, childrenOf, orphans };
}

/** Lay out the forest left-to-right; multiple roots are stacked vertically. */
export function layoutForest(
  employees: Employee[],
  collapsed?: Set<string>
): {
  nodes: LayoutNode[];
  width: number;
  height: number;
} {
  const { roots, childrenOf } = buildForest(employees, collapsed);
  const nodes: LayoutNode[] = [];
  let yOffset = 0;
  let maxWidth = 0;

  for (const rootDatum of roots) {
    const root = hierarchy<TreeDatum>(rootDatum, (d) => d.children);
    const layout = d3tree<TreeDatum>().nodeSize([NODE_W + H_GAP, NODE_H + V_GAP]);
    const positioned = layout(root);

    // Normalise x so this tree starts at 0; compute its bounds.
    let minX = Infinity;
    let maxX = -Infinity;
    positioned.each((n) => {
      minX = Math.min(minX, n.x);
      maxX = Math.max(maxX, n.x);
    });
    const treeWidth = maxX - minX + NODE_W;
    let maxY = 0;

    positioned.each((n: HierarchyPointNode<TreeDatum>) => {
      const totalReports = (n.descendants().length - 1) || 0;
      const id = n.data.emp.id;
      const node: LayoutNode = {
        id,
        emp: n.data.emp,
        x: n.x - minX,
        y: n.y + yOffset,
        depth: n.depth,
        // real direct-report count, even when the subtree is hidden
        directReports: childrenOf.get(id)?.length ?? 0,
        totalReports,
        parentId: n.parent?.data.emp.id ?? null,
        collapsed: collapsed?.has(id) ?? false,
      };
      nodes.push(node);
      maxY = Math.max(maxY, n.y);
    });

    maxWidth = Math.max(maxWidth, treeWidth);
    yOffset += maxY + NODE_H + V_GAP * 2; // gap between separate trees
  }

  return { nodes, width: maxWidth, height: yOffset };
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined
    ? sorted[base] + rest * (sorted[base + 1] - sorted[base])
    : sorted[base];
}

export function computeMetrics(
  employees: Employee[],
  thresholds: Thresholds
): OrgMetrics {
  const { childrenOf } = buildForest(employees);
  const layout = layoutForest(employees);

  const headcount = employees.length;
  const vacancies = employees.filter((e) => e.status === "open").length;
  const futureHires = employees.filter((e) => e.status === "future").length;

  // A manager is anyone with >= 1 direct report.
  const spans: number[] = [];
  let managers = 0;
  let narrowSpans = 0;
  let wideSpans = 0;
  let managerComp = 0;

  for (const e of employees) {
    const span = childrenOf.get(e.id)?.length ?? 0;
    if (span > 0) {
      managers++;
      spans.push(span);
      managerComp += e.salary ?? 0;
      if (span < thresholds.narrow) narrowSpans++;
      if (span > thresholds.wide) wideSpans++;
    }
  }
  spans.sort((a, b) => a - b);

  const ics = headcount - managers;
  const sumSpan = spans.reduce((a, b) => a + b, 0);

  // Layer counts from layout depth.
  const layerCounts: number[] = [];
  let depthSum = 0;
  let maxDepth = 0;
  for (const n of layout.nodes) {
    layerCounts[n.depth] = (layerCounts[n.depth] ?? 0) + 1;
    depthSum += n.depth;
    maxDepth = Math.max(maxDepth, n.depth);
  }
  for (let i = 0; i <= maxDepth; i++) if (layerCounts[i] == null) layerCounts[i] = 0;

  // Span distribution buckets.
  const spanBuckets = SPAN_BUCKETS.map((b) => ({
    label: b.label,
    count: spans.filter(b.test).length,
  }));

  const totalComp = employees.reduce((a, e) => a + (e.salary ?? 0), 0);
  const rootCount = layout.nodes.filter((n) => n.depth === 0).length;

  return {
    headcount,
    managers,
    ics,
    vacancies,
    futureHires,
    avgSpan: managers ? sumSpan / managers : 0,
    medianSpan: quantile(spans, 0.5),
    maxSpan: spans.length ? spans[spans.length - 1] : 0,
    minSpan: spans.length ? spans[0] : 0,
    narrowSpans,
    wideSpans,
    spanBuckets,
    maxDepth: maxDepth + 1, // layers = depth + 1
    avgDepth: headcount ? depthSum / headcount + 1 : 0,
    layerCounts,
    managerRatio: headcount ? managers / headcount : 0,
    icPerManager: managers ? ics / managers : 0,
    totalComp,
    managerComp,
    rootCount,
  };
}

export function spanRows(
  employees: Employee[],
  thresholds: Thresholds
): SpanRow[] {
  const { childrenOf } = buildForest(employees);
  const { nodes } = layoutForest(employees);
  const depthById = new Map(nodes.map((n) => [n.id, n.depth]));
  const totalById = new Map(nodes.map((n) => [n.id, n.totalReports]));

  const rows: SpanRow[] = [];
  for (const e of employees) {
    const span = childrenOf.get(e.id)?.length ?? 0;
    if (span === 0) continue;
    rows.push({
      id: e.id,
      name: e.name,
      title: e.title,
      span,
      totalReports: totalById.get(e.id) ?? 0,
      depth: (depthById.get(e.id) ?? 0) + 1,
      flag:
        span < thresholds.narrow
          ? "narrow"
          : span > thresholds.wide
          ? "wide"
          : "ok",
    });
  }
  rows.sort((a, b) => b.span - a.span);
  return rows;
}

export interface CostBreakdown {
  hasSalary: boolean;
  total: number;
  avg: number; // average over people who have a salary
  withSalaryCount: number;
  managerComp: number;
  overheadPct: number; // management comp / total comp
  byLayer: { label: string; value: number }[];
  byDept: { label: string; value: number }[];
  byLocation: { label: string; value: number }[];
}

/** Comp breakdowns by layer / department / location. Empty-ish if no salaries. */
export function computeCost(employees: Employee[]): CostBreakdown {
  const { childrenOf } = buildForest(employees);
  const { nodes } = layoutForest(employees);
  const depthById = new Map(nodes.map((n) => [n.id, n.depth]));

  let total = 0;
  let managerComp = 0;
  let withSalaryCount = 0;
  const byLayer = new Map<number, number>();
  const byDept = new Map<string, number>();
  const byLoc = new Map<string, number>();

  for (const e of employees) {
    const sal = e.salary ?? 0;
    if (e.salary != null && e.salary > 0) withSalaryCount++;
    total += sal;
    if ((childrenOf.get(e.id)?.length ?? 0) > 0) managerComp += sal;
    const d = depthById.get(e.id) ?? 0;
    byLayer.set(d, (byLayer.get(d) ?? 0) + sal);
    byDept.set(e.department || "—", (byDept.get(e.department || "—") ?? 0) + sal);
    byLoc.set(e.location || "—", (byLoc.get(e.location || "—") ?? 0) + sal);
  }

  const sortDesc = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));

  return {
    hasSalary: withSalaryCount > 0,
    total,
    avg: withSalaryCount ? total / withSalaryCount : 0,
    withSalaryCount,
    managerComp,
    overheadPct: total ? managerComp / total : 0,
    byLayer: [...byLayer.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([d, value]) => ({ label: `L${d + 1}`, value })),
    byDept: sortDesc(byDept),
    byLocation: sortDesc(byLoc),
  };
}

/** Would re-parenting `nodeId` under `newManagerId` create a cycle? */
export function wouldCreateCycle(
  employees: Employee[],
  nodeId: string,
  newManagerId: string
): boolean {
  if (nodeId === newManagerId) return true;
  const byId = new Map(employees.map((e) => [e.id, e]));
  let cur: string | null = newManagerId;
  const seen = new Set<string>();
  while (cur != null) {
    if (cur === nodeId) return true; // newManager is inside node's subtree
    if (seen.has(cur)) break;
    seen.add(cur);
    cur = byId.get(cur)?.managerId ?? null;
  }
  return false;
}
