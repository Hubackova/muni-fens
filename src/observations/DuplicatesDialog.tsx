import { useEffect, useState } from "react";
import { API_ROOT, errorMessage, fetchJson } from "../api";
import ErrorBanner from "../ErrorBanner";
import { formatSamplingDate } from "../samplings/types";
import type { ObservationDuplicate } from "./types";

type Props = {
  onClose: () => void;
};

// The same species recorded twice within one sampling. Reported per sampling,
// not per locality - the same species in two samplings of one locality is
// perfectly normal.
function DuplicatesDialog({ onClose }: Props) {
  const [rows, setRows] = useState<ObservationDuplicate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const data = await fetchJson<ObservationDuplicate[]>(
          `${API_ROOT}/eco/observations/duplicates`,
          { signal: controller.signal },
        );
        setRows(data);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(`Failed to load duplicates. (${errorMessage(err)})`);
      } finally {
        setIsLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>Duplicate species within a sampling</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <ErrorBanner message={error} onDismiss={() => setError(null)} />

        {isLoading ? (
          <p>Loading...</p>
        ) : rows.length === 0 ? (
          <p className="empty">No species is recorded twice in one sampling.</p>
        ) : (
          <div className="table-wrap">
            <table className="merge-table">
              <thead>
                <tr>
                  <th>Site name</th>
                  <th>Sampling</th>
                  <th>Date</th>
                  <th>Species</th>
                  <th>Specifications</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.sampling_id}-${row.species_name}`}>
                    <td>{row.site_name}</td>
                    <td>#{row.sampling_id}</td>
                    <td>{formatSamplingDate(row)}</td>
                    <td>{row.species_name}</td>
                    <td>
                      {row.specifications.length > 0
                        ? row.specifications.join(", ")
                        : "-"}
                    </td>
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

export default DuplicatesDialog;
