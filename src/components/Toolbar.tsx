import { useEffect, useMemo, useRef, useState } from "react";
import { useOrg, departmentsOf } from "../store";
import { parseCsvRaw, autoMap, buildEmployees, mappingIsComplete, employeesToCsv } from "../csv";
import { downloadText, slugify } from "../download";
import { openChangeReport } from "../report";
import { ImportWizard } from "./ImportWizard";
import { BaselinePicker } from "./BaselinePicker";
import { SearchBox } from "./SearchBox";
import { ScenarioCompare } from "./ScenarioCompare";
import { BulkActions } from "./BulkActions";
import { ExportChartDialog } from "./ExportChartDialog";
import { TEMPLATE_CSV, SAMPLE_ROSTER } from "../sampleData";

/* ------------------------------------------------------------------ *
 * Small dropdown-menu primitives. One menu is open at a time, tracked
 * by id in the Toolbar. A transparent backdrop closes on outside click;
 * Escape also closes.
 * ------------------------------------------------------------------ */

type MenuId = "data" | "insert" | "baseline" | "export" | "settings" | null;

type ActionItem = { label: string; kbd?: string; onClick: () => void };
type ActionSection = { id: Exclude<MenuId, "settings" | null>; label: string; head?: string; items: ActionItem[] };

function Menu({
  id,
  label,
  open,
  setOpen,
  align = "left",
  head,
  btnClassName = "menu-btn",
  children,
}: {
  id: Exclude<MenuId, null>;
  label: React.ReactNode;
  open: MenuId;
  setOpen: (m: MenuId) => void;
  align?: "left" | "right";
  head?: string;
  btnClassName?: string;
  children: React.ReactNode;
}) {
  const isOpen = open === id;
  return (
    <div className="menu">
      <button
        className={`${btnClassName}${isOpen ? " open" : ""}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setOpen(isOpen ? null : id)}
      >
        {label}
      </button>
      {isOpen && (
        <div className={`menu-pop${align === "right" ? " right" : ""}`} role="menu">
          {head && <div className="menu-head">{head}</div>}
          {children}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  onClick,
  setOpen,
  kbd,
  children,
}: {
  onClick: () => void;
  setOpen: (m: MenuId) => void;
  kbd?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      className="menu-item"
      role="menuitem"
      onClick={() => {
        setOpen(null);
        onClick();
      }}
    >
      <span>{children}</span>
      {kbd ? <span className="kbd">{kbd}</span> : null}
    </button>
  );
}

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
  const addPerson = useOrg((s) => s.addPerson);
  const showDiff = useOrg((s) => s.showDiff);
  const toggleDiff = useOrg((s) => s.toggleDiff);
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
  const [showCompare, setShowCompare] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [showExportChart, setShowExportChart] = useState(false);

  // Which toolbar dropdown is open (desktop, one at a time).
  const [menu, setMenu] = useState<MenuId>(null);
  // Mobile "More" bottom sheet.
  const [sheetOpen, setSheetOpen] = useState(false);
  useEffect(() => {
    if (!menu && !sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu(null);
        setSheetOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu, sheetOpen]);

  const deptCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of employees) if (e.department) counts.set(e.department, (counts.get(e.department) ?? 0) + 1);
    return counts;
  }, [employees]);
  const departments = useMemo(() => departmentsOf(employees), [employees]);

  // Dirty = the working org differs from the active baseline (robust across
  // reloads, where undo history is gone but the restored draft may have edits).
  function isDirty(): boolean {
    const { employees: cur, baseline } = useOrg.getState();
    if (cur.length !== baseline.length) return true;
    const b = new Map(baseline.map((e) => [e.id, e]));
    for (const e of cur) {
      const o = b.get(e.id);
      if (!o) return true;
      if (
        (o.managerId ?? "") !== (e.managerId ?? "") ||
        o.name !== e.name ||
        (o.title ?? "") !== (e.title ?? "") ||
        (o.status ?? "") !== (e.status ?? "")
      )
        return true;
    }
    return false;
  }

  // Guard against silently discarding unsaved edits when replacing the org.
  function confirmReplace(): boolean {
    if (!isDirty()) return true;
    return window.confirm(
      "This replaces your current org and any unsaved edits. Continue?\n\n(Tip: Set baseline first to keep them.)"
    );
  }

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
      if (!confirmReplace()) return;
      const { employees: emps, warnings: w } = buildEmployees(rows, mapping);
      loadRoster(emps);
      setWarnings(w);
      return;
    }
    // Otherwise open the wizard to map columns by hand.
    setWarnings([]);
    setWizard({ fileName: file.name, headers, rows, mapping });
  }

  function doSetBaseline() {
    const def = `Baseline ${new Date().toLocaleDateString()}`;
    const label = window.prompt("Name this baseline (saved as a snapshot you can restore):", def);
    if (label === null) return; // cancelled
    const name = label.trim() || def;
    saveBaseline(name);
    if (
      window.confirm(
        `Saved “${name}”.\n\nAlso download a CSV copy so you can re-import it after closing the app?`
      )
    ) {
      downloadText(`${slugify(name)}.csv`, employeesToCsv(employees));
    }
  }

  function doChangeReport() {
    const ok = openChangeReport(baseline, employees, thresholds, baselineLabel, baselineAt);
    if (!ok) setWarnings(["Allow pop-ups for this site to open the PDF report."]);
  }

  function doExportChart() {
    setShowExportChart(true);
  }

  // Single source of truth for the grouped actions — drives both the desktop
  // dropdown menus and the mobile "More" sheet so they never drift apart.
  const sections: ActionSection[] = [
    {
      id: "data",
      label: "Data",
      items: [
        { label: "Import CSV…", onClick: () => openImport(false) },
        { label: "Map columns…", onClick: () => openImport(true) },
        { label: "Load sample (600)", onClick: () => { if (confirmReplace()) loadRoster(SAMPLE_ROSTER); } },
        { label: "Get template", onClick: () => downloadText("roster-template.csv", TEMPLATE_CSV) },
      ],
    },
    {
      id: "insert",
      label: "Insert",
      items: [
        { label: "+ Add person", onClick: () => addPerson() },
        { label: "+ Open role", onClick: () => addOpenRole() },
        { label: "Bulk what-ifs…", onClick: () => setShowBulk(true) },
      ],
    },
    {
      id: "baseline",
      label: "Baseline",
      head: `Active · ${baselineLabel}`,
      items: [
        { label: "Set baseline…", onClick: doSetBaseline },
        { label: "Restore baseline…", kbd: String(snapshotCount), onClick: () => setShowPicker(true) },
        { label: "Compare A / B…", onClick: () => setShowCompare(true) },
      ],
    },
    {
      id: "export",
      label: "Export",
      items: [
        { label: "Export CSV", onClick: () => downloadText("org-scenario.csv", employeesToCsv(employees)) },
        { label: "Change report (PDF)", onClick: doChangeReport },
        { label: "Export chart (SVG / PDF)", onClick: doExportChart },
      ],
    },
  ];

  const deptOptions = (
    <>
      <option value="">All departments ({employees.length})</option>
      {departments.map((d) => (
        <option key={d} value={d}>
          {d} ({deptCounts.get(d) ?? 0})
        </option>
      ))}
    </>
  );

  return (
    <>
      <div className="toolbar">
        <div className="brand-group">
          <div className="brand">
            Org <span>Designer</span>
          </div>
          <span className="build-badge" title={`Build ${__BUILD_SHA__} · ${__BUILD_STAMP__}`}>
            {__BUILD_SHA__} · {__BUILD_STAMP__}
          </span>
        </div>

        <div className="tb-sep tb-desktop" />

        {/* Grouped action menus (desktop) — tames the old flat row of ~18 buttons. */}
        <div className="tb-group tb-desktop">
          {sections.map((s) => (
            <Menu
              key={s.id}
              id={s.id}
              label={<>{s.label} <span className="caret">▾</span></>}
              open={menu}
              setOpen={setMenu}
              head={s.head}
            >
              {s.items.map((it) => (
                <MenuItem key={it.label} onClick={it.onClick} setOpen={setMenu} kbd={it.kbd}>
                  {it.label}
                </MenuItem>
              ))}
            </Menu>
          ))}
        </div>

        <div className="spacer" />

        <SearchBox />

        {/* Desktop right cluster: scope, undo/redo, view toggles, settings. */}
        <div className="tb-cluster tb-desktop">
          <select
            className="dept-select"
            value={deptFilter ?? ""}
            onChange={(e) => setDeptFilter(e.target.value || null)}
            title="Scope the chart and metrics to one department"
          >
            {deptOptions}
          </select>

          <div className="tb-sep" />

          <div className="seg">
            <button onClick={undo} disabled={!canUndo} title="Undo (⌘Z)">↶</button>
            <div className="seg-sep" />
            <button onClick={redo} disabled={!canRedo} title="Redo (⌘⇧Z)">↷</button>
          </div>

          <button
            className={`pill${showDiff ? " on" : ""}`}
            onClick={toggleDiff}
            title={`Highlight nodes added/moved vs. baseline “${baselineLabel}” on the chart`}
          >
            Diff
          </button>
          <button
            className={`pill${autoCenter ? " on" : ""}`}
            onClick={toggleAutoCenter}
            title="Keep the org centered — re-centers each time you lift your finger/mouse"
          >
            ◎ Auto-center
          </button>

          <Menu id="settings" label={<>⚙</>} open={menu} setOpen={setMenu} align="right" btnClassName="icon-btn">
            <div className="settings-pop">
              <div className="sp-title">Span-of-control flags</div>
              <label className="sp-row">
                <span>
                  <span className="sp-dot" style={{ background: "var(--warn)" }} /> Narrow under
                </span>
                <input
                  type="number"
                  min={1}
                  value={thresholds.narrow}
                  onChange={(e) => setThresholds({ narrow: Number(e.target.value) })}
                />
              </label>
              <label className="sp-row">
                <span>
                  <span className="sp-dot" style={{ background: "var(--bad)" }} /> Wide over
                </span>
                <input
                  type="number"
                  min={1}
                  value={thresholds.wide}
                  onChange={(e) => setThresholds({ wide: Number(e.target.value) })}
                />
              </label>
            </div>
          </Menu>
        </div>

        {/* Mobile: everything collapses into a single More sheet. */}
        <button className="more-btn tb-mobile" onClick={() => setSheetOpen(true)} aria-label="More actions">
          ⋯ More
        </button>

        <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} />
      </div>

      {/* Backdrop closes any open desktop menu on outside click. */}
      {menu && <div className="menu-backdrop" onClick={() => setMenu(null)} />}

      {/* ---------- Mobile "More" bottom sheet ---------- */}
      {sheetOpen && (
        <div className="sheet-backdrop" onClick={() => setSheetOpen(false)}>
          <div className="sheet" role="dialog" aria-label="More actions" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <div className="sheet-grabber" />
              <button className="sheet-close" onClick={() => setSheetOpen(false)} aria-label="Close">
                ✕
              </button>
            </div>
            <div className="sheet-body">
              <div className="sheet-section">
                <div className="sheet-h">Scope</div>
                <select
                  className="dept-select sheet-select"
                  value={deptFilter ?? ""}
                  onChange={(e) => setDeptFilter(e.target.value || null)}
                >
                  {deptOptions}
                </select>
              </div>

              {sections.map((s) => (
                <div className="sheet-section" key={s.id}>
                  <div className="sheet-h">{s.label}</div>
                  {s.head && <div className="sheet-note">{s.head}</div>}
                  {s.items.map((it) => (
                    <button
                      key={it.label}
                      className="sheet-item"
                      onClick={() => {
                        setSheetOpen(false);
                        it.onClick();
                      }}
                    >
                      <span>{it.label}</span>
                      {it.kbd ? <span className="kbd">{it.kbd}</span> : null}
                    </button>
                  ))}
                </div>
              ))}

              <div className="sheet-section">
                <div className="sheet-h">View</div>
                <button className="sheet-toggle" onClick={toggleDiff}>
                  <span>Diff vs baseline</span>
                  <span className={`switch${showDiff ? " on" : ""}`}>
                    <i />
                  </span>
                </button>
                <button className="sheet-toggle" onClick={toggleAutoCenter}>
                  <span>◎ Auto-center</span>
                  <span className={`switch${autoCenter ? " on" : ""}`}>
                    <i />
                  </span>
                </button>
                <div className="sheet-ur">
                  <button onClick={undo} disabled={!canUndo}>↶ Undo</button>
                  <button onClick={redo} disabled={!canRedo}>↷ Redo</button>
                </div>
              </div>

              <div className="sheet-section">
                <div className="sheet-h">Span-of-control flags</div>
                <label className="sheet-thresh">
                  <span>
                    <span className="sp-dot" style={{ background: "var(--warn)" }} /> Narrow under
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={thresholds.narrow}
                    onChange={(e) => setThresholds({ narrow: Number(e.target.value) })}
                  />
                </label>
                <label className="sheet-thresh">
                  <span>
                    <span className="sp-dot" style={{ background: "var(--bad)" }} /> Wide over
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={thresholds.wide}
                    onChange={(e) => setThresholds({ wide: Number(e.target.value) })}
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

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
            if (!confirmReplace()) return;
            loadRoster(emps);
            setWizard(null);
          }}
        />
      )}
      {showPicker && <BaselinePicker onClose={() => setShowPicker(false)} />}
      {showCompare && <ScenarioCompare onClose={() => setShowCompare(false)} />}
      {showBulk && <BulkActions onClose={() => setShowBulk(false)} />}
      {showExportChart && <ExportChartDialog onClose={() => setShowExportChart(false)} />}
    </>
  );
}
