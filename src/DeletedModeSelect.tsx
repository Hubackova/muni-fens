import type { DeletedMode } from "./useDeletedMode";

type Props = {
  value: DeletedMode;
  onChange: (mode: DeletedMode) => void;
};

// Chooses whether the table shows active rows, soft-deleted ones, or both.
function DeletedModeSelect({ value, onChange }: Props) {
  // The options name the subject themselves, so no visible label is needed.
  return (
    <select
      className="toolbar-select"
      aria-label="Which rows to show"
      value={value}
      onChange={(e) => onChange(e.target.value as DeletedMode)}
    >
      <option value="all">All</option>
      <option value="active">Active only</option>
      <option value="deleted">Deleted only</option>
    </select>
  );
}

export default DeletedModeSelect;
