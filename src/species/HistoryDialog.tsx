import { useEffect, useState } from "react";
import { API_ROOT, errorMessage, fetchJson } from "../api";
import type { SpeciesHistory } from "./types";

type Props = {
  speciesId: number;
  speciesName: string;
  onClose: () => void;
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

// Shows the synonym history of a species, ordered by age (newest first).
function HistoryDialog({ speciesId, speciesName, onClose }: Props) {
  const [history, setHistory] = useState<SpeciesHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        setIsLoading(true);
        setError(null);
        const data = await fetchJson<SpeciesHistory[]>(
          `${API_ROOT}/species/${speciesId}/history`,
          { signal: controller.signal },
        );
        setHistory(data);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(errorMessage(err));
      } finally {
        setIsLoading(false);
      }
    })();
    return () => controller.abort();
  }, [speciesId]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>History: {speciesName || `#${speciesId}`}</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>

        {error && <p className="error">{error}</p>}

        {isLoading ? (
          <p>Loading history...</p>
        ) : history.length === 0 ? (
          <p className="empty">No history for this species.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Species</th>
                  <th>Abbreviation</th>
                  <th>Author and year</th>
                  <th>Created on</th>
                  <th>Deleted</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => (
                  <tr key={item.unique_id}>
                    <td>{item.species || "-"}</td>
                    <td>{item.abbreviation ?? "-"}</td>
                    <td>{item.author_year ?? "-"}</td>
                    <td>{formatDate(item.created_on)}</td>
                    <td>{item.deleted ? "yes" : "no"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="modal-foot">
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default HistoryDialog;
