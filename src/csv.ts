import Papa from "papaparse";
import type { Employee } from "./types";

type FieldKey = keyof Employee | "managerId";

/** Candidate header names for each field (lowercased, punctuation-stripped). */
const FIELD_ALIASES: Record<FieldKey, string[]> = {
  id: ["id", "employeeid", "empid", "workerid", "personid", "employeenumber", "userid"],
  name: ["name", "fullname", "employeename", "workername", "displayname"],
  title: ["title", "jobtitle", "position", "role", "job"],
  managerId: [
    "managerid", "manager", "managerempid", "supervisorid", "supervisor",
    "reportsto", "reportstoid", "parentid", "managername", "linemanager", "boss",
  ],
  salary: ["salary", "comp", "compensation", "basesalary", "pay", "totalcomp", "annualsalary"],
  level: ["level", "grade", "joblevel", "band", "jobgrade", "tier"],
  fte: ["fte", "ftestatus", "fulltimeequivalent"],
  department: ["department", "dept", "team", "org", "function", "businessunit", "division"],
  location: ["location", "site", "region", "country", "office", "city"],
  costCenter: ["costcenter", "cc", "costcentre", "costcenterid"],
  tenureMonths: ["tenure", "tenuremonths", "monthsofservice", "tenureinmonths"],
  rating: ["rating", "performance", "performancerating", "perfrating", "review"],
  isVacancy: ["vacancy", "isvacancy", "open", "openreq", "vacant", "tbh"],
};

/** Fields shown (in order) in the import wizard. */
export const ROSTER_FIELDS: { key: FieldKey; label: string; needed?: boolean }[] = [
  { key: "name", label: "Name", needed: true },
  { key: "id", label: "Employee ID" },
  { key: "managerId", label: "Reports to (manager ID or name)", needed: true },
  { key: "title", label: "Job title" },
  { key: "department", label: "Department" },
  { key: "location", label: "Location" },
  { key: "level", label: "Level / grade" },
  { key: "salary", label: "Salary" },
  { key: "fte", label: "FTE" },
  { key: "costCenter", label: "Cost center" },
  { key: "tenureMonths", label: "Tenure (months)" },
  { key: "rating", label: "Performance rating" },
  { key: "isVacancy", label: "Open role / vacancy" },
];

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function num(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(String(v).replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

function bool(v: unknown): boolean | undefined {
  if (v == null || v === "") return undefined;
  const s = String(v).trim().toLowerCase();
  if (["true", "yes", "y", "1", "vacant", "open"].includes(s)) return true;
  if (["false", "no", "n", "0"].includes(s)) return false;
  return undefined;
}

export interface RawCsv {
  headers: string[];
  rows: Record<string, string>[];
}

export interface BuildResult {
  employees: Employee[];
  warnings: string[];
}

/** Parse CSV text into raw headers + rows, no field interpretation yet. */
export function parseCsvRaw(text: string): RawCsv {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  const headers = (parsed.meta.fields ?? []).filter((h) => h && h.trim());
  const rows = parsed.data.filter((r) => Object.values(r).some((v) => v && String(v).trim()));
  return { headers, rows };
}

/** Best-guess mapping from logical field -> original header. */
export function autoMap(headers: string[]): Record<string, string> {
  const normToOriginal = new Map<string, string>();
  for (const h of headers) normToOriginal.set(norm(h), h);
  const mapping: Record<string, string> = {};
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) {
      if (normToOriginal.has(alias)) {
        mapping[field] = normToOriginal.get(alias)!;
        break;
      }
    }
  }
  return mapping;
}

/** A mapping is usable for the fast path if it has an identifier and a manager link. */
export function mappingIsComplete(mapping: Record<string, string>): boolean {
  return !!(mapping.id || mapping.name) && !!mapping.managerId;
}

/** Build employees from rows given a column mapping. Resolves managers by id or name. */
export function buildEmployees(
  rows: Record<string, string>[],
  mapping: Record<string, string>
): BuildResult {
  const warnings: string[] = [];
  const get = (r: Record<string, string>, f: FieldKey) =>
    mapping[f] ? String(r[mapping[f]] ?? "").trim() : "";

  let autoId = 0;
  const employees: Employee[] = [];
  for (const r of rows) {
    const id = get(r, "id") || get(r, "name") || `auto-${autoId++}`;
    const name = get(r, "name") || get(r, "id") || id;
    employees.push({
      id,
      name,
      title: get(r, "title") || undefined,
      managerId: get(r, "managerId") || null, // raw for now; resolved below
      salary: num(get(r, "salary")),
      level: get(r, "level") || undefined,
      fte: num(get(r, "fte")),
      department: get(r, "department") || undefined,
      location: get(r, "location") || undefined,
      costCenter: get(r, "costCenter") || undefined,
      tenureMonths: num(get(r, "tenureMonths")),
      rating: get(r, "rating") || undefined,
      isVacancy: bool(get(r, "isVacancy")),
    });
  }

  // De-dupe ids first so all downstream lookups use final ids.
  const seen = new Set<string>();
  let dupes = 0;
  for (const e of employees) {
    if (seen.has(e.id)) {
      dupes++;
      e.id = `${e.id}-dup${dupes}`;
    }
    seen.add(e.id);
  }
  if (dupes) warnings.push(`${dupes} duplicate ID(s) were renamed to keep them distinct.`);

  // Resolve each manager reference: prefer an exact id, else match by name.
  const idSet = new Set(employees.map((e) => e.id));
  const nameToId = new Map<string, string>();
  for (const e of employees) nameToId.set(norm(e.name), e.id);

  let unresolved = 0;
  for (const e of employees) {
    if (!e.managerId) continue;
    if (idSet.has(e.managerId)) continue;
    const byName = nameToId.get(norm(e.managerId));
    if (byName) {
      e.managerId = byName;
      continue;
    }
    e.managerId = null;
    unresolved++;
  }

  if (!mapping.id && !mapping.name) {
    warnings.push("No ID or Name column mapped — rows may not link correctly.");
  }
  if (!mapping.managerId) {
    warnings.push("No manager/reports-to column mapped — everyone appears at the top level.");
  } else if (unresolved) {
    warnings.push(
      `${unresolved} manager reference(s) didn't match any ID or name — those people are shown as roots.`
    );
  }

  return { employees, warnings };
}

export interface ParseResult extends BuildResult {
  mapping: Record<string, string>;
}

/** One-shot parse with auto-mapping (used for the bundled sample + fast path). */
export function parseRoster(text: string): ParseResult {
  const { headers, rows } = parseCsvRaw(text);
  const mapping = autoMap(headers);
  const { employees, warnings } = buildEmployees(rows, mapping);
  return { employees, warnings, mapping };
}
