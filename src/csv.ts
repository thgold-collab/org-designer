import Papa from "papaparse";
import type { Employee } from "./types";

/** Candidate header names for each field (lowercased, punctuation-stripped). */
const FIELD_ALIASES: Record<keyof Employee | "managerId", string[]> = {
  id: ["id", "employeeid", "empid", "workerid", "personid", "employeenumber", "userid"],
  name: ["name", "fullname", "employeename", "workername", "displayname"],
  title: ["title", "jobtitle", "position", "role", "job"],
  managerId: [
    "managerid",
    "manager",
    "managerempid",
    "supervisorid",
    "supervisor",
    "reportsto",
    "reportstoid",
    "parentid",
    "managername",
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

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export interface ParseResult {
  employees: Employee[];
  warnings: string[];
  mapping: Record<string, string>; // field -> original header used
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

export function parseRoster(text: string): ParseResult {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const warnings: string[] = [];
  const headers = parsed.meta.fields ?? [];
  const normToOriginal = new Map<string, string>();
  for (const h of headers) normToOriginal.set(norm(h), h);

  // Resolve which original header maps to each logical field.
  const mapping: Record<string, string> = {};
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) {
      if (normToOriginal.has(alias)) {
        mapping[field] = normToOriginal.get(alias)!;
        break;
      }
    }
  }

  if (!mapping.id && !mapping.name) {
    warnings.push("Could not find an ID or Name column — rows may not link correctly.");
  }
  if (!mapping.managerId) {
    warnings.push("No manager/reports-to column found — everyone will appear as a root.");
  }

  // If we matched on managerName (not an id), we'll resolve names→ids after load.
  const managerIsName = mapping.managerId === normToOriginal.get("managername");

  const rows = parsed.data.filter((r) => Object.values(r).some((v) => v && v.trim()));
  const employees: Employee[] = [];
  const nameToId = new Map<string, string>();
  let autoId = 0;

  for (const r of rows) {
    const get = (f: string) => (mapping[f] ? (r[mapping[f]] ?? "").trim() : "");
    const id = get("id") || get("name") || `auto-${autoId++}`;
    const name = get("name") || get("id") || id;
    nameToId.set(norm(name), id);

    employees.push({
      id,
      name,
      title: get("title") || undefined,
      managerId: get("managerId") || null,
      salary: num(get("salary")),
      level: get("level") || undefined,
      fte: num(get("fte")),
      department: get("department") || undefined,
      location: get("location") || undefined,
      costCenter: get("costCenter") || undefined,
      tenureMonths: num(get("tenureMonths")),
      rating: get("rating") || undefined,
      isVacancy: bool(get("isVacancy")),
    });
  }

  // If manager column held names, convert to ids.
  if (managerIsName) {
    for (const e of employees) {
      if (e.managerId) {
        const resolved = nameToId.get(norm(e.managerId));
        e.managerId = resolved ?? null;
      }
    }
  }

  // De-dupe ids (keep first, warn).
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

  return { employees, warnings, mapping };
}
