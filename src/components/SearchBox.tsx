import { useMemo, useRef, useState } from "react";
import { useOrg } from "../store";

export function SearchBox() {
  const employees = useOrg((s) => s.employees);
  const focusNode = useOrg((s) => s.focusNode);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    return employees
      .filter(
        (e) =>
          e.name.toLowerCase().includes(term) ||
          (e.title ?? "").toLowerCase().includes(term)
      )
      .slice(0, 8);
  }, [q, employees]);

  function choose(id: string) {
    focusNode(id);
    setQ("");
    setOpen(false);
  }

  return (
    <div className="search-box" ref={wrapRef}>
      <input
        value={q}
        placeholder="🔍 Find a person…"
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!matches.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            choose(matches[active].id);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && matches.length > 0 && (
        <div className="search-results">
          {matches.map((m, i) => (
            <div
              key={m.id}
              className={`search-item${i === active ? " active" : ""}`}
              onMouseDown={() => choose(m.id)}
              onMouseEnter={() => setActive(i)}
            >
              <span className="si-name">{m.name}</span>
              {m.title && <span className="si-title">{m.title}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
