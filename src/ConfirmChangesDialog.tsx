export type FieldChange = {
  label: string;
  from: string;
  to: string;
};

type Props = {
  title: string;
  changes: FieldChange[];
  isSaving?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

// Shown before an inline edit is sent, so the old and the new value can be
// compared side by side - a cell changed by accident shows up here.
function ConfirmChangesDialog({
  title,
  changes,
  isSaving,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="modal-close" onClick={onCancel}>
            &times;
          </button>
        </div>

        <div className="table-wrap">
          <table className="merge-table">
            <thead>
              <tr>
                <th>Field</th>
                <th>From</th>
                <th>To</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((change) => (
                <tr key={change.label}>
                  <td>{change.label}</td>
                  <td className="change-from">{change.from}</td>
                  <td className="change-to">{change.to}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="modal-foot">
          <button
            type="button"
            className="btn-primary"
            disabled={isSaving}
            onClick={onConfirm}
          >
            {isSaving ? "Saving..." : "Save changes"}
          </button>
          <button type="button" disabled={isSaving} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmChangesDialog;
