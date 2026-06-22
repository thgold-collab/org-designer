import { useMemo, useState } from "react";
import { useOrg } from "../store";
import { buildForest } from "../metrics";

export function BulkActions({ onClose }: { onClose: () => void }) {
  const employees = useOrg((s) => s.employees);
  const removeByStatus = useOrg((s) => s.removeByStatus);
  const delayer = useOrg((s) => s.delayerSingleReports);
  const reassign = useOrg((s) => s.reassignReports);

  const { childrenOf } = useMemo(() => buildForest(employees), [employees]);
  const openCount = employees.filter((e) => e.status === "open").length;
  const futureCount = employees.filter((e) => e.status === "future").length;
  const singleMgrCount = employees.filter((e) => (childrenOf.get(e.id)?.length ?? 0) === 1).length;
  const managersWithReports = useMemo(
    () => employees.filter((e) => (childrenOf.get(e.id)?.length ?? 0) > 0),
    [employees, childrenOf]
  );

  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");

  const Row = ({
    title,
    desc,
    count,
    cta,
    onClick,
  }: {
    title: string;
    desc: string;
    count: number;
    cta: string;
    onClick: () => void;
  }) => (
    <div className="bulk-row">
      <div className="bulk-meta">
        <div className="bulk-title">
          {title} <span className="bulk-count">{count}</span>
        </div>
        <div className="bulk-desc">{desc}</div>
      </div>
      <button className="danger" disabled={count === 0} onClick={onClick}>
        {cta}
      </button>
    </div>
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Bulk what-ifs</h2>
        <div className="modal-sub">Each action is a single undoable change (⌘Z). Try them, watch the metrics move.</div>

        <Row
          title="Remove all open roles"
          desc="Delete every open (unfilled) position. Any reports move up a level."
          count={openCount}
          cta="Remove"
          onClick={() => removeByStatus("open")}
        />
        <Row
          title="Remove all future hires"
          desc="Delete every planned future-hire position."
          count={futureCount}
          cta="Remove"
          onClick={() => removeByStatus("future")}
        />
        <Row
          title="De-layer single-report managers"
          desc="Remove every manager who has exactly one direct report; that report moves up. Widens spans, removes layers."
          count={singleMgrCount}
          cta="De-layer"
          onClick={delayer}
        />

        <div className="section-title" style={{ marginTop: 18 }}>Reassign a team</div>
        <div className="bulk-reassign">
          <select value={fromId} onChange={(e) => setFromId(e.target.value)}>
            <option value="">From manager…</option>
            {managersWithReports.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({childrenOf.get(m.id)?.length ?? 0})
              </option>
            ))}
          </select>
          <span className="ab-arrow">→</span>
          <select value={toId} onChange={(e) => setToId(e.target.value)}>
            <option value="">To manager…</option>
            {employees
              .filter((e) => e.id !== fromId)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
          </select>
          <button
            className="primary"
            disabled={!fromId || !toId || fromId === toId}
            onClick={() => {
              reassign(fromId, toId);
              setFromId("");
              setToId("");
            }}
          >
            Move
          </button>
        </div>

        <div className="modal-actions">
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
