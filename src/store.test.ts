import { describe, it, expect, beforeEach } from "vitest";
import { useOrg, promoteAfterRemoval } from "./store";
import { diffRosters } from "./report";
import type { Employee } from "./types";

const ORG: Employee[] = [
  { id: "1", name: "CEO", managerId: null },
  { id: "2", name: "M", managerId: "1" }, // single-report manager (child 3)
  { id: "3", name: "IC", managerId: "2" },
  { id: "4", name: "Open", managerId: "1", status: "open" },
];

describe("promoteAfterRemoval", () => {
  it("re-homes reports to the nearest surviving ancestor", () => {
    // remove 2 -> 3 should rise to 1
    const out = promoteAfterRemoval(ORG, new Set(["2"]));
    expect(out.map((e) => e.id).sort()).toEqual(["1", "3", "4"]);
    expect(out.find((e) => e.id === "3")!.managerId).toBe("1");
  });

  it("walks past chains of removed managers", () => {
    const chain: Employee[] = [
      { id: "1", name: "A", managerId: null },
      { id: "2", name: "B", managerId: "1" },
      { id: "3", name: "C", managerId: "2" },
      { id: "4", name: "D", managerId: "3" },
    ];
    const out = promoteAfterRemoval(chain, new Set(["2", "3"]));
    expect(out.find((e) => e.id === "4")!.managerId).toBe("1");
  });
});

describe("bulk store actions", () => {
  beforeEach(() => useOrg.getState().loadRoster(ORG));

  it("removeByStatus deletes open roles and promotes reports", () => {
    useOrg.getState().removeByStatus("open");
    const emps = useOrg.getState().employees;
    expect(emps.find((e) => e.id === "4")).toBeUndefined();
    expect(emps.some((e) => e.status === "open")).toBe(false);
  });

  it("delayerSingleReports removes managers with exactly one report", () => {
    useOrg.getState().delayerSingleReports();
    const emps = useOrg.getState().employees;
    expect(emps.find((e) => e.id === "2")).toBeUndefined(); // single-report mgr gone
    expect(emps.find((e) => e.id === "3")!.managerId).toBe("1"); // promoted
  });

  it("reassignReports moves a team to a new manager", () => {
    useOrg.getState().reassignReports("2", "1"); // move M's reports (IC) up to CEO
    expect(useOrg.getState().employees.find((e) => e.id === "3")!.managerId).toBe("1");
  });

  it("reassignReports refuses moves that would create a cycle", () => {
    // moving CEO's reports under 2 would put 2 under itself -> skipped for id 2
    useOrg.getState().reassignReports("1", "2");
    const emps = useOrg.getState().employees;
    expect(emps.find((e) => e.id === "2")!.managerId).toBe("1"); // unchanged (cycle)
    expect(emps.find((e) => e.id === "4")!.managerId).toBe("2"); // open role moved fine
  });
});

describe("diffRosters", () => {
  it("classifies moves, adds, removes, edits", () => {
    const base: Employee[] = [
      { id: "1", name: "A", managerId: null, title: "CEO" },
      { id: "2", name: "B", managerId: "1", title: "VP" },
      { id: "3", name: "C", managerId: "1" },
    ];
    const cur: Employee[] = [
      { id: "1", name: "A", managerId: null, title: "CEO" },
      { id: "2", name: "B", managerId: "1", title: "SVP" }, // edit
      { id: "4", name: "D", managerId: "2" }, // added (3 removed)
    ];
    const d = diffRosters(base, cur);
    expect(d.added.map((a) => a.name)).toEqual(["D"]);
    expect(d.removed.map((r) => r.name)).toEqual(["C"]);
    expect(d.edits.find((e) => e.name === "B")!.changes[0].field).toBe("Title");
  });
});
