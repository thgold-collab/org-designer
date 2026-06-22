import { useMemo, useState } from "react";
import { buildEmployees, ROSTER_FIELDS } from "../csv";
import type { Employee } from "../types";

interface Props {
  fileName: string;
  headers: string[];
  rows: Record<string, string>[];
  initialMapping: Record<string, string>;
  onCancel: () => void;
  onImport: (employees: Employee[]) => void;
}

export function ImportWizard({ fileName, headers, rows, initialMapping, onCancel, onImport }: Props) {
  const [mapping, setMapping] = useState<Record<string, string>>(initialMapping);

  const { employees, warnings } = useMemo(() => buildEmployees(rows, mapping), [rows, mapping]);
  const nameById = useMemo(() => new Map(employees.map((e) => [e.id, e.name])), [employees]);
  const managerCount = useMemo(
    () => new Set(employees.filter((e) => e.managerId).map((e) => e.managerId)).size,
    [employees]
  );
  const roots = employees.filter((e) => !e.managerId);
  const hasIdentifier = !!(mapping.id || mapping.name);

  function setField(field: string, header: string) {
    setMapping((m) => {
      const next = { ...m };
      if (header) next[field] = header;
      else delete next[field];
      return next;
    });
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Map your roster columns</h2>
        <div className="modal-sub">
          {fileName} · {rows.length} rows · {headers.length} columns
        </div>

        <div className="map-grid">
          {ROSTER_FIELDS.map((f) => (
            <div className="map-row" key={f.key}>
              <label>
                {f.label}
                {f.needed && <span className="needed"> · needed</span>}
              </label>
              <select value={mapping[f.key] ?? ""} onChange={(e) => setField(f.key, e.target.value)}>
                <option value="">— none —</option>
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <div className="map-preview">
          <div className="preview-stats">
            <strong>{employees.length}</strong> people ·{" "}
            <strong>{managerCount}</strong> managers · <strong>{roots.length}</strong> at top level
          </div>
          {!hasIdentifier && (
            <div className="warn-line">⚠ Map a Name or Employee ID column to continue.</div>
          )}
          {warnings.map((w, i) => (
            <div className="warn-line" key={i}>
              ⚠ {w}
            </div>
          ))}
          <table className="preview-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Title</th>
                <th>Reports to</th>
              </tr>
            </thead>
            <tbody>
              {employees.slice(0, 6).map((e) => (
                <tr key={e.id}>
                  <td>{e.name}</td>
                  <td>{e.title ?? "—"}</td>
                  <td>{e.managerId ? nameById.get(e.managerId) ?? e.managerId : "(top of org)"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="modal-actions">
          <button onClick={onCancel}>Cancel</button>
          <button className="primary" disabled={!hasIdentifier} onClick={() => onImport(employees)}>
            Import {employees.length} people
          </button>
        </div>
      </div>
    </div>
  );
}
