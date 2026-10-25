import { useEffect, useState } from "react";
import { API_ROOT, errorMessage, fetchJson } from "../api";
import type {
  SpeciesFullHistory,
  SpeciesTaxonomicChange,
} from "./types";
import ErrorBanner from "../ErrorBanner";

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

// Renders the localities a change touched, grouped by the species they came
// from. The backend sends null when there are none.
function AffectedLocalities({
  change,
}: {
  change: SpeciesTaxonomicChange;
}) {
  const groups = Object.entries(change.affected_localities_by_species ?? {});
  if (groups.length === 0) return <>No affected localities</>;
  return (
    <>
      {groups.map(([species, localities]) => (
        <div key={species}>
          <em>{species}</em>: {localities.join(", ")}
        </div>
      ))}
    </>
  );
}

// Shows both histories of a species: renames of the whole taxon, and the
// taxonomic changes its observations went through.
function HistoryDialog({ speciesId, speciesName, onClose }: Props) {
  const [history, setHistory] = useState<SpeciesFullHistory | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        setIsLoading(true);
        setError(null);
        const data = await fetchJson<SpeciesFullHistory>(
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

  // A single entry with nothing but `message` means "nothing happened here".
  const entries = history?.taxonomic_history ?? [];
  const taxonomic = entries.filter((change) => change.change_id !== null);
  const notice = entries.find(
    (change) => change.change_id === null && change.message,
  )?.message;

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

        <ErrorBanner message={error} />

        {isLoading && <p>Loading history...</p>}

        {history && (
          <>
            <h3>Name history</h3>
            {history.name_history.length === 0 ? (
              <p className="empty">The name of this species never changed.</p>
            ) : (
              <div className="table-wrap">
                <table className="merge-table">
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
                    {history.name_history.map((item) => (
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

            <h3>Taxonomic changes</h3>
            {taxonomic.length === 0 ? (
              <p className="empty">
                {notice ?? "This species took part in no taxonomic change."}
              </p>
            ) : (
              <div className="table-wrap">
                <table className="merge-table">
                  <thead>
                    <tr>
                      <th className="col-narrow">Date</th>
                      <th>Type</th>
                      <th>Role</th>
                      <th>From</th>
                      <th>To</th>
                      <th>Observations</th>
                      <th>Affected localities</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {taxonomic.map((change) => (
                      <tr key={change.change_id ?? change.created_on}>
                        <td className="col-narrow">{change.date ?? "-"}</td>
                        <td>{change.type ?? "-"}</td>
                        <td>{change.role ?? "-"}</td>
                        <td>{change.source_species?.join(", ") || "-"}</td>
                        <td>{change.target_species?.join(", ") || "-"}</td>
                        <td>{change.affected_observations ?? "-"}</td>
                        <td>
                          <AffectedLocalities change={change} />
                        </td>
                        <td>{change.note ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
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
