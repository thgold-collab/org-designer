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
  const viewRef = useRef(view);
  viewRef.current = view; // always-current view for gesture math (avoids stale closures)
  const [drag, setDrag] = useState<DragState | null>(null);
  const [hoverTarget, setHoverTarget] = useState<string | null>(null);
  const panRef = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const [panning, setPanning] = useState(false);
  // Active touch points on the background, and the in-progress pinch gesture.
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ d0: number; k0: number; ax: number; ay: number; vx: number; vy: number } | null>(null);

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
    if (!wrap || width === 0 || wrap.clientWidth === 0) return;
    const pad = 60;
    const kx = (wrap.clientWidth - pad * 2) / width;
    const ky = (wrap.clientHeight - pad * 2) / height;
    const k = Math.min(1, Math.max(0.2, Math.min(kx, ky)));
    setView({
      x: (wrap.clientWidth - width * k) / 2,
      // center vertically too when the tree is shorter than the viewport
      y: Math.max(pad, (wrap.clientHeight - height * k) / 2),
      k,
    });
  }

  // Re-center the org at the current zoom (the "bring it back" button).
  function recenter() {
    const wrap = wrapRef.current;
    if (!wrap || width === 0) return;
    setView((v) => ({
      k: v.k,
      x: (wrap.clientWidth - width * v.k) / 2,
      y: Math.max(20, (wrap.clientHeight - height * v.k) / 2),
    }));
  }

  // Keep at least part of the org on screen so a pan/pinch can never lose it.
  function clampView(v: View): View {
    const wrap = wrapRef.current;
    if (!wrap) return v;
    const cw = wrap.clientWidth;
    const ch = wrap.clientHeight;
    const contentW = Math.max(NODE_W, width) * v.k;
    const contentH = Math.max(NODE_H, height) * v.k;
    const m = Math.min(120, cw * 0.4, ch * 0.4); // min visible content on each edge
    const minX = m - contentW;
    const maxX = cw - m;
    const minY = m - contentH;
    const maxY = ch - m;
    const x = minX > maxX ? (cw - contentW) / 2 : Math.min(maxX, Math.max(minX, v.x));
    const y = minY > maxY ? (ch - contentH) / 2 : Math.min(maxY, Math.max(minY, v.y));
    return { k: v.k, x, y };
  }

  // ----- Background gestures: 1 pointer = pan, 2 pointers = pinch-zoom -----
  function onWrapPointerDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest(".node")) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {
      /* capture is best-effort; gesture state is what matters */
    }

    if (pointersRef.current.size >= 2) {
      // Two fingers down: cancel any pan and begin pinch.
      panRef.current = null;
      setPanning(false);
      startPinch();
    } else {
      panRef.current = { x: e.clientX, y: e.clientY, vx: viewRef.current.x, vy: viewRef.current.y };
      setPanning(true);
    }
  }

  function startPinch() {
    const pts = [...pointersRef.current.values()];
    if (pts.length < 2 || !wrapRef.current) return;
    const [a, b] = pts;
    const rect = wrapRef.current.getBoundingClientRect();
    pinchRef.current = {
      d0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      k0: viewRef.current.k,
      ax: (a.x + b.x) / 2 - rect.left, // pinch anchor (midpoint) in canvas-local coords
      ay: (a.y + b.y) / 2 - rect.top,
      vx: viewRef.current.x,
      vy: viewRef.current.y,
    };
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
      return clampView({ k, x: mx - wx * k, y: my - wy * k });
    });
  }

  // ----- Node drag (reparent) -----
  function onNodePointerDown(e: React.PointerEvent, id: string) {
    e.stopPropagation();
    try {
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {
      /* best-effort */
    }
    setDrag({ id, startX: e.clientX, startY: e.clientY, curX: e.clientX, curY: e.clientY, moved: false });
  }

  // Global pointer move/up so drags survive leaving the node.
  useEffect(() => {
    function move(e: PointerEvent) {
      if (pointersRef.current.has(e.pointerId)) {
        pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
      // Pinch-zoom (two fingers) takes priority.
      if (pinchRef.current && pointersRef.current.size >= 2) {
        const pts = [...pointersRef.current.values()];
        const [a, b] = pts;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const p = pinchRef.current;
        const k = Math.min(2.5, Math.max(0.15, p.k0 * (d / p.d0)));
        // Keep the world point under the pinch anchor fixed as we scale.
        const wx = (p.ax - p.vx) / p.k0;
        const wy = (p.ay - p.vy) / p.k0;
        setView(clampView({ k, x: p.ax - wx * k, y: p.ay - wy * k }));
        return;
      }
      if (panRef.current) {
        setView((v) =>
          clampView({
            k: v.k,
            x: panRef.current!.vx + (e.clientX - panRef.current!.x),
            y: panRef.current!.vy + (e.clientY - panRef.current!.y),
          })
        );
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
      if (pointersRef.current.has(e.pointerId)) {
        pointersRef.current.delete(e.pointerId);
        // End pinch when fewer than two fingers remain; resume pan if one is left.
        if (pinchRef.current && pointersRef.current.size < 2) {
          pinchRef.current = null;
          if (pointersRef.current.size === 1) {
            const [pt] = [...pointersRef.current.values()];
            panRef.current = { x: pt.x, y: pt.y, vx: viewRef.current.x, vy: viewRef.current.y };
            setPanning(true);
          }
        }
        if (panRef.current && pointersRef.current.size === 0) {
          panRef.current = null;
          setPanning(false);
        }
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
    // iOS/Safari fires pointercancel (not pointerup) when it reclaims a gesture.
    // Without this the finger stays "stuck" in the map and the next touch is
    // misread as a pinch against a stale point, flinging the org off-screen.
    function cancel(e: PointerEvent) {
      pointersRef.current.delete(e.pointerId);
      if (pointersRef.current.size < 2) pinchRef.current = null;
      if (pointersRef.current.size === 0) {
        panRef.current = null;
        setPanning(false);
      }
      if (drag) {
        setDrag(null);
        setHoverTarget(null);
      }
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
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
        <button onClick={() => setView((v) => clampView({ ...v, k: Math.min(2.5, v.k * 1.2) }))}>+</button>
        <button onClick={() => setView((v) => clampView({ ...v, k: Math.max(0.15, v.k / 1.2) }))}>−</button>
        <button title="Recenter the org" onClick={recenter}>◎</button>
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
