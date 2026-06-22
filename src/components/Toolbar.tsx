import { useMemo, useRef, useState } from "react";
import { useOrg, departmentsOf } from "../store";
import { parseCsvRaw, autoMap, buildEmployees, mappingIsComplete, employeesToCsv } from "../csv";
import { downloadText, slugify } from "../download";
import { openChangeReport } from "../report";
import { ImportWizard } from "./ImportWizard";
import { BaselinePicker } from "./BaselinePicker";
import { TEMPLATE_CSV, SAMPLE_ROSTER } from "../sampleData";

export function Toolbar() {
  const loadRoster = useOrg((s) => s.loadRoster);
  const employees = useOrg((s) => s.employees);
  const baseline = useOrg((s) => s.baseline);
  const baselineLabel = useOrg((s) => s.baselineLabel);
  const baselineAt = useOrg((s) => s.baselineAt);
  const saveBaseline = useOrg((s) => s.saveBaseline);
  const snapshotCount = useOrg((s) => s.snapshots.length);
  const undo = useOrg((s) => s.undo);
  const redo = useOrg((s) => s.redo);
  const canUndo = useOrg((s) => s.past.length > 0);
  const canRedo = useOrg((s) => s.future.length > 0);
  const thresholds = useOrg((s) => s.thresholds);
  const setThresholds = useOrg((s) => s.setThresholds);
  const deptFilter = useOrg((s) => s.deptFilter);
  const setDeptFilter = useOrg((s) => s.setDeptFilter);
  const autoCenter = useOrg((s) => s.autoCenter);
  const toggleAutoCenter = useOrg((s) => s.toggleAutoCenter);
  const addOpenRole = useOrg((s) => s.addOpenRole);
  const fileRef = useRef<HTMLInputElement>(null);
  const forceWizard = useRef(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [wizard, setWizard] = useState<{
    fileName: string;
    headers: string[];
    rows: Record<string, string>[];
    mapping: Record<string, string>;
  } | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  const deptCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of employees) if (e.department) counts.set(e.department, (counts.get(e.department) ?? 0) + 1);
    return counts;
  }, [employees]);
  const departments = useMemo(() => departmentsOf(employees), [employees]);

  function openImport(force: boolean) {
    forceWizard.current = force;
    fileRef.current?.click();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const force = forceWizard.current;
    forceWizard.current = false;
    if (!file) return;
    const text = await file.text();
    e.target.value = "";

    const { headers, rows } = parseCsvRaw(text);
    if (rows.length === 0) {
      setWarnings(["No rows could be parsed from that file."]);
      return;
    }
    const mapping = autoMap(headers);

    // Fast path: auto-detected an identifier + manager link and not forced.
    if (!force && mappingIsComplete(mapping)) {
      const { employees: emps, warnings: w } = buildEmployees(rows, mapping);
      loadRoster(emps);
      setWarnings(w);
      return;
    }
    // Otherwise open the wizard to map columns by hand.
    setWarnings([]);
    setWizard({ fileName: file.name, headers, rows, mapping });
  }

  return (
    <>
      <div className="toolbar">
        <div className="brand">Org <span>Designer</span></div>
        <span className="build-badge" title={`Build ${__BUILD_SHA__} · ${__BUILD_STAMP__}`}>
          {__BUILD_SHA__} · {__BUILD_STAMP__}
        </span>

        <button onClick={() => openImport(false)}>Import CSV…</button>
        <button onClick={() => openImport(true)} title="Import and manually map columns">Map columns…</button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} />
        <button onClick={() => loadRoster(SAMPLE_ROSTER)}>Load sample (600)</button>
        <button onClick={() => downloadText("roster-template.csv", TEMPLATE_CSV)}>Get template</button>

        <div style={{ width: 1, height: 22, background: "var(--border)" }} />

        <button
          onClick={() => addOpenRole()}
          title="Add an open (unfilled) role under the selected person, or at the top of the org"
        >
          + Open role
        </button>

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

        <button
          className={autoCenter ? "primary" : ""}
          onClick={toggleAutoCenter}
          title="Keep the org centered — re-centers each time you lift your finger/mouse"
        >
          ◎ Auto-center {autoCenter ? "on" : "off"}
        </button>

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

        <button
          onClick={() => {
            const def = `Baseline ${new Date().toLocaleDateString()}`;
            const label = window.prompt("Name this baseline (saved as a snapshot you can restore):", def);
            if (label === null) return; // cancelled
            const name = label.trim() || def;
            saveBaseline(name);
            if (window.confirm(`Saved “${name}”.\n\nAlso download a CSV copy so you can re-import it after closing the app?`)) {
              downloadText(`${slugify(name)}.csv`, employeesToCsv(employees));
            }
          }}
          title="Save the current org as a named snapshot (and optionally a CSV copy)"
        >
          Set baseline
        </button>
        <button onClick={() => setShowPicker(true)} title="Restore a saved baseline / choose what to compare against">
          Restore baseline… ({snapshotCount})
        </button>
        <button
          onClick={() => {
            const ok = openChangeReport(baseline, employees, thresholds, baselineLabel, baselineAt);
            if (!ok) setWarnings(["Allow pop-ups for this site to open the PDF report."]);
          }}
          title={`Generate a PDF report of every change vs. baseline “${baselineLabel}”`}
        >
          Change report (PDF)
        </button>
        <button className="primary" onClick={() => downloadText("org-scenario.csv", employeesToCsv(employees))}>
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
      {wizard && (
        <ImportWizard
          fileName={wizard.fileName}
          headers={wizard.headers}
          rows={wizard.rows}
          initialMapping={wizard.mapping}
          onCancel={() => setWizard(null)}
          onImport={(emps) => {
            loadRoster(emps);
            setWizard(null);
          }}
        />
      )}
      {showPicker && <BaselinePicker onClose={() => setShowPicker(false)} />}
    </>
  );
}
