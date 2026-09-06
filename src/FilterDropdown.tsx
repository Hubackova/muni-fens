import { useEffect, useMemo, useState } from "react";
import type { FilterMeta } from "./api";

type Props = {
  meta: FilterMeta;
  anchor: DOMRect; // screen rect of the button that opened the dropdown
  selected: string[];
  onChange: (values: string[]) => void;
  onClose: () => void;
};

const WIDTH = 240;

// A small popover listing a column's available values as a multi-select.
// For "text_search" filters an inner text box narrows the list of options.
// Rendered with position:fixed so it isn't clipped by the scrollable table.
function FilterDropdown({ meta, anchor, selected, onChange, onClose }: Props) {
  const [query, setQuery] = useState("");
  const showSearch = meta.type === "text_search";

  // Reposition relative to the anchor; close on scroll/resize so it never
  // drifts away from its column.
  useEffect(() => {
    const onScrollOrResize = () => onClose();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [onClose]);

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return meta.options;
    return meta.options.filter((o) => o.toLowerCase().includes(q));
  }, [meta.options, query]);

  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  // Keep the panel inside the viewport horizontally.
  const left = Math.min(anchor.left, window.innerWidth - WIDTH - 8);
  const style: React.CSSProperties = {
    position: "fixed",
    top: anchor.bottom + 4,
    left: Math.max(8, left),
    width: WIDTH,
  };

  return (
    <div
      className="filter-dropdown"
      style={style}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="filter-dropdown-head">
        <strong>{meta.label}</strong>
        {selected.length > 0 && (
          <button type="button" className="link-btn" onClick={() => onChange([])}>
            Clear
          </button>
        )}
      </div>

      {showSearch && (
        <input
          type="search"
          className="filter-search"
          placeholder="Filter values..."
          value={query}
          autoFocus
          onChange={(e) => setQuery(e.target.value)}
        />
      )}

      <div className="filter-options">
        {options.length === 0 ? (
          <p className="empty">No values.</p>
        ) : (
          options.map((option) => (
            <label key={option} className="filter-option">
              <input
                type="checkbox"
                checked={selected.includes(option)}
                onChange={() => toggle(option)}
              />
              <span>{option === "" ? "(empty)" : option}</span>
            </label>
          ))
        )}
      </div>

      <div className="filter-dropdown-foot">
        <button type="button" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}

export default FilterDropdown;
