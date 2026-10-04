import { useState } from "react";
import { API_ROOT } from "./api";

// The export endpoints mirror their list endpoint's search, filters and sort,
// never take paging, and let an explicit row selection override everything
// else - the ids also decide the order of the exported rows.
export function buildExportUrl(
  path: string,
  listQuery: URLSearchParams,
  idParam: string,
  selectedIds: number[],
): string {
  const params = new URLSearchParams(listQuery);
  params.delete("limit");
  params.delete("offset");

  if (selectedIds.length > 0) {
    // A selection takes precedence, so nothing else is worth sending.
    for (const key of Array.from(params.keys())) params.delete(key);
    for (const id of selectedIds) params.append(idParam, String(id));
  }

  const query = params.toString();
  return `${API_ROOT}${path}${query ? `?${query}` : ""}`;
}

// The response carries Content-Disposition, so letting the browser follow a
// link is enough - no blob juggling and the server's filename is kept.
export function downloadExport(url: string) {
  const link = document.createElement("a");
  link.href = url;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

// Row ticks shared by every exportable table. Selections survive paging
// because they are kept as ids, not row positions.
export function useRowSelection() {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const toggle = (id: number) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const setMany = (ids: number[], on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  const clear = () => setSelected(new Set());

  return { selected, toggle, setMany, clear };
}
