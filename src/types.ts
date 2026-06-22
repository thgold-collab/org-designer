export interface Employee {
  id: string;
  name: string;
  title?: string;
  managerId: string | null;

  // Comp & level
  salary?: number;
  level?: string;
  fte?: number;

  // Location & dept
  department?: string;
  location?: string;
  costCenter?: string;

  // Performance / flags
  tenureMonths?: number;
  rating?: string;

  /** Role fill status. Undefined means a filled position (a current employee). */
  status?: EmpStatus;
}

/** A position can be filled, an open req, or a named-but-not-started future hire. */
export type EmpStatus = "open" | "future";

/** A node in the laid-out tree (positions added by d3-hierarchy). */
export interface LayoutNode {
  id: string;
  emp: Employee;
  x: number;
  y: number;
  depth: number;
  directReports: number;
  totalReports: number; // whole subtree, excluding self
  parentId: string | null;
  collapsed: boolean; // subtree hidden in the chart view
}

export interface OrgMetrics {
  headcount: number;
  managers: number;
  ics: number;
  vacancies: number; // open roles
  futureHires: number;

  // Spans of control (over managers only)
  avgSpan: number;
  medianSpan: number;
  maxSpan: number;
  minSpan: number;
  narrowSpans: number; // managers with < narrowThreshold reports
  wideSpans: number; // managers with > wideThreshold reports
  spanBuckets: { label: string; count: number }[];

  // Layers / depth
  maxDepth: number; // number of layers (root = layer 1)
  avgDepth: number;
  layerCounts: number[]; // headcount per layer index (0-based)

  // Ratios & cost
  managerRatio: number; // managers / total
  icPerManager: number; // ics / managers
  totalComp: number;
  managerComp: number;

  // Roots (handles forests)
  rootCount: number;
}

export interface SpanRow {
  id: string;
  name: string;
  title?: string;
  span: number;
  totalReports: number;
  depth: number;
  flag: "narrow" | "wide" | "ok";
}

export interface Thresholds {
  narrow: number; // span below this is flagged narrow
  wide: number; // span above this is flagged wide
}
