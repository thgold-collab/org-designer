import { useEffect, useMemo, useState } from "react";
import { useOrg, filterByDept } from "../store";
import { computeMetrics, spanRows, SPAN_BUCKETS } from "../metrics";
import type { OrgMetrics } from "../types";
import { DetailPanel } from "./DetailPanel";

const money = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : `$${Math.round(n / 1000)}k`;

type Tab = "metrics" | "spans" | "detail";

export function MetricsPanel() {
  const allEmployees = useOrg((s) => s.employees);
  const allBaseline = useOrg((s) => s.baseline);
  const deptFilter = useOrg((s) => s.deptFilter);
  const thresholds = useOrg((s) => s.thresholds);
  const selectedId = useOrg((s) => s.selectedId);
  const editNonce = useOrg((s) => s.editNonce);
  const [tab, setTab] = useState<Tab>("metrics");

  // When a role is added (or edit is requested), jump to the Detail tab.
  useEffect(() => {
    if (editNonce > 0) setTab("detail");
  }, [editNonce]);

  const employees = useMemo(() => filterByDept(allEmployees, deptFilter), [allEmployees, deptFilter]);
  const baseline = useMemo(() => filterByDept(allBaseline, deptFilter), [allBaseline, deptFilter]);

  const cur = useMemo(() => computeMetrics(employees, thresholds), [employees, thresholds]);
  const base = useMemo(() => computeMetrics(baseline, thresholds), [baseline, thresholds]);

  const activeTab = selectedId && tab === "detail" ? "detail" : tab;

  return (
    <div className="panel">
      <div className="tabs">
        <div className={`tab${activeTab === "metrics" ? " active" : ""}`} onClick={() => setTab("metrics")}>
          Metrics
        </div>
        <div className={`tab${activeTab === "spans" ? " active" : ""}`} onClick={() => setTab("spans")}>
          Spans
        </div>
        <div className={`tab${activeTab === "detail" ? " active" : ""}`} onClick={() => setTab("detail")}>
          Detail
        </div>
      </div>

      {activeTab === "metrics" && <MetricsView cur={cur} base={base} />}
      {activeTab === "spans" && <SpansView />}
      {activeTab === "detail" && <DetailPanel />}
    </div>
  );
}

function Delta({
  cur,
  base,
  goodDir,
  fmt = (n: number) => String(n),
}: {
  cur: number;
  base: number;
  goodDir: "up" | "down" | "none";
  fmt?: (n: number) => string;
}) {
  const d = cur - base;
  if (Math.abs(d) < 1e-9) return <div className="k-delta delta-neutral">no change</div>;
  const isGood = goodDir === "none" ? null : (d > 0) === (goodDir === "up");
  const cls = isGood === null ? "delta-neutral" : isGood ? "delta-up" : "delta-down";
  const sign = d > 0 ? "+" : "−";
  return (
    <div className={`k-delta ${cls}`}>
      {sign}
      {fmt(Math.abs(d))} vs base
    </div>
  );
}

function Kpi({
  label,
  value,
  curRaw,
  baseRaw,
  goodDir = "none",
  fmt = (n: number) => String(n),
}: {
  label: string;
  value: string;
  curRaw: number;
  baseRaw: number;
  goodDir?: "up" | "down" | "none";
  fmt?: (n: number) => string;
}) {
  return (
    <div className="kpi">
      <div className="k-label">{label}</div>
      <div className="k-value">{value}</div>
      <Delta cur={curRaw} base={baseRaw} goodDir={goodDir} fmt={fmt} />
    </div>
  );
}

