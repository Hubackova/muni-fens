import { useState } from "react";

// Soft-deleted rows stay in the database and the list endpoints return them
// unless asked otherwise. The tables default to hiding them.
export type DeletedMode = "all" | "active" | "deleted";

export function useDeletedMode() {
  const [mode, setMode] = useState<DeletedMode>("active");

  return {
    mode,
    setMode,
    // "all" means no filter at all, which is also the API default.
    apply: (params: URLSearchParams) => {
      if (mode !== "all") {
        params.set("filter_deleted", mode === "deleted" ? "1" : "0");
      }
    },
    // The flag is only worth a column when both kinds can show up.
    showDeletedColumn: mode === "all",
  };
}
