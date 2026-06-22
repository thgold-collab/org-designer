import { describe, it, expect } from "vitest";
import {
  buildForest,
  layoutForest,
  computeMetrics,
  spanRows,
  wouldCreateCycle,
} from "./metrics";
import { collapseUnderRoots, filterByDept } from "./store";
import type { Employee, Thresholds } from "./types";

const TH: Thresholds = { narrow: 3, wide: 9 };

// CEO(2 reports) -> VP A(3 reports), VP B(1 report); ICs under the VPs.
const ORG: Employee[] = [
  { id: "1", name: "CEO", managerId: null, department: "Exec" },
  { id: "2", name: "VP A", managerId: "1", department: "Eng" },
  { id: "3", name: "VP B", managerId: "1", department: "Sales" },
  { id: "4", name: "IC1", managerId: "2", department: "Eng" },
  { id: "5", name: "IC2", managerId: "2", department: "Eng" },
  { id: "6", name: "IC3", managerId: "2", department: "Eng" },
  { id: "7", name: "IC4", managerId: "3", department: "Sales" },
];

describe("buildForest", () => {
  it("finds the root and children", () => {
    const { roots, childrenOf } = buildForest(ORG);
    expect(roots.map((r) => r.emp.id)).toEqual(["1"]);
    expect(childrenOf.get("1")!.map((e) => e.id)).toEqual(["2", "3"]);
    expect(childrenOf.get("2")!.length).toBe(3);
  });

  it("treats unknown managers as roots (orphans)", () => {
    const { roots, orphans } = buildForest([
      { id: "a", name: "A", managerId: "missing" },
      { id: "b", name: "B", managerId: "a" },
    ]);
    expect(orphans.map((o) => o.id)).toEqual(["a"]);
    expect(roots.map((r) => r.emp.id)).toContain("a");
  });

  it("breaks self-management without infinite looping", () => {
    const { roots } = buildForest([{ id: "x", name: "X", managerId: "x" }]);
    expect(roots.map((r) => r.emp.id)).toEqual(["x"]);
  });
});

describe("computeMetrics", () => {
  it("computes spans, layers, ratios", () => {
    const m = computeMetrics(ORG, TH);
    expect(m.headcount).toBe(7);
    expect(m.managers).toBe(3);
    expect(m.ics).toBe(4);
    expect(m.avgSpan).toBeCloseTo(2); // (2+3+1)/3
    expect(m.medianSpan).toBe(2);
    expect(m.maxSpan).toBe(3);
    expect(m.minSpan).toBe(1);
    expect(m.narrowSpans).toBe(2); // CEO(2) and VP B(1) are < 3
    expect(m.wideSpans).toBe(0);
    expect(m.maxDepth).toBe(3); // 3 layers
    expect(m.layerCounts).toEqual([1, 2, 4]);
    expect(m.icPerManager).toBeCloseTo(4 / 3);
    expect(m.managerRatio).toBeCloseTo(3 / 7);
  });

  it("counts open roles and future hires from status", () => {
    const m = computeMetrics(
      [
        { id: "1", name: "CEO", managerId: null },
        { id: "2", name: "Open", managerId: "1", status: "open" },
        { id: "3", name: "Future", managerId: "1", status: "future" },
      ],
      TH
    );
    expect(m.vacancies).toBe(1);
    expect(m.futureHires).toBe(1);
  });
});

describe("spanRows", () => {
  it("flags narrow and wide managers", () => {
    const rows = spanRows(ORG, TH);
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get("1")!.flag).toBe("narrow"); // span 2 < 3
    expect(byId.get("2")!.flag).toBe("ok"); // span 3
    expect(byId.get("3")!.flag).toBe("narrow"); // span 1
    const wide = spanRows(ORG, { narrow: 3, wide: 2 });
    expect(wide.find((r) => r.id === "2")!.flag).toBe("wide"); // span 3 > 2
  });
});

describe("wouldCreateCycle", () => {
  it("blocks moving a manager under its own descendant", () => {
    expect(wouldCreateCycle(ORG, "1", "4")).toBe(true); // 4 is under 1
    expect(wouldCreateCycle(ORG, "2", "2")).toBe(true); // self
    expect(wouldCreateCycle(ORG, "4", "3")).toBe(false); // sideways move is fine
  });
});

describe("layoutForest with collapse", () => {
  it("prunes collapsed subtrees but keeps real direct-report counts", () => {
    const { nodes } = layoutForest(ORG, new Set(["2"]));
    const ids = nodes.map((n) => n.id).sort();
    expect(ids).toEqual(["1", "2", "3", "7"]); // 4,5,6 hidden under collapsed 2
    const node2 = nodes.find((n) => n.id === "2")!;
    expect(node2.collapsed).toBe(true);
    expect(node2.directReports).toBe(3); // still the true count
  });
});

describe("collapseUnderRoots", () => {
  it("collapses every manager except the roots", () => {
    const c = collapseUnderRoots(ORG);
    expect(c.has("1")).toBe(false); // root stays open
    expect(c.has("2")).toBe(true);
    expect(c.has("3")).toBe(true);
    expect(c.has("4")).toBe(false); // ICs aren't managers
  });
});

describe("filterByDept", () => {
  it("returns only matching department members", () => {
    expect(filterByDept(ORG, "Eng").map((e) => e.id).sort()).toEqual(["2", "4", "5", "6"]);
    expect(filterByDept(ORG, null)).toHaveLength(7);
  });
});
