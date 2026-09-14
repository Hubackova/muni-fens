import { useState } from "react";
import { API_ROOT, errorMessage, readApiErrorDetail } from "../api";
import ErrorBanner from "../ErrorBanner";
import { CSV_HEADER, type ImportResult, type ImportRowError } from "./types";

type Props = {
  samplingId: number;
  onClose: () => void;
  onImported: (inserted: number) => void;
};

// Bulk-add observations from a CSV. The import is atomic: either every row is
// inserted or nothing is, and the backend reports every faulty row at once.
function ImportDialog({ samplingId, onClose, onImported }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<ImportRowError[]>([]);

  const handleImport = async () => {
    if (!file) return;
    setError(null);
    setRowErrors([]);

    const body = new FormData();
    body.append("file", file);

    try {
      setIsImporting(true);
      const response = await fetch(
        `${API_ROOT}/eco/samplings/${samplingId}/observations/import`,
        { method: "POST", body },
      );

      // A rejected import answers 422 with a row-by-row report rather than the
      // usual single-error envelope.
      if (response.status === 422) {
        const payload = (await response.json()) as
          | ImportResult
          | { detail?: unknown };
        if (
          payload &&
          "status" in payload &&
          payload.status === "validation_failed"
        ) {
          setRowErrors(payload.errors);
          return;
        }
        setError("The CSV file was rejected.");
        return;
      }

      if (!response.ok) throw await readApiErrorDetail(response);

      const result = (await response.json()) as ImportResult;
      if (result.status === "created") {
        onImported(result.inserted);
        onClose();
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>Import observations from CSV</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <ErrorBanner message={error} onDismiss={() => setError(null)} />

        <p className="hint">
          UTF-8, with a header row. Required columns:{" "}
          <code>species,alive,empty,undefined</code>. Optional:{" "}
          <code>specification,lot,vouchers,note</code>. Species names must match
          exactly and must be the currently valid name. Neither{" "}
          <code>sampling_id</code> nor <code>all</code> belongs in the file.
        </p>
        <pre className="csv-header">{CSV_HEADER}</pre>

        <div className="form-row">
          <label className="grow">
            CSV file
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setRowErrors([]);
              }}
            />
          </label>
        </div>

        {rowErrors.length > 0 && (
          <>
            <p className="error">
              Nothing was imported. {rowErrors.length} problem
              {rowErrors.length === 1 ? "" : "s"} found:
            </p>
            <div className="table-wrap">
              <table className="merge-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Column</th>
                    <th>Problem</th>
                  </tr>
                </thead>
                <tbody>
                  {rowErrors.map((rowError, index) => (
                    <tr key={`${rowError.row}-${rowError.field}-${index}`}>
                      <td>{rowError.row}</td>
                      <td>{rowError.field}</td>
                      <td title={rowError.code}>{rowError.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="modal-foot">
          <button
            type="button"
            className="btn-primary"
            disabled={!file || isImporting}
            onClick={handleImport}
          >
            {isImporting ? "Importing..." : "Import"}
          </button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default ImportDialog;
