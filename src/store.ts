import { create } from "zustand";
import type { Employee, Thresholds } from "./types";
import { wouldCreateCycle } from "./metrics";
import { SAMPLE_ROSTER } from "./sampleData";

interface HistoryEntry {
  employees: Employee[];
  label: string;
}

/** A named saved org state you can restore or compare against. */
export interface Snapshot {
  id: string;
  label: string;
  at: string; // display timestamp
  employees: Employee[];
}

interface OrgState {
  employees: Employee[]; // working set
  snapshots: Snapshot[]; // all saved baselines/scenarios this session
  baselineId: string | null; // which snapshot the change report compares against
  baseline: Employee[]; // mirror of the active baseline's employees (for diff)
  baselineLabel: string; // active baseline name (used in reports)
  baselineAt: string; // when the active baseline was captured
  thresholds: Thresholds;
  selectedId: string | null;
  deptFilter: string | null; // null = whole org
  collapsed: Set<string>; // node ids whose subtree is hidden
  focusId: string | null; // node the chart should center on
  focusNonce: number; // bumps to re-trigger focus on the same id
  editNonce: number; // bumps to ask the panel to open the Detail tab
  rosterNonce: number; // bumps when a new roster loads (chart re-fits)
  autoCenter: boolean; // snap the org back to center when a gesture ends
  past: HistoryEntry[];
  future: HistoryEntry[];
  lastMessage: string | null;

  toggleAutoCenter: () => void;
  setDeptFilter: (dept: string | null) => void;
  toggleCollapse: (id: string) => void;
  collapseAll: () => void;
  expandAll: () => void;
  focusNode: (id: string) => void;
  addOpenRole: (managerId?: string | null) => void;
  loadRoster: (employees: Employee[], makeBaseline?: boolean) => void;
  reparent: (nodeId: string, newManagerId: string | null) => boolean;
  updateEmployee: (id: string, patch: Partial<Employee>) => void;
  deleteEmployee: (id: string, mode?: "promote" | "orphan") => void;
  select: (id: string | null) => void;
  setThresholds: (t: Partial<Thresholds>) => void;
  saveBaseline: (label?: string) => void;
  restoreSnapshot: (id: string) => void;
  setActiveBaseline: (id: string) => void;
  deleteSnapshot: (id: string) => void;
  undo: () => void;
  redo: () => void;
  clearMessage: () => void;
}

const clone = (e: Employee[]) => e.map((x) => ({ ...x }));

const nowStr = () =>
  new Date().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

let snapSeq = 1;
const newSnapId = () => `snap-${snapSeq++}`;
const makeSnapshot = (label: string, employees: Employee[]): Snapshot => ({
  id: newSnapId(),
  label,
  at: nowStr(),
  employees: clone(employees),
});

const INITIAL_SNAPSHOT = makeSnapshot("Initial roster", SAMPLE_ROSTER);

