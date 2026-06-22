import { useOrg } from "../store";
import { useMemo, useState } from "react";
import { buildForest } from "../metrics";

export function DetailPanel() {
  const employees = useOrg((s) => s.employees);
  const selectedId = useOrg((s) => s.selectedId);
  const update = useOrg((s) => s.updateEmployee);
  const del = useOrg((s) => s.deleteEmployee);
  const reparent = useOrg((s) => s.reparent);
  const addOpenRole = useOrg((s) => s.addOpenRole);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const emp = employees.find((e) => e.id === selectedId);
  const { childrenOf } = useMemo(() => buildForest(employees), [employees]);

  if (!emp) {
    return <div className="empty-state" style={{ height: 200 }}>Select a box to see and edit details.</div>;
  }

  const directReports = childrenOf.get(emp.id) ?? [];
  const managerOptions = employees.filter((e) => e.id !== emp.id);
  const managerName = emp.managerId
    ? employees.find((m) => m.id === emp.managerId)?.name ?? null
    : null;

  function onRemove() {
    if (!emp) return;
    if (directReports.length > 0) setConfirmDelete(true);
    else del(emp.id);
  }

  return (
    <div className="detail">
      <div className="section-title">Edit person</div>

      <label>Name</label>
      <input value={emp.name} onChange={(e) => update(emp.id, { name: e.target.value })} />

      <label>Title</label>
      <input value={emp.title ?? ""} onChange={(e) => update(emp.id, { title: e.target.value })} />

      <label>Reports to</label>
      <select
        value={emp.managerId ?? ""}
        onChange={(e) => reparent(emp.id, e.target.value || null)}
      >
        <option value="">— (top of org) —</option>
        {managerOptions.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
            {m.title ? ` · ${m.title}` : ""}
          </option>
        ))}
      </select>

      <div className="detail-row">
        <div>
          <label>Department</label>
          <input value={emp.department ?? ""} onChange={(e) => update(emp.id, { department: e.target.value })} />
        </div>
        <div>
          <label>Location</label>
          <input value={emp.location ?? ""} onChange={(e) => update(emp.id, { location: e.target.value })} />
        </div>
      </div>

      <div className="detail-row">
        <div>
          <label>Level</label>
          <input value={emp.level ?? ""} onChange={(e) => update(emp.id, { level: e.target.value })} />
        </div>
        <div>
          <label>Salary</label>
          <input
            type="number"
            value={emp.salary ?? ""}
            onChange={(e) => update(emp.id, { salary: e.target.value ? Number(e.target.value) : undefined })}
          />
        </div>
      </div>

      <label>Status</label>
      <select
        value={emp.status ?? "filled"}
        onChange={(e) =>
          update(emp.id, { status: e.target.value === "filled" ? undefined : (e.target.value as "open" | "future") })
        }
      >
        <option value="filled">Filled — current employee</option>
        <option value="open">Open role — to be hired</option>
        <option value="future">Known future hire — named, not started</option>
      </select>

      <div className="section-title">Snapshot</div>
      <div className="kpi-grid">
        <div className="kpi">
          <div className="k-label">Direct reports</div>
          <div className="k-value">{directReports.length}</div>
        </div>
        <div className="kpi">
          <div className="k-label">Employee ID</div>
          <div className="k-value" style={{ fontSize: 14 }}>{emp.id}</div>
        </div>
      </div>

      {directReports.length > 0 && (
        <>
          <div className="section-title">Direct reports</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            {directReports.map((r) => r.name).join(", ")}
          </div>
        </>
      )}

      <button style={{ marginTop: 16, width: "100%" }} onClick={() => addOpenRole(emp.id)}>
        + Add open role under {emp.name}
      </button>
      <button className="danger" style={{ marginTop: 8, width: "100%" }} onClick={onRemove}>
        Remove {emp.name}
      </button>

      {confirmDelete && (
        <div className="modal-backdrop" onClick={() => setConfirmDelete(false)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Remove {emp.name}</h2>
            <div className="modal-sub">
              {emp.name} has {directReports.length} direct report{directReports.length === 1 ? "" : "s"}.
              What should happen to them?
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
              <button
                className="primary"
                onClick={() => {
                  del(emp.id, "promote");
                  setConfirmDelete(false);
                }}
              >
                Move them up to {managerName ?? "the top level"}
              </button>
              <button
                onClick={() => {
                  del(emp.id, "orphan");
                  setConfirmDelete(false);
                }}
              >
                Leave them unassigned (drag to a new manager later)
              </button>
              <button onClick={() => setConfirmDelete(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
