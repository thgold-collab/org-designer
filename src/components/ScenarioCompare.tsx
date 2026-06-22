import { useMemo, useState } from "react";
import { useOrg } from "../store";
import { computeMetrics } from "../metrics";
import { diffRosters, openChangeReport } from "../report";
import type { Employee } from "../types";

const CURRENT = "__current__";
const money = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : `$${Math.round(n / 1000)}k`;
const f1 = (n: number) => n.toFixed(1);
const int = (n: number) => String(Math.round(n));

export function ScenarioCompare({ onClose }: { onClose: () => void }) {
  const snapshots = useOrg((s) => s.snapshots);
  const employees = useOrg((s) => s.employees);
  const baselineId = useOrg((s) => s.baselineId);
  const thresholds = useOrg((s) => s.thresholds);

  const options = useMemo(
    () => [{ id: CURRENT, label: "Current working org", at: "" }, ...snapshots.map((s) => ({ id: s.id, label: s.label, at: s.at }))],
    [snapshots]
  );

  const [aId, setAId] = useState(baselineId ?? CURRENT);
  const [bId, setBId] = useState(CURRENT);

  const empOf = (id: string): Employee[] =>
    id === CURRENT ? employees : snapshots.find((s) => s.id === id)?.employees ?? [];
  const labelOf = (id: string) => options.find((o) => o.id === id)?.label ?? "?";
  const atOf = (id: string) => options.find((o) => o.id === id)?.at ?? "";

  const aEmp = empOf(aId);
  const bEmp = empOf(bId);
  const a = useMemo(() => computeMetrics(aEmp, thresholds), [aEmp, thresholds]);
  const b = useMemo(() => computeMetrics(bEmp, thresholds), [bEmp, thresholds]);
  const diff = useMemo(() => diffRosters(aEmp, bEmp), [aEmp, bEmp]);

  const rows: [string, number, number, (n: number) => string][] = [
    ["Headcount", a.headcount, b.headcount, int],
    ["Managers", a.managers, b.managers, int],
    ["Individual contributors", a.ics, b.ics, int],
    ["Open roles", a.vacancies, b.vacancies, int],
    ["Future hires", a.futureHires, b.futureHires, int],
    ["Avg span of control", a.avgSpan, b.avgSpan, f1],
    ["Median span", a.medianSpan, b.medianSpan, f1],
    ["Narrow-span managers", a.narrowSpans, b.narrowSpans, int],
    ["Wide-span managers", a.wideSpans, b.wideSpans, int],
    ["Max layers", a.maxDepth, b.maxDepth, int],
    ["IC : Manager ratio", a.icPerManager, b.icPerManager, f1],
    ["Total comp", a.totalComp, b.totalComp, money],
  ];

  const picker = (val: string, set: (v: string) => void) => (
    <select value={val} onChange={(e) => set(e.target.value)}>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 600 }} onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Compare scenarios</h2>
        <div className="ab-pickers">
          <div>
            <label>Scenario A</label>
            {picker(aId, setAId)}
          </div>
          <div className="ab-arrow">→</div>
          <div>
            <label>Scenario B</label>
            {picker(bId, setBId)}
          </div>
        </div>

        <div className="ab-summary">
          <strong>{diff.moves.length}</strong> moves · <strong>{diff.added.length}</strong> added ·{" "}
          <strong>{diff.removed.length}</strong> removed · <strong>{diff.edits.length}</strong> edited
          <span className="muted"> (A → B)</span>
        </div>

        <table className="compare-table">
          <thead>
            <tr>
              <th>Metric</th>
              <th className="num">{labelOf(aId)}</th>
              <th className="num">{labelOf(bId)}</th>
              <th className="num">Δ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, av, bv, fmt]) => {
              const d = bv - av;
              // Treat as "no change" when the displayed (rounded) values match.
              const same = fmt(av) === fmt(bv);
              return (
                <tr key={label}>
                  <td>{label}</td>
                  <td className="num">{fmt(av)}</td>
                  <td className="num">{fmt(bv)}</td>
                  <td className="num">
                    {same ? <span className="muted">—</span> : (d > 0 ? "+" : "−") + fmt(Math.abs(d))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="modal-actions">
          <button onClick={onClose}>Close</button>
          <button
            className="primary"
            disabled={aId === bId}
            onClick={() => openChangeReport(aEmp, bEmp, thresholds, labelOf(aId), atOf(aId) || "—", labelOf(bId))}
          >
            Export A→B report (PDF)
          </button>
        </div>
      </div>
    </div>
  );
}