function MetricsView({ cur, base }: { cur: OrgMetrics; base: OrgMetrics }) {
  const f1 = (n: number) => n.toFixed(1);
  const maxLayer = Math.max(1, ...cur.layerCounts, ...base.layerCounts);

  const allEmployees = useOrg((s) => s.employees);
  const deptFilter = useOrg((s) => s.deptFilter);
  const thresholds = useOrg((s) => s.thresholds);
  const focusNode = useOrg((s) => s.focusNode);
  const employees = useMemo(() => filterByDept(allEmployees, deptFilter), [allEmployees, deptFilter]);
  const rows = useMemo(() => spanRows(employees, thresholds), [employees, thresholds]);
  const [cursor, setCursor] = useState<Record<string, number>>({});

  // Click a span bucket to jump the chart to each manager in that range, in turn.
  function gotoBucket(label: string) {
    const test = SPAN_BUCKETS.find((b) => b.label === label)?.test;
    if (!test) return;
    const members = rows.filter((r) => test(r.span));
    if (members.length === 0) return;
    const i = (cursor[label] ?? 0) % members.length;
    focusNode(members[i].id);
    setCursor((c) => ({ ...c, [label]: i + 1 }));
  }

  return (
    <div>
      <div className="section-title">Headcount</div>
      <div className="kpi-grid">
        <Kpi label="Total people" value={String(cur.headcount)} curRaw={cur.headcount} baseRaw={base.headcount} goodDir="none" />
        <Kpi label="Managers" value={String(cur.managers)} curRaw={cur.managers} baseRaw={base.managers} goodDir="down" />
        <Kpi label="Individual contributors" value={String(cur.ics)} curRaw={cur.ics} baseRaw={base.ics} goodDir="none" />
        <Kpi label="Open roles" value={String(cur.vacancies)} curRaw={cur.vacancies} baseRaw={base.vacancies} goodDir="none" />
      </div>

      <div className="section-title">Spans of control</div>
      <div className="kpi-grid">
        <Kpi label="Avg span" value={f1(cur.avgSpan)} curRaw={cur.avgSpan} baseRaw={base.avgSpan} goodDir="up" fmt={f1} />
        <Kpi label="Median span" value={f1(cur.medianSpan)} curRaw={cur.medianSpan} baseRaw={base.medianSpan} goodDir="up" fmt={f1} />
        <Kpi label="Narrow (<thr)" value={String(cur.narrowSpans)} curRaw={cur.narrowSpans} baseRaw={base.narrowSpans} goodDir="down" />
        <Kpi label="Wide (>thr)" value={String(cur.wideSpans)} curRaw={cur.wideSpans} baseRaw={base.wideSpans} goodDir="down" />
      </div>

      <div className="section-title">Span distribution</div>
      <div className="hint-line">click a bar to jump to those managers →</div>
      <div className="bars">
        {cur.spanBuckets.map((b, i) => {
          const baseCount = base.spanBuckets[i]?.count ?? 0;
          const max = Math.max(1, ...cur.spanBuckets.map((x) => x.count), ...base.spanBuckets.map((x) => x.count));
          const clickable = b.count > 0;
          return (
            <div
              className={`bar-row${clickable ? " clickable" : ""}`}
              key={b.label}
              onClick={() => clickable && gotoBucket(b.label)}
              title={clickable ? `${b.count} manager(s) with span ${b.label} — click to visit each` : `no managers with span ${b.label}`}
            >
              <div className="bl">{b.label}</div>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${(b.count / max) * 100}%` }} />
              </div>
              <div className="bv">{b.count}</div>
            </div>
          );
        })}
      </div>

      <div className="section-title">Layers / depth</div>
      <div className="kpi-grid">
        <Kpi label="Max layers" value={String(cur.maxDepth)} curRaw={cur.maxDepth} baseRaw={base.maxDepth} goodDir="down" />
        <Kpi label="Avg layer" value={f1(cur.avgDepth)} curRaw={cur.avgDepth} baseRaw={base.avgDepth} goodDir="down" fmt={f1} />
      </div>
      <div style={{ marginTop: 10 }}>
        {cur.layerCounts.map((c, i) => (
          <div className="layer-row" key={i}>
            <div className="bl" style={{ color: "var(--muted)" }}>L{i + 1}</div>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${(c / maxLayer) * 100}%` }} />
            </div>
            <div className="bv">{c}</div>
          </div>
        ))}
      </div>

      <div className="section-title">Ratios & cost</div>
      <div className="kpi-grid">
        <Kpi label="IC : Manager" value={`${cur.icPerManager.toFixed(1)}:1`} curRaw={cur.icPerManager} baseRaw={base.icPerManager} goodDir="up" fmt={f1} />
        <Kpi label="% managers" value={`${(cur.managerRatio * 100).toFixed(0)}%`} curRaw={cur.managerRatio * 100} baseRaw={base.managerRatio * 100} goodDir="down" fmt={(n) => `${n.toFixed(0)}%`} />
        <Kpi label="Total comp" value={money(cur.totalComp)} curRaw={cur.totalComp} baseRaw={base.totalComp} goodDir="none" fmt={money} />
        <Kpi label="Mgmt comp" value={money(cur.managerComp)} curRaw={cur.managerComp} baseRaw={base.managerComp} goodDir="down" fmt={money} />
      </div>
    </div>
  );
}

function SpansView() {
  const allEmployees = useOrg((s) => s.employees);
  const deptFilter = useOrg((s) => s.deptFilter);
  const thresholds = useOrg((s) => s.thresholds);
  const focusNode = useOrg((s) => s.focusNode);
  const employees = useMemo(() => filterByDept(allEmployees, deptFilter), [allEmployees, deptFilter]);
  const rows = useMemo(() => spanRows(employees, thresholds), [employees, thresholds]);

  return (
    <div>
      <div className="section-title">Spans of control by manager ({rows.length})</div>
      <table className="span-table">
        <thead>
          <tr>
            <th>Manager</th>
            <th className="num">Span</th>
            <th className="num">Subtree</th>
            <th className="num">Layer</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} onClick={() => focusNode(r.id)}>
              <td>
                <span className={`dot ${r.flag}`} />
                {r.name}
                {r.title ? <div style={{ color: "var(--muted)", fontSize: 11 }}>{r.title}</div> : null}
              </td>
              <td className="num">{r.span}</td>
              <td className="num">{r.totalReports}</td>
              <td className="num">{r.depth}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
