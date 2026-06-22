import { useMemo, useRef, useState } from "react";
import { useOrg, departmentsOf } from "../store";
import { parseRoster } from "../csv";
import { SAMPLE_CSV, SAMPLE_ROSTER } from "../sampleData";
import type { Employee } from "../types";

function exportCsv(employees: Employee[]): string {
  const cols: (keyof Employee)[] = [
    "id", "name", "title", "managerId", "salary", "level", "fte",
    "department", "location", "costCenter", "tenureMonths", "rating", "isVacancy",
  ];
  const headers = [
    "Employee ID", "Name", "Title", "Manager ID", "Salary", "Level", "FTE",
    "Department", "Location", "Cost Center", "Tenure (mo)", "Rating", "Vacancy",
  ];
  const esc = (v: unknown) => {
    if (v == null) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(",")];
  for (const e of employees) lines.push(cols.map((c) => esc(e[c])).join(","));
  return lines.join("\n");
}

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function Toolbar() {
  const loadRoster = useOrg((s) => s.loadRoster);
  const employees = useOrg((s) => s.employees);
  const setBaseline = useOrg((s) => s.setBaselineToCurrent);
  const reset = useOrg((s) => s.resetToBaseline);
  const undo = useOrg((s) => s.undo);
  const redo = useOrg((s) => s.redo);
  const canUndo = useOrg((s) => s.past.length > 0);
  const canRedo = useOrg((s) => s.future.length > 0);
  const thresholds = useOrg((s) => s.thresholds);
  const setThresholds = useOrg((s) => s.setThresholds);
  const deptFilter = useOrg((s) => s.deptFilter);
  const setDeptFilter = useOrg((s) => s.setDeptFilter);
  const fileRef = useRef<HTMLInputElement>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const deptCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of employees) if (e.department) counts.set(e.department, (counts.get(e.department) ?? 0) + 1);
    return counts;
  }, [employees]);
  const departments = useMemo(() => departmentsOf(employees), [employees]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const { employees: emps, warnings: w } = parseRoster(text);
    if (emps.length === 0) {
      setWarnings(["No rows could be parsed from that file."]);
      return;
    }
    loadRoster(emps);
    setWarnings(w);
    e.target.value = "";
  }

  return (
    <>
      <div className="toolbar">
        <div className="brand">Org <span>Designer</span></div>

        <button onClick={() => fileRef.current?.click()}>Import CSV…</button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} />
        <button onClick={() => loadRoster(SAMPLE_ROSTER)}>Load sample</button>
        <button onClick={() => download("sample-roster.csv", SAMPLE_CSV)}>Get template</button>

        <div style={{ width: 1, height: 22, background: "var(--border)" }} />

        <select
          className="dept-select"
          value={deptFilter ?? ""}
          onChange={(e) => setDeptFilter(e.target.value || null)}
          title="Scope the chart and metrics to one department"
        >
          <option value="">All departments ({employees.length})</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d} ({deptCounts.get(d) ?? 0})
            </option>
          ))}
        </select>

        <div style={{ width: 1, height: 22, background: "var(--border)" }} />

        <button onClick={undo} disabled={!canUndo} title="Undo (⌘Z)">↶ Undo</button>
        <button onClick={redo} disabled={!canRedo} title="Redo">↷ Redo</button>

        <div className="spacer" />

        <div className="thresh">
          <span>span flags</span>
          narrow&lt;
          <input
            type="number"
            value={thresholds.narrow}
            min={1}
            onChange={(e) => setThresholds({ narrow: Number(e.target.value) })}
          />
          wide&gt;
          <input
            type="number"
            value={thresholds.wide}
            min={1}
            onChange={(e) => setThresholds({ wide: Number(e.target.value) })}
          />
        </div>

        <div style={{ width: 1, height: 22, background: "var(--border)" }} />

        <button onClick={setBaseline} title="Snapshot current org as the 'before' to compare against">
          Set baseline
        </button>
        <button onClick={reset} className="danger">Reset to baseline</button>
        <button className="primary" onClick={() => download("org-scenario.csv", exportCsv(employees))}>
          Export CSV
        </button>
      </div>
      {warnings.length > 0 && (
        <div style={{ padding: "0 14px" }}>
          <div className="warn-box">
            {warnings.map((w, i) => (
              <div key={i}>⚠ {w}</div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
