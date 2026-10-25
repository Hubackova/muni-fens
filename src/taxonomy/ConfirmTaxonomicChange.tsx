import { useState } from "react";

type Props = {
  operation: string;
  sourceNames: string[];
  targetNames: string[];
  observationCount: number;
  countryCodes: string[];
  isSaving: boolean;
  onConfirm: (date: string | null, note: string | null) => void;
  onCancel: () => void;
};

// Last step of every taxonomic change: the summary plus the date the change
// actually happened (a publication, say) and an optional note.
function ConfirmTaxonomicChange({
  operation,
  sourceNames,
  targetNames,
  observationCount,
  countryCodes,
  isSaving,
  onConfirm,
  onCancel,
}: Props) {
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>Confirm {operation}</h2>
          <button type="button" className="modal-close" onClick={onCancel}>
            &times;
          </button>
        </div>

        <dl className="locality-summary">
          <div>
            <dt>From</dt>
            <dd>{sourceNames.join(", ") || "-"}</dd>
          </div>
          <div>
            <dt>To</dt>
            <dd>{targetNames.join(", ") || "-"}</dd>
          </div>
          <div>
            <dt>Observations</dt>
            <dd>{observationCount}</dd>
          </div>
          <div>
            <dt>Countries</dt>
            <dd>{countryCodes.join(", ") || "-"}</dd>
          </div>
        </dl>

        <div className="form-row">
          <label>
            Date of the change
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <small className="hint">
              When the change happened - its publication, for instance - not
              when it is entered here.
            </small>
          </label>
          <label className="grow">
            Note
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
        </div>

        <div className="modal-foot">
          <button
            type="button"
            className="btn-primary"
            disabled={isSaving}
            onClick={() => onConfirm(date || null, note.trim() || null)}
          >
            {isSaving ? "Saving..." : "Confirm"}
          </button>
          <button type="button" disabled={isSaving} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmTaxonomicChange;
