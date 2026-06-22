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
  showDiff: boolean; // highlight added/moved nodes vs the active baseline
  past: HistoryEntry[];
  future: HistoryEntry[];
  lastMessage: string | null;

  toggleDiff: () => void;
  toggleAutoCenter: () => void;
  setDeptFilter: (dept: string | null) => void;
  toggleCollapse: (id: string) => void;
  collapseAll: () => void;
  expandAll: () => void;
  focusNode: (id: string) => void;
  addOpenRole: (managerId?: string | null) => void;
  addPerson: (managerId?: string | null) => void;
  loadRoster: (employees: Employee[], makeBaseline?: boolean) => void;
  reparent: (nodeId: string, newManagerId: string | null) => boolean;
  updateEmployee: (id: string, patch: Partial<Employee>) => void;
  deleteEmployee: (id: string, mode?: "promote" | "orphan") => void;
  removeByStatus: (status: "open" | "future") => void;
  delayerSingleReports: () => void;
  reassignReports: (fromId: string, toId: string) => void;
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

// --- Autosave (on-device localStorage; nothing leaves the machine) ---
const PERSIST_KEY = "org-designer-state-v1";
interface Persisted {
  employees: Employee[];
  snapshots: Snapshot[];
  baselineId: string | null;
  baseline: Employee[];
  baselineLabel: string;
  baselineAt: string;
  thresholds: Thresholds;
  collapsed: string[];
  deptFilter: string | null;
}
function loadPersisted(): Persisted | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || !Array.isArray(d.employees) || d.employees.length === 0) return null;
    return d as Persisted;
  } catch {
    return null;
  }
}
const SAVED = loadPersisted();
if (SAVED?.snapshots?.length) {
  // Keep new snapshot ids from colliding with restored ones.
  const maxN = Math.max(
    0,
    ...SAVED.snapshots.map((s) => parseInt(String(s.id).replace("snap-", ""), 10) || 0)
  );
  snapSeq = maxN + 1;
}