export const useOrg = create<OrgState>((set, get) => ({
  employees: clone(SAMPLE_ROSTER),
  snapshots: [INITIAL_SNAPSHOT],
  baselineId: INITIAL_SNAPSHOT.id,
  baseline: clone(INITIAL_SNAPSHOT.employees),
  baselineLabel: INITIAL_SNAPSHOT.label,
  baselineAt: INITIAL_SNAPSHOT.at,
  thresholds: { narrow: 3, wide: 9 },
  selectedId: null,
  deptFilter: null,
  collapsed: collapseUnderRoots(SAMPLE_ROSTER),
  focusId: null,
  focusNonce: 0,
  editNonce: 0,
  rosterNonce: 0,
  // Off by default: free panning. Clamp keeps the org on screen; the Recenter/Fit
  // buttons and this toggle are there if you want snap-to-center behavior.
  autoCenter: false,
  past: [],
  future: [],
  lastMessage: null,

  toggleAutoCenter: () =>
    set((s) => ({
      autoCenter: !s.autoCenter,
      lastMessage: !s.autoCenter ? "Auto-center on" : "Auto-center off",
    })),

  setDeptFilter: (dept) => set({ deptFilter: dept, selectedId: null }),

  toggleCollapse: (id) =>
    set((s) => {
      const collapsed = new Set(s.collapsed);
      if (collapsed.has(id)) collapsed.delete(id);
      else collapsed.add(id);
      return { collapsed };
    }),

  collapseAll: () =>
    set((s) => ({ collapsed: collapseUnderRoots(s.employees), lastMessage: "Collapsed all branches." })),

  expandAll: () => set({ collapsed: new Set<string>(), lastMessage: "Expanded all branches." }),

  focusNode: (id) =>
    set((s) => {
      // Make sure every ancestor is expanded so the node is visible, then
      // ask the chart to center on it.
      const byId = new Map(s.employees.map((e) => [e.id, e]));
      const collapsed = new Set(s.collapsed);
      let cur = byId.get(id)?.managerId ?? null;
      const seen = new Set<string>();
      while (cur && byId.has(cur) && !seen.has(cur)) {
        seen.add(cur);
        collapsed.delete(cur);
        cur = byId.get(cur)?.managerId ?? null;
      }
      const emp = byId.get(id);
      return {
        collapsed,
        selectedId: id,
        focusId: id,
        focusNonce: s.focusNonce + 1,
        lastMessage: emp ? `Jumped to ${emp.name}` : null,
      };
    }),

  addOpenRole: (managerId) =>
    set((s) => {
      const ids = new Set(s.employees.map((e) => e.id));
      let n = 1;
      while (ids.has(`role-${n}`)) n++;
      const id = `role-${n}`;

      // Manager: explicit arg, else the selected node, else the top-most root.
      let mid = managerId ?? s.selectedId ?? null;
      if (mid == null || !ids.has(mid)) {
        const root = s.employees.find((e) => !e.managerId || !ids.has(e.managerId));
        mid = root?.id ?? null;
      }
      const mgr = mid ? s.employees.find((e) => e.id === mid) : undefined;

      const role: Employee = {
        id,
        name: "Open Role",
        title: "New Role",
        managerId: mid,
        status: "open",
        // inherit so it stays in the same department filter / location grouping
        department: mgr?.department,
        location: mgr?.location,
      };

      const collapsed = new Set(s.collapsed);
      if (mid) collapsed.delete(mid); // expand the manager so the new role shows

      return {
        past: [...s.past, { employees: clone(s.employees), label: "Add open role" }],
        future: [],
        employees: [...s.employees, role],
        collapsed,
        selectedId: id,
        focusId: id,
        focusNonce: s.focusNonce + 1,
        editNonce: s.editNonce + 1,
        lastMessage: "Added open role — edit the details in the panel.",
      };
    }),

  loadRoster: (employees, makeBaseline = true) =>
    set((s) => {
      if (!makeBaseline) {
        return {
          employees: clone(employees),
          past: [],
          future: [],
          selectedId: null,
          deptFilter: null,
          collapsed: collapseUnderRoots(employees),
          focusId: null,
          rosterNonce: s.rosterNonce + 1,
          lastMessage: `Loaded ${employees.length} people.`,
        };
      }
      // A fresh import starts a new scenario set — prior snapshots were about
      // the old org, so reset to a single "Imported roster" baseline.
      const snap = makeSnapshot("Imported roster", employees);
      return {
        employees: clone(employees),
        snapshots: [snap],
        baselineId: snap.id,
        baseline: clone(snap.employees),
        baselineLabel: snap.label,
        baselineAt: snap.at,
        past: [],
        future: [],
        selectedId: null,
        deptFilter: null,
        collapsed: collapseUnderRoots(employees),
        focusId: null,
        rosterNonce: s.rosterNonce + 1,
        lastMessage: `Loaded ${employees.length} people.`,
      };
    }),

  reparent: (nodeId, newManagerId) => {
    const { employees } = get();
    if (newManagerId && wouldCreateCycle(employees, nodeId, newManagerId)) {
      set({ lastMessage: "Can't move — that would put a manager under their own report." });
      return false;
    }
    const node = employees.find((e) => e.id === nodeId);
    if (!node) return false;
    if (node.managerId === newManagerId) return false;

    const label = `Moved ${node.name}`;
    set((s) => ({
      past: [...s.past, { employees: clone(s.employees), label }],
      future: [],
      employees: s.employees.map((e) =>
        e.id === nodeId ? { ...e, managerId: newManagerId } : e
      ),
      lastMessage: label,
    }));
    return true;
  },

  updateEmployee: (id, patch) =>
    set((s) => ({
      past: [...s.past, { employees: clone(s.employees), label: "Edit" }],
      future: [],
      employees: s.employees.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    })),

  deleteEmployee: (id, mode = "promote") =>
    set((s) => {
      const target = s.employees.find((e) => e.id === id);
      if (!target) return s;
      const reports = s.employees.filter((e) => e.managerId === id);
      // promote = reports rise to the deleted node's manager; orphan = become roots.
      const newMgr = mode === "promote" ? target.managerId ?? null : null;
      const employees = s.employees
        .filter((e) => e.id !== id)
        .map((e) => (e.managerId === id ? { ...e, managerId: newMgr } : e));
      const note =
        reports.length === 0
          ? `Removed ${target.name}.`
          : mode === "promote"
          ? `Removed ${target.name}; ${reports.length} report${reports.length === 1 ? "" : "s"} moved up a level.`
          : `Removed ${target.name}; ${reports.length} report${reports.length === 1 ? "" : "s"} left unassigned — drag them to a new manager.`;
      return {
        past: [...s.past, { employees: clone(s.employees), label: `Removed ${target.name}` }],
        future: [],
        employees,
        selectedId: null,
        lastMessage: note,
      };
    }),

  select: (id) => set({ selectedId: id }),

  setThresholds: (t) => set((s) => ({ thresholds: { ...s.thresholds, ...t } })),

  // Save the current org as a new named snapshot and make it the active baseline.
  saveBaseline: (label) => {
    const name = (label ?? "").trim() || `Baseline ${nowStr()}`;
    set((s) => {
      const snap = makeSnapshot(name, s.employees);
      return {
        snapshots: [...s.snapshots, snap],
        baselineId: snap.id,
        baseline: clone(snap.employees),
        baselineLabel: snap.label,
        baselineAt: snap.at,
        lastMessage: `Baseline saved: “${name}” (${s.snapshots.length + 1} saved)`,
      };
    });
  },

  // Load a saved snapshot back into the working org (undoable).
  restoreSnapshot: (id) =>
    set((s) => {
      const snap = s.snapshots.find((x) => x.id === id);
      if (!snap) return s;
      return {
        past: [...s.past, { employees: clone(s.employees), label: `Restore ${snap.label}` }],
        future: [],
        employees: clone(snap.employees),
        collapsed: collapseUnderRoots(snap.employees),
        selectedId: null,
        focusId: null,
        rosterNonce: s.rosterNonce + 1,
        lastMessage: `Restored “${snap.label}”.`,
      };
    }),

  // Choose which snapshot the change report / metric deltas compare against.
  setActiveBaseline: (id) =>
    set((s) => {
      const snap = s.snapshots.find((x) => x.id === id);
      if (!snap) return s;
      return {
        baselineId: snap.id,
        baseline: clone(snap.employees),
        baselineLabel: snap.label,
        baselineAt: snap.at,
        lastMessage: `Now comparing against “${snap.label}”.`,
      };
    }),

  deleteSnapshot: (id) =>
    set((s) => {
      const snapshots = s.snapshots.filter((x) => x.id !== id);
      if (snapshots.length === s.snapshots.length) return s;
      // If the active baseline was deleted, fall back to the most recent remaining.
      let { baselineId, baseline, baselineLabel, baselineAt } = s;
      if (baselineId === id) {
        const next = snapshots[snapshots.length - 1];
        baselineId = next?.id ?? null;
        baseline = next ? clone(next.employees) : s.baseline;
        baselineLabel = next?.label ?? s.baselineLabel;
        baselineAt = next?.at ?? s.baselineAt;
      }
      return { snapshots, baselineId, baseline, baselineLabel, baselineAt };
    }),

  undo: () =>
    set((s) => {
      if (s.past.length === 0) return s;
      const prev = s.past[s.past.length - 1];
      return {
        past: s.past.slice(0, -1),
        future: [{ employees: clone(s.employees), label: prev.label }, ...s.future],
        employees: prev.employees,
        lastMessage: `Undo: ${prev.label}`,
      };
    }),

  redo: () =>
    set((s) => {
      if (s.future.length === 0) return s;
      const next = s.future[0];
      return {
        future: s.future.slice(1),
        past: [...s.past, { employees: clone(s.employees), label: next.label }],
        employees: next.employees,
        lastMessage: `Redo: ${next.label}`,
      };
    }),

  clearMessage: () => set({ lastMessage: null }),
}));

