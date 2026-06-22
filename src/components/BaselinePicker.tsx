import { useOrg } from "../store";
import { employeesToCsv } from "../csv";
import { downloadText, slugify } from "../download";

export function BaselinePicker({ onClose }: { onClose: () => void }) {
  const snapshots = useOrg((s) => s.snapshots);
  const baselineId = useOrg((s) => s.baselineId);
  const restore = useOrg((s) => s.restoreSnapshot);
  const setActive = useOrg((s) => s.setActiveBaseline);
  const del = useOrg((s) => s.deleteSnapshot);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Saved baselines</h2>
        <div className="modal-sub">
          Restore one into the working org, or set which one the change report compares against.
          Snapshots last for this session — use “CSV” to keep one as a file you can re-import later.
        </div>

        <div className="snap-list">
          {snapshots.length === 0 && <div className="none">No saved baselines yet.</div>}
          {[...snapshots].reverse().map((s) => (
            <div className={`snap-row${s.id === baselineId ? " active" : ""}`} key={s.id}>
              <div className="snap-meta">
                <div className="snap-name">
                  {s.label}
                  {s.id === baselineId && <span className="active-badge">comparing</span>}
                </div>
                <div className="snap-sub">
                  {s.at} · {s.employees.length} people
                </div>
              </div>
              <div className="snap-actions">
                <button
                  className="primary"
                  onClick={() => {
                    restore(s.id);
                    onClose();
                  }}
                >
                  Restore
                </button>
                {s.id !== baselineId && (
                  <button onClick={() => setActive(s.id)} title="Use as the change-report comparison">
                    Compare
                  </button>
                )}
                <button
                  onClick={() => downloadText(`${slugify(s.label)}.csv`, employeesToCsv(s.employees))}
                  title="Download a CSV copy"
                >
                  CSV
                </button>
                <button
                  className="danger"
                  title="Delete this snapshot"
                  onClick={() => del(s.id)}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="modal-actions">
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
