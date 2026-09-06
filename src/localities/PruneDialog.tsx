import { useState } from "react";
import { API_ROOT, errorMessage, readApiError } from "../api";
import type { Locality } from "./types";

type Props = {
  locality: Locality;
  onClose: () => void;
  onDone: () => void; // called after a successful prune (reload the table)
};

// Prune permanently removes a locality with no backup, so it asks the user to
// retype the site name before the button unlocks. The backend still refuses
// localities that are referenced elsewhere - that error is shown here.
function PruneDialog({ locality, onClose, onDone }: Props) {
  const [confirmation, setConfirmation] = useState("");
  const [isPruning, setIsPruning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = confirmation.trim() === locality.name;

  const handlePrune = async () => {
    if (!matches) return;
    try {
      setIsPruning(true);
      setError(null);
      const response = await fetch(
        `${API_ROOT}/localities/${locality.id}/prune`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error(await readApiError(response));
      onDone();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsPruning(false);
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
          <h2>Prune locality</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>

        {error && <p className="error">{error}</p>}

        <p className="danger-note">
          This deletes <strong>{locality.name}</strong> (#{locality.id}) from
          the database permanently. There is no backup and no undo. Localities
          that are still used somewhere cannot be pruned - the server will
          refuse them.
        </p>

        <label className="prune-confirm">
          Type the site name to confirm: <code>{locality.name}</code>
          <input
            value={confirmation}
            autoFocus
            onChange={(e) => setConfirmation(e.target.value)}
          />
        </label>

        <div className="modal-foot">
          <button
            type="button"
            className="btn-danger"
            disabled={!matches || isPruning}
            onClick={handlePrune}
          >
            {isPruning ? "Pruning..." : "Prune permanently"}
          </button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default PruneDialog;