export const useOrg = create<OrgState>((set, get) => ({
  employees: clone(SAVED?.employees ?? SAMPLE_ROSTER),
  snapshots: SAVED?.snapshots ?? [INITIAL_SNAPSHOT],
  baselineId: SAVED?.baselineId ?? INITIAL_SNAPSHOT.id,
  baseline: clone(SAVED?.baseline ?? INITIAL_SNAPSHOT.employees),
  baselineLabel: SAVED?.baselineLabel ?? INITIAL_SNAPSHOT.label,
  baselineAt: SAVED?.baselineAt ?? INITIAL_SNAPSHOT.at,
  thresholds: SAVED?.thresholds ?? { narrow: 3, wide: 9 },
  selectedId: null,
  deptFilter: SAVED?.deptFilter ?? null,
  collapsed: SAVED?.collapsed ? new Set(SAVED.collapsed) : collapseUnderRoots(SAMPLE_ROSTER),
  focusId: null,
  focusNonce: 0,
  editNonce: 0,
  rosterNonce: 0,
  // Off by default: free panning. Clamp keeps the org on screen; the Recenter/Fit
  // buttons and this toggle are there if you want snap-to-center behavior.
  autoCenter: false,
  showDiff: false,
  past: [],
  future: [],
  lastMessage: null,

  toggleDiff: () => set((s) => ({ showDiff: !s.showDiff })),

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

  addOpenRole: (managerId) => set((s) => addRolePatch(s, managerId, "open")),
  addPerson: (managerId) => set((s) => addRolePatch(s, managerId, undefined)),

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

  // Bulk: delete every position with a given status (reports promoted up).
  removeByStatus: (status) =>
    set((s) => {
      const removed = new Set(s.employees.filter((e) => e.status === status).map((e) => e.id));
      const noun = status === "open" ? "open role" : "future hire";
      if (removed.size === 0) return { lastMessage: `No ${noun}s to remove.` };
      const employees = promoteAfterRemoval(s.employees, removed);
      const label = `Removed ${removed.size} ${noun}${removed.size === 1 ? "" : "s"}`;
      return {
        past: [...s.past, { employees: clone(s.employees), label }],
        future: [],
        employees,
        selectedId: null,
        lastMessage: label + ".",
      };
    }),

  // Bulk: remove every manager with exactly one direct report, promoting it up.
  delayerSingleReports: () =>
    set((s) => {
      const childCount = new Map<string, number>();
      for (const e of s.employees) {
        if (e.managerId) childCount.set(e.managerId, (childCount.get(e.managerId) ?? 0) + 1);
      }
      const removed = new Set(s.employees.filter((e) => childCount.get(e.id) === 1).map((e) => e.id));
      if (removed.size === 0) return { lastMessage: "No single-report managers to de-layer." };
      const employees = promoteAfterRemoval(s.employees, removed);
      const label = `De-layered ${removed.size} single-report manager${removed.size === 1 ? "" : "s"}`;
      return {
        past: [...s.past, { employees: clone(s.employees), label }],
        future: [],
        employees,
        selectedId: null,
        lastMessage: label + ".",
      };
    }),

  // Bulk: move all of one manager's direct reports under another manager.
  reassignReports: (fromId, toId) =>
    set((s) => {
      if (fromId === toId) return s;
      let moved = 0;
      const employees = s.employees.map((e) => {
        if (e.managerId === fromId && !wouldCreateCycle(s.employees, e.id, toId)) {
          moved++;
          return { ...e, managerId: toId };
        }
        return e;
      });
      if (moved === 0) return { lastMessage: "No reports could be moved (none, or would create a cycle)." };
      const fromName = s.employees.find((e) => e.id === fromId)?.name ?? "?";
      const toName = s.employees.find((e) => e.id === toId)?.name ?? "?";
      const label = `Moved ${moved} report${moved === 1 ? "" : "s"} from ${fromName} to ${toName}`;
      return {
        past: [...s.past, { employees: clone(s.employees), label }],
        future: [],
        employees,
        selectedId: null,
        lastMessage: label + ".",
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

// Debounced autosave of the working draft to localStorage (on-device only).
if (typeof window !== "undefined") {
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  useOrg.subscribe((s) => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(
          PERSIST_KEY,
          JSON.stringify({
            employees: s.employees,
            snapshots: s.snapshots,
            baselineId: s.baselineId,
            baseline: s.baseline,
            baselineLabel: s.baselineLabel,
            baselineAt: s.baselineAt,
            thresholds: s.thresholds,
            collapsed: [...s.collapsed],
            deptFilter: s.deptFilter,
          } satisfies Persisted)
        );
      } catch {
        /* quota or serialization issue — skip this save */
      }
    }, 400);
  });
}

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

/** Shared logic for adding a person / open role / future hire under a manager. */
function addRolePatch(s: OrgState, managerId: string | null | undefined, status: Employee["status"]) {
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

  const name = status === "open" ? "Open Role" : status === "future" ? "Future Hire" : "New Person";
  const role: Employee = {
    id,
    name,
    title: "New Role",
    managerId: mid,
    status,
    // inherit so it stays in the same department filter / location grouping
    department: mgr?.department,
    location: mgr?.location,
  };

  const collapsed = new Set(s.collapsed);
  if (mid) collapsed.delete(mid); // expand the manager so the new node shows

  const noun = status === "open" ? "open role" : status === "future" ? "future hire" : "person";
  return {
    past: [...s.past, { employees: clone(s.employees), label: `Add ${noun}` }],
    future: [],
    employees: [...s.employees, role],
    collapsed,
    selectedId: id,
    focusId: id,
    focusNonce: s.focusNonce + 1,
    editNonce: s.editNonce + 1,
    lastMessage: `Added ${noun} — edit the details in the panel.`,
  };
}

/**
 * Remove a set of ids, re-homing each removed node's reports to the nearest
 * surviving ancestor (walking past other removed nodes). Used by bulk actions.
 */
export function promoteAfterRemoval(employees: Employee[], removed: Set<string>): Employee[] {
  const byId = new Map(employees.map((e) => [e.id, e]));
  const surviving = (startMgr: string | null): string | null => {
    let cur = startMgr;
    const seen = new Set<string>();
    while (cur && removed.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      cur = byId.get(cur)?.managerId ?? null;
    }
    return cur && removed.has(cur) ? null : cur;
  };
  return employees
    .filter((e) => !removed.has(e.id))
    .map((e) => (e.managerId && removed.has(e.managerId) ? { ...e, managerId: surviving(e.managerId) } : e));
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
