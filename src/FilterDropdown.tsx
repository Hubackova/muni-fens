import { useEffect, useMemo, useState } from "react";
import { isValueFilter, type FilterMeta } from "./api";

type Props = {
  meta: FilterMeta;
  anchor: DOMRect; // screen rect of the button that opened the dropdown
  // Active values keyed by query param; a range filter uses two of them.
  values: Record<string, string[]>;
  onChange: (param: string, values: string[]) => void;
  onClose: () => void;
};

const WIDTH = 240;

// A small popover for one column's filter. Value filters ("select" and
// "text_search") list the available values as a multi-select - text_search
// adds an inner box that narrows that list. "range" and "date_range" have no
// options and edit the min/max query params instead.
// Rendered with position:fixed so it isn't clipped by the scrollable table.
function FilterDropdown({ meta, anchor, values, onChange, onClose }: Props) {
  const [query, setQuery] = useState("");

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
      </div>

      {isValueFilter(meta) ? (
        <ValueFilter
          meta={meta}
          selected={values[meta.param] ?? []}
          query={query}
          setQuery={setQuery}
          onChange={(next) => onChange(meta.param, next)}
        />
      ) : (
        <RangeFilter
          min={values[meta.min_param]?.[0] ?? ""}
          max={values[meta.max_param]?.[0] ?? ""}
          bounds={meta}
          onCommit={(param, value) => onChange(param, value ? [value] : [])}
        />
      )}

      <div className="filter-dropdown-foot">
        <button type="button" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}

type ValueFilterProps = {
  meta: Extract<FilterMeta, { options: string[] }>;
  selected: string[];
  query: string;
  setQuery: (value: string) => void;
  onChange: (values: string[]) => void;
};

function ValueFilter({
  meta,
  selected,
  query,
  setQuery,
  onChange,
}: ValueFilterProps) {
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

  return (
    <>
      {selected.length > 0 && (
        <button type="button" className="link-btn" onClick={() => onChange([])}>
          Clear
        </button>
      )}

      {meta.type === "text_search" && (
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
    </>
  );
}

type RangeFilterProps = {
  min: string;
  max: string;
  bounds: Extract<FilterMeta, { type: "range" | "date_range" }>;
  onCommit: (param: string, value: string) => void;
};

// Committed on blur rather than on every keystroke, so typing "1500" does not
// reload the table four times.
function RangeFilter({ min, max, bounds, onCommit }: RangeFilterProps) {
  const isDate = bounds.type === "date_range";
  // Seeded once: nothing outside this popover edits the two params while it
  // is open, and Clear below resets the draft itself.
  const [draft, setDraft] = useState({ min, max });

  const commit = (side: "min" | "max") => {
    const param = side === "min" ? bounds.min_param : bounds.max_param;
    const current = side === "min" ? min : max;
    if (draft[side] !== current) onCommit(param, draft[side].trim());
  };

  return (
    <div className="filter-range">
      {(min || max) && (
        <button
          type="button"
          className="link-btn"
          onClick={() => {
            setDraft({ min: "", max: "" });
            onCommit(bounds.min_param, "");
            onCommit(bounds.max_param, "");
          }}
        >
          Clear
        </button>
      )}
      <label>
        From
        <input
          type={isDate ? "date" : "number"}
          value={draft.min}
          // A date input ignores the placeholder, so the bounds the backend
          // reports are handed to the picker instead.
          min={isDate && bounds.min !== null ? String(bounds.min) : undefined}
          max={isDate && bounds.max !== null ? String(bounds.max) : undefined}
          placeholder={bounds.min === null ? "" : String(bounds.min)}
          onChange={(e) => setDraft((d) => ({ ...d, min: e.target.value }))}
          onBlur={() => commit("min")}
        />
      </label>
      <label>
        To
        <input
          type={isDate ? "date" : "number"}
          value={draft.max}
          min={isDate && bounds.min !== null ? String(bounds.min) : undefined}
          max={isDate && bounds.max !== null ? String(bounds.max) : undefined}
          placeholder={bounds.max === null ? "" : String(bounds.max)}
          onChange={(e) => setDraft((d) => ({ ...d, max: e.target.value }))}
          onBlur={() => commit("max")}
        />
      </label>
    </div>
  );
}

export default FilterDropdown;
