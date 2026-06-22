import { describe, it, expect } from "vitest";
import { buildChangeReportHtml } from "./report";
import type { Employee, Thresholds } from "./types";

const TH: Thresholds = { narrow: 3, wide: 9 };

const BASE: Employee[] = [
  { id: "1", name: "CEO", title: "CEO", managerId: null },
  { id: "2", name: "Ann", title: "VP", managerId: "1" },
  { id: "3", name: "Ben", title: "Dir", managerId: "2" },
  { id: "4", name: "Cy", title: "IC", managerId: "2" },
];

// Cy moved under Ben; Ben's title edited; Dana added; Ann removed-from? keep.
const CUR: Employee[] = [
  { id: "1", name: "CEO", title: "CEO", managerId: null },
  { id: "2", name: "Ann", title: "VP", managerId: "1" },
  { id: "3", name: "Ben", title: "Senior Dir", managerId: "2" }, // title edit
  { id: "4", name: "Cy", title: "IC", managerId: "3" }, // moved 2 -> 3
  { id: "5", name: "Dana", title: "IC", managerId: "3", status: "open" }, // added
];

describe("buildChangeReportHtml", () => {
  const html = buildChangeReportHtml(BASE, CUR, TH, "Jan 1, 2026", "Q1 Start", "Dec 1, 2025");

  it("shows the named baseline and timestamp", () => {
    expect(html).toContain("Q1 Start");
    expect(html).toContain("Dec 1, 2025");
  });

  it("lists reporting-line moves with from/to", () => {
    expect(html).toContain("Reporting-line moves");
    expect(html).toContain("Cy");
    expect(html).toContain("Ben"); // moved to Ben
  });

  it("lists added roles and field edits", () => {
    expect(html).toContain("New / open roles added");
    expect(html).toContain("Dana");
    expect(html).toContain("Other edits");
    expect(html).toContain("Senior Dir"); // title change captured
  });

  it("includes the metrics summary with correct headcount delta", () => {
    expect(html).toContain("Metrics summary");
    expect(html).toContain("Headcount");
    // 4 -> 5 in the lead summary
    expect(html).toContain("to <strong>5</strong>");
  });

  it("reports no-change when baseline equals current", () => {
    const same = buildChangeReportHtml(BASE, BASE, TH, "now", "B", "then");
    expect(same).toContain("No structural changes");
  });
});
