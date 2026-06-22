import { useMemo } from "react";
import { useOrg, filterByDept } from "../store";
import { computeCost } from "../metrics";

const money = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`;

function Bars({ rows, max }: { rows: { label: string; value: number }[]; max: number }) {
  return (
    <div className="bars">
      {rows.map((r) => (
        <div className="bar-row" key={r.label}>
          <div className="bl" title={r.label}>{r.label}</div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${max ? (r.value / max) * 100 : 0}%` }} />
          </div>
          <div className="bv">{money(r.value)}</div>
        </div>
      ))}
    </div>
  );
}

export function CostPanel() {
  const allEmployees = useOrg((s) => s.employees);
  const deptFilter = useOrg((s) => s.deptFilter);
  const employees = useMemo(() => filterByDept(allEmployees, deptFilter), [allEmployees, deptFilter]);
  const cost = useMemo(() => computeCost(employees), [employees]);

  if (!cost.hasSalary) {
    return (
      <div className="empty-state" style={{ height: 200 }}>
        No salary data in this roster — add a Salary column (or edit salaries on the boxes) to see cost.
      </div>
    );
  }

  const deptMax = cost.byDept[0]?.value ?? 0;
  const locMax = cost.byLocation[0]?.value ?? 0;
  const layerMax = Math.max(0, ...cost.byLayer.map((l) => l.value));

  return (
    <div>
      <div className="section-title">Cost summary</div>
      <div className="kpi-grid">
        <div className="kpi"><div className="k-label">Total comp</div><div className="k-value">{money(cost.total)}</div></div>
        <div className="kpi"><div className="k-label">Avg comp</div><div className="k-value">{money(cost.avg)}</div></div>
        <div className="kpi"><div className="k-label">Management comp</div><div className="k-value">{money(cost.managerComp)}</div></div>
        <div className="kpi"><div className="k-label">Mgmt overhead</div><div className="k-value">{(cost.overheadPct * 100).toFixed(0)}%</div></div>
      </div>

      <div className="section-title">Cost by layer</div>
      <Bars rows={cost.byLayer} max={layerMax} />

      <div className="section-title">Cost by department</div>
      <Bars rows={cost.byDept} max={deptMax} />

      <div className="section-title">Cost by location</div>
      <Bars rows={cost.byLocation} max={locMax} />
    </div>
  );
}
