import { useMemo, useState } from "react";
import { useOrg, filterByDept } from "../store";
import { layoutForest } from "../metrics";
import { openChartExport } from "../chartExport";

export function ExportChartDialog({ onClose }: { onClose: () => void }) {
  const employees = useOrg((s) => s.employees);
  const deptFilter = useOrg((s) => s.deptFilter);
  const collapsed = useOrg((s) => s.collapsed);
  const thresholds = useOrg((s) => s.thresholds);

  const scoped = useMemo(() => filterByDept(employees, deptFilter), [employees, deptFilter]);
  const full = useMemo(() => layoutForest(scoped), [scoped]); // every level
  const maxLevels = useMemo(
    () => full.nodes.reduce((m, n) => Math.max(m, n.depth), 0) + 1,
    [full]
  );

  const [mode, setMode] = useState<string>("current");
  const [err, setErr] = useState("");

  // Build the collapse set that limits the export to the chosen depth.
  function collapsedFor(m: string): Set<string> {
    if (m === "current") return collapsed;
    if (m === "all") return new Set();
    const levels = Number(m);
    const c = new Set<string>();
    for (const n of full.nodes) if (n.depth === levels - 1) c.add(n.id); // hide everything deeper
    return c;
  }

  const previewCount = useMemo(
    () => layoutForest(scoped, collapsedFor(mode)).nodes.length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scoped, mode, collapsed, full]
  );

  function doExport() {
    const ok = openChartExport(employees, collapsedFor(mode), deptFilter, thresholds);
    if (!ok) setErr("Allow pop-ups for this site to open the chart export.");
    else onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Export org chart</h2>
        <div className="modal-sub">
          Opens a printable chart — Save as PDF or download the SVG.
          {deptFilter ? ` Scoped to ${deptFilter}.` : ""}
        </div>

        <label className="export-label">Levels to include</label>
        <select className="export-select" value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="current">Current view (as shown on screen)</option>
          <option value="all">All {maxLevels} levels</option>
          {Array.from({ length: maxLevels }, (_, i) => i + 1).map((l) => (
            <option key={l} value={String(l)}>
              Top {l} level{l > 1 ? "s" : ""} from the top
            </option>
          ))}
        </select>

        <div className="map-preview" style={{ marginTop: 12 }}>
          <strong>{previewCount}</strong> box{previewCount === 1 ? "" : "es"} will be exported
        </div>
        {err && <div className="warn-line">⚠ {err}</div>}

        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={doExport}>
            Export
          </button>
        </div>
      </div>
    </div>
  );
}
