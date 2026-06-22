import { describe, it, expect } from "vitest";
import {
  parseCsvRaw,
  autoMap,
  buildEmployees,
  mappingIsComplete,
  employeesToCsv,
  parseRoster,
} from "./csv";

describe("autoMap", () => {
  it("matches headers case/punctuation-insensitively and via aliases", () => {
    const m = autoMap(["Employee ID", "Full Name", "Reports To", "Job Title", "Dept"]);
    expect(m.id).toBe("Employee ID");
    expect(m.name).toBe("Full Name");
    expect(m.managerId).toBe("Reports To");
    expect(m.title).toBe("Job Title");
    expect(m.department).toBe("Dept");
  });

  it("leaves unknown headers unmapped", () => {
    const m = autoMap(["Person", "Leads Into"]);
    expect(m.name).toBeUndefined();
    expect(m.managerId).toBeUndefined();
  });
});

describe("mappingIsComplete", () => {
  it("requires an identifier and a manager link", () => {
    expect(mappingIsComplete({ name: "N", managerId: "M" })).toBe(true);
    expect(mappingIsComplete({ id: "I", managerId: "M" })).toBe(true);
    expect(mappingIsComplete({ name: "N" })).toBe(false);
    expect(mappingIsComplete({ managerId: "M" })).toBe(false);
  });
});

describe("buildEmployees", () => {
  const mapping = { id: "ID", name: "Name", managerId: "Mgr", status: "Status" };

  it("links managers by id", () => {
    const rows = [
      { ID: "1", Name: "Ann", Mgr: "", Status: "" },
      { ID: "2", Name: "Ben", Mgr: "1", Status: "" },
    ];
    const { employees } = buildEmployees(rows, mapping);
    expect(employees.find((e) => e.id === "2")!.managerId).toBe("1");
    expect(employees.find((e) => e.id === "1")!.managerId).toBeNull();
  });

  it("resolves managers given by name", () => {
    const rows = [
      { ID: "1", Name: "Ann", Mgr: "", Status: "" },
      { ID: "2", Name: "Ben", Mgr: "Ann", Status: "" },
    ];
    const { employees } = buildEmployees(rows, mapping);
    expect(employees.find((e) => e.id === "2")!.managerId).toBe("1");
  });

  it("parses status (open / future / filled)", () => {
    const rows = [
      { ID: "1", Name: "A", Mgr: "", Status: "Yes" },
      { ID: "2", Name: "B", Mgr: "1", Status: "future hire" },
      { ID: "3", Name: "C", Mgr: "1", Status: "" },
    ];
    const { employees } = buildEmployees(rows, mapping);
    expect(employees.find((e) => e.id === "1")!.status).toBe("open");
    expect(employees.find((e) => e.id === "2")!.status).toBe("future");
    expect(employees.find((e) => e.id === "3")!.status).toBeUndefined();
  });

  it("falls back to name as id and de-dupes ids", () => {
    const m2 = { name: "Name", managerId: "Mgr" };
    const rows = [
      { Name: "Sam", Mgr: "" },
      { Name: "Sam", Mgr: "" },
    ];
    const { employees, warnings } = buildEmployees(rows, m2);
    expect(employees[0].id).toBe("Sam");
    expect(employees[1].id).not.toBe("Sam"); // renamed to keep distinct
    expect(warnings.some((w) => /duplicate/i.test(w))).toBe(true);
  });

  it("warns when a manager reference matches nothing", () => {
    const { employees, warnings } = buildEmployees(
      [{ ID: "1", Name: "A", Mgr: "ghost", Status: "" }],
      mapping
    );
    expect(employees[0].managerId).toBeNull();
    expect(warnings.some((w) => /didn't match/i.test(w))).toBe(true);
  });
});

describe("CSV round-trip", () => {
  it("export then re-import preserves hierarchy and status", () => {
    const csv = employeesToCsv([
      { id: "1", name: "Ann", title: "CEO", managerId: null, salary: 100000 },
      { id: "2", name: "Ben", title: "Eng", managerId: "1", status: "open" },
    ]);
    const { employees } = parseRoster(csv);
    expect(employees).toHaveLength(2);
    const ben = employees.find((e) => e.id === "2")!;
    expect(ben.managerId).toBe("1");
    expect(ben.status).toBe("open");
    expect(employees.find((e) => e.id === "1")!.salary).toBe(100000);
  });
});

describe("parseCsvRaw", () => {
  it("returns headers and non-empty rows", () => {
    const { headers, rows } = parseCsvRaw("A,B\n1,2\n\n3,4\n");
    expect(headers).toEqual(["A", "B"]);
    expect(rows).toHaveLength(2);
  });
});
