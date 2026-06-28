import { useEffect, useMemo, useState } from "react";
import { API_ROOT, errorMessage, fetchJson } from "../api";

type Props = {
  entity: string;
  field: string; // backend cleanup field name
  label: string; // column label for display
  onClose: () => void;
  onDone: () => void; // called after a successful replace (reload the table)
};

// Bulk-edit dialog: unify typos by replacing several existing values with one target.
function CleanupDialog({ entity, field, label, onClose, onDone }: Props) {
  const [values, setValues] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<string[]>([]);
  const [target, setTarget] = useState("");
  const [query, setQuery] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        setIsLoading(true);
        setError(null);
        const data = await fetchJson<string[]>(
          `${API_ROOT}/cleanup/${entity}/${encodeURIComponent(field)}`,
          { signal: controller.signal },
        );
        setValues(data);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(errorMessage(err));
      } finally {
        setIsLoading(false);
      }
    })();
    return () => controller.abort();
  }, [entity, field]);

  const shownValues = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return values;
    return values.filter((v) => v.toLowerCase().includes(q));
  }, [values, query]);

  const toggle = (value: string) => {
    setSelected((cur) =>
      cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value],
    );
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedTarget = target.trim();
    if (!trimmedTarget || selected.length === 0) {
      setError("Select at least one value to replace and a target value.");
      return;
    }
    try {
      setIsSaving(true);
      setError(null);
      await fetchJson(`${API_ROOT}/cleanup/replace`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity,
          field,
          target: trimmedTarget,
          values: selected,
        }),
      });
      onDone();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>Cleanup: {label}</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>

        {error && <p className="error">{error}</p>}

        {isLoading ? (
          <p>Loading values...</p>
        ) : (
          <form onSubmit={handleSubmit}>
            <p className="hint">
              Select the values you want to unify, then enter the value they
              should all be rewritten to.
            </p>

            <input
              type="search"
              className="filter-search"
              placeholder="Filter values..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />

            <div className="cleanup-values">
              {shownValues.length === 0 ? (
                <p className="empty">No values.</p>
              ) : (
                shownValues.map((value) => (
                  <label key={value} className="filter-option">
                    <input
                      type="checkbox"
                      checked={selected.includes(value)}
                      onChange={() => toggle(value)}
                    />
                    <button
                      type="button"
                      className="link-btn cleanup-pick"
                      title="Use as target"
                      onClick={() => setTarget(value)}
                    >
                      {value === "" ? "(empty)" : value}
                    </button>
                  </label>
                ))
              )}
            </div>

            <label className="cleanup-target">
              Replace with
              <input
                list="cleanup-target-list"
                value={target}
                placeholder="Correct value"
                onChange={(e) => setTarget(e.target.value)}
              />
              <datalist id="cleanup-target-list">
                {values.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </label>

            <div className="modal-foot">
              <button type="button" onClick={onClose} disabled={isSaving}>
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={isSaving || selected.length === 0 || !target.trim()}
              >
                {isSaving
                  ? "Replacing..."
                  : `Replace ${selected.length} value(s)`}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default CleanupDialog;