/**
 * Collapse every manager except the top-level roots, so the org opens as just
 * the leader(s) plus their direct reports — each branch can then be expanded.
 */
export function collapseUnderRoots(employees: Employee[]): Set<string> {
  const byId = new Map(employees.map((e) => [e.id, e]));
  const isRoot = new Set<string>();
  const hasReports = new Set<string>();
  for (const e of employees) {
    if (!e.managerId || !byId.has(e.managerId)) isRoot.add(e.id);
    if (e.managerId && byId.has(e.managerId)) hasReports.add(e.managerId);
  }
  const collapsed = new Set<string>();
  for (const id of hasReports) if (!isRoot.has(id)) collapsed.add(id);
  return collapsed;
}

/** Sorted unique department names present in the roster. */
export function departmentsOf(employees: Employee[]): string[] {
  const set = new Set<string>();
  for (const e of employees) if (e.department) set.add(e.department);
  return [...set].sort((a, b) => a.localeCompare(b));
}

/**
 * Scope the roster to one department. People whose manager sits outside the
 * department become roots of their own sub-tree (the layout handles this).
 */
export function filterByDept(
  employees: Employee[],
  dept: string | null
): Employee[] {
  if (!dept) return employees;
  return employees.filter((e) => (e.department ?? "") === dept);
}
