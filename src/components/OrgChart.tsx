import { useEffect, useMemo, useRef, useState } from "react";
import { useOrg, filterByDept } from "../store";
import { layoutForest, spanRows, NODE_W, NODE_H } from "../metrics";
import type { LayoutNode } from "../types";

interface View {
  x: number;
  y: number;
  k: number;
}

interface DragState {
  id: string;
  startX: number;
  startY: number;
  curX: number;
  curY: number;
  moved: boolean;
}

export function OrgChart() {
  const allEmployees = useOrg((s) => s.employees);
  const deptFilter = useOrg((s) => s.deptFilter);
  const thresholds = useOrg((s) => s.thresholds);
  const selectedId = useOrg((s) => s.selectedId);
  const select = useOrg((s) => s.select);
  const reparent = useOrg((s) => s.reparent);
  const collapsed = useOrg((s) => s.collapsed);
  const toggleCollapse = useOrg((s) => s.toggleCollapse);
  const collapseAll = useOrg((s) => s.collapseAll);
  const expandAll = useOrg((s) => s.expandAll);
  const focusId = useOrg((s) => s.focusId);
  const focusNonce = useOrg((s) => s.focusNonce);
  const rosterNonce = useOrg((s) => s.rosterNonce);

  const employees = useMemo(
    () => filterByDept(allEmployees, deptFilter),
    [allEmployees, deptFilter]
  );

  const wrapRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 80, y: 60, k: 0.85 });
  const [drag, setDrag] = useState<DragState | null>(null);
  const [hoverTarget, setHoverTarget] = useState<string | null>(null);
  const panRef = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const [panning, setPanning] = useState(false);

  const { nodes, width, height } = useMemo(
    () => layoutForest(employees, collapsed),
    [employees, collapsed]
  );
  const flagById = useMemo(() => {
    const m = new Map<string, "narrow" | "wide" | "ok">();
    for (const r of spanRows(employees, thresholds)) m.set(r.id, r.flag);
    return m;
  }, [employees, thresholds]);

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  // Fit on mount, when a new roster loads, or when the department filter
  // changes. Collapsing/expanding/focusing deliberately do NOT refit, so the
  // view stays put while you reorganize or jump around.
  useEffect(() => {
    if (!wrapRef.current || nodes.length === 0) return;
    fitToView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deptFilter, rosterNonce]);

  // Center the chart on a node when something asks to focus it (span chart,
  // spans table). Runs after layout so any just-expanded ancestors exist.
  useEffect(() => {
    if (!focusId || !wrapRef.current) return;
    const n = nodes.find((nn) => nn.id === focusId);
    if (!n) return;
    const wrap = wrapRef.current;
    const k = view.k < 0.85 ? 0.9 : view.k; // zoom in if we were far out
    setView({
      k,
      x: wrap.clientWidth / 2 - (n.x + NODE_W / 2) * k,
      y: wrap.clientHeight / 2 - (n.y + NODE_H / 2) * k,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusNonce]);

  function fitToView() {
    const wrap = wrapRef.current;
    if (!wrap || width === 0) return;
    const pad = 60;
    const kx = (wrap.clientWidth - pad * 2) / width;
    const ky = (wrap.clientHeight - pad * 2) / height;
    const k = Math.min(1, Math.max(0.2, Math.min(kx, ky)));
    setView({
      x: (wrap.clientWidth - width * k) / 2,
      y: pad,
      k,
    });
  }

  // ----- Panning (drag on background) -----
  function onWrapPointerDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest(".node")) return;
    panRef.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    setPanning(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  // ----- Zoom (wheel) -----
  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const wrap = wrapRef.current!;
    const rect = wrap.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    setView((v) => {
      const k = Math.min(2.5, Math.max(0.15, v.k * factor));
      // keep point under cursor stable
      const wx = (mx - v.x) / v.k;
      const wy = (my - v.y) / v.k;
      return { k, x: mx - wx * k, y: my - wy * k };
    });
  }

  // ----- Node drag (reparent) -----
  function onNodePointerDown(e: React.PointerEvent, id: string) {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDrag({ id, startX: e.clientX, startY: e.clientY, curX: e.clientX, curY: e.clientY, moved: false });
  }

  // Global pointer move/up so drags survive leaving the node.
  useEffect(() => {
    function move(e: PointerEvent) {
      if (panRef.current) {
        setView((v) => ({
          ...v,
          x: panRef.current!.vx + (e.clientX - panRef.current!.x),
          y: panRef.current!.vy + (e.clientY - panRef.current!.y),
        }));
        return;
      }
      if (drag) {
        const moved =
          drag.moved || Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 5;
        setDrag({ ...drag, curX: e.clientX, curY: e.clientY, moved });
        if (moved) setHoverTarget(hitTest(e.clientX, e.clientY, drag.id));
      }
    }
    function up(e: PointerEvent) {
      if (panRef.current) {
        panRef.current = null;
        setPanning(false);
      }
      if (drag) {
        if (!drag.moved) {
          select(drag.id);
        } else {
          const target = hitTest(e.clientX, e.clientY, drag.id);
          if (target !== null) {
            // dropping onto a node => become its report; onto empty canvas => no-op
            reparent(drag.id, target);
          }
        }
        setDrag(null);
        setHoverTarget(null);
      }
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  });

  function hitTest(clientX: number, clientY: number, excludeId: string): string | null {
    const wrap = wrapRef.current;
    if (!wrap) return null;
    const rect = wrap.getBoundingClientRect();
    const cx = (clientX - rect.left - view.x) / view.k;
    const cy = (clientY - rect.top - view.y) / view.k;
    for (const n of nodes) {
      if (n.id === excludeId) continue;
      if (cx >= n.x && cx <= n.x + NODE_W && cy >= n.y && cy <= n.y + NODE_H) {
        // can't drop onto own descendant — reparent() guards too, but skip visually
        return n.id;
      }
    }
    return null;
  }

  const dragNode = drag?.moved ? nodeById.get(drag.id) : null;

  return (
    <div
      ref={wrapRef}
      className={`canvas-wrap${panning ? " panning" : ""}`}
      onPointerDown={onWrapPointerDown}
      onWheel={onWheel}
    >
      <div
        className="canvas-inner"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}
      >
        <Edges nodes={nodes} width={width} height={height} />
        {nodes.map((n) => {
          const flag = flagById.get(n.id) ?? "ok";
          const isDragging = drag?.id === n.id && drag.moved;
          const isTarget = hoverTarget === n.id;
          return (
            <div
              key={n.id}
              className={[
                "node",
                `flag-${flag}`,
                selectedId === n.id ? "selected" : "",
                isDragging ? "dragging" : "",
                isTarget ? "drop-target" : "",
                n.emp.isVacancy ? "vacancy" : "",
              ].join(" ")}
              style={{ left: n.x, top: n.y }}
              onPointerDown={(e) => onNodePointerDown(e, n.id)}
            >
              <NodeBody n={n} flag={flag} />
              {n.directReports > 0 && (
                <button
                  className={`collapse-toggle${n.collapsed ? " is-collapsed" : ""}`}
                  title={n.collapsed ? `Expand ${n.directReports} report${n.directReports === 1 ? "" : "s"}` : "Collapse this branch"}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleCollapse(n.id);
                  }}
                >
                  {n.collapsed ? `+${n.directReports}` : "−"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {dragNode && (
        <div
          className="drag-ghost"
          style={{ left: drag!.curX - NODE_W / 2 * view.k, top: drag!.curY - 20 }}
        >
          <div className="node" style={{ position: "static", width: NODE_W }}>
            <NodeBody n={dragNode} flag={flagById.get(dragNode.id) ?? "ok"} />
          </div>
        </div>
      )}

      <div className="canvas-hint">
        Drag a box onto another to re-assign · scroll to zoom · drag background to pan
      </div>
      <div className="zoom-controls">
        <button title="Collapse all branches" onClick={collapseAll}>⊟</button>
        <button title="Expand all branches" onClick={expandAll}>⊞</button>
        <button onClick={() => setView((v) => ({ ...v, k: Math.min(2.5, v.k * 1.2) }))}>+</button>
        <button onClick={() => setView((v) => ({ ...v, k: Math.max(0.15, v.k / 1.2) }))}>−</button>
        <button title="Fit to screen" onClick={fitToView}>⤢</button>
      </div>
    </div>
  );
}

function NodeBody({ n, flag }: { n: LayoutNode; flag: "narrow" | "wide" | "ok" }) {
  const span = n.directReports;
  return (
    <>
      <div className="n-name">{n.emp.name}{n.emp.isVacancy ? " (open)" : ""}</div>
      <div className="n-title">{n.emp.title ?? "—"}</div>
      <div className="n-meta">
        {span > 0 && (
          <span className={`badge${flag === "narrow" ? " warn" : flag === "wide" ? " bad" : ""}`}>
            {span} report{span === 1 ? "" : "s"}
          </span>
        )}
        {n.emp.department && <span className="badge dept">{n.emp.department}</span>}
      </div>
    </>
  );
}

function Edges({ nodes, width, height }: { nodes: LayoutNode[]; width: number; height: number }) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const paths: string[] = [];
  for (const n of nodes) {
    if (!n.parentId) continue;
    const p = byId.get(n.parentId);
    if (!p) continue;
    const x1 = p.x + NODE_W / 2;
    const y1 = p.y + NODE_H;
    const x2 = n.x + NODE_W / 2;
    const y2 = n.y;
    const my = (y1 + y2) / 2;
    paths.push(`M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`);
  }
  return (
    <svg className="edges" width={width + 100} height={height + 100}>
      {paths.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="#3a4757" strokeWidth={1.5} />
      ))}
    </svg>
  );
}
