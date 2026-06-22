import { create } from "zustand";
import type { Employee, Thresholds } from "./types";
import { wouldCreateCycle } from "./metrics";
import { SAMPLE_ROSTER } from "./sampleData";

interface HistoryEntry {
  employees: Employee[];
  label: string;
}

interface OrgState {
  employees: Employee[]; // working set
  baseline: Employee[]; // snapshot for before/after diff
  thresholds: Thresholds;
  selectedId: string | null;
  deptFilter: string | null; // null = whole org
  collapsed: Set<string>; // node ids whose subtree is hidden
  focusId: string | null; // node the chart should center on
  focusNonce: number; // bumps to re-trigger focus on the same id
  rosterNonce: number; // bumps when a new roster loads (chart re-fits)
  past: HistoryEntry[];
  future: HistoryEntry[];
  lastMessage: string | null;

  setDeptFilter: (dept: string | null) => void;
  toggleCollapse: (id: string) => void;
  collapseAll: () => void;
  expandAll: () => void;
  focusNode: (id: string) => void;
  loadRoster: (employees: Employee[], makeBaseline?: boolean) => void;
  reparent: (nodeId: string, newManagerId: string | null) => boolean;
  updateEmployee: (id: string, patch: Partial<Employee>) => void;
  deleteEmployee: (id: string) => void;
  select: (id: string | null) => void;
  setThresholds: (t: Partial<Thresholds>) => void;
  setBaselineToCurrent: () => void;
  resetToBaseline: () => void;
  undo: () => void;
  redo: () => void;
  clearMessage: () => void;
}

const clone = (e: Employee[]) => e.map((x) => ({ ...x }));

export const useOrg = create<OrgState>((set, get) => ({
  employees: clone(SAMPLE_ROSTER),
  baseline: clone(SAMPLE_ROSTER),
  thresholds: { narrow: 3, wide: 9 },
  selectedId: null,
  deptFilter: null,
  collapsed: new Set<string>(),
  focusId: null,
  focusNonce: 0,
  rosterNonce: 0,
  past: [],
  future: [],
  lastMessage: null,

  setDeptFilter: (dept) => set({ deptFilter: dept, selectedId: null }),

  toggleCollapse: (id) =>
    set((s) => {
      const collapsed = new Set(s.collapsed);
      if (collapsed.has(id)) collapsed.delete(id);
      else collapsed.add(id);
      return { collapsed };
    }),

  collapseAll: () =>
    set((s) => {
      // Collapse every manager except the top-level roots so the org reads
      // as one row of leaders that can be opened up one branch at a time.
      const hasReports = new Set<string>();
      const isRoot = new Set<string>();
      const byId = new Map(s.employees.map((e) => [e.id, e]));
      for (const e of s.employees) {
        if (e.managerId && byId.has(e.managerId)) hasReports.add(e.managerId);
        if (!e.managerId || !byId.has(e.managerId)) isRoot.add(e.id);
      }
      const collapsed = new Set<string>();
      for (const id of hasReports) if (!isRoot.has(id)) collapsed.add(id);
      return { collapsed, lastMessage: "Collapsed all branches." };
    }),

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

  loadRoster: (employees, makeBaseline = true) =>
    set((s) => ({
      employees: clone(employees),
      baseline: makeBaseline ? clone(employees) : s.baseline,
      past: [],
      future: [],
      selectedId: null,
      deptFilter: null,
      collapsed: new Set<string>(),
      focusId: null,
      rosterNonce: s.rosterNonce + 1,
      lastMessage: `Loaded ${employees.length} people.`,
    })),

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

  deleteEmployee: (id) =>
    set((s) => {
      const target = s.employees.find((e) => e.id === id);
      if (!target) return s;
      // Re-home orphans to the deleted node's manager.
      const employees = s.employees
        .filter((e) => e.id !== id)
        .map((e) => (e.managerId === id ? { ...e, managerId: target.managerId } : e));
      return {
        past: [...s.past, { employees: clone(s.employees), label: `Removed ${target.name}` }],
        future: [],
        employees,
        selectedId: null,
        lastMessage: `Removed ${target.name}; reports moved up a level.`,
      };
    }),

  select: (id) => set({ selectedId: id }),

  setThresholds: (t) => set((s) => ({ thresholds: { ...s.thresholds, ...t } })),

  setBaselineToCurrent: () =>
    set((s) => ({ baseline: clone(s.employees), lastMessage: "Baseline set to current org." })),

  resetToBaseline: () =>
    set((s) => ({
      past: [...s.past, { employees: clone(s.employees), label: "Reset to baseline" }],
      future: [],
      employees: clone(s.baseline),
      lastMessage: "Reverted to baseline.",
    })),

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
