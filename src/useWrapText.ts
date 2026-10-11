import { useState } from "react";

// Table cells clip long values by default. This switches a table to wrapping
// them instead - rows grow taller, but nothing is hidden and the text can be
// selected.
export function useWrapText() {
  const [wrapped, setWrapped] = useState(false);
  return {
    wrapped,
    toggle: () => setWrapped((current) => !current),
    // Appended to the table's own class.
    tableClass: wrapped ? " table-wrapped" : "",
  };
}
