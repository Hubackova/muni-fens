import { useState } from "react";
import { API_ROOT, readApiErrorDetail } from "./api";

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

// Pull the server's own name out of Content-Disposition, preferring the
// encoded form when both are present.
function exportFilename(disposition: string | null): string {
  if (disposition) {
    const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
    if (encoded) {
      try {
        return decodeURIComponent(encoded[1]);
      } catch {
        // malformed encoding - fall through to the plain form
      }
    }

    const plain = /filename="?([^";]+)"?/i.exec(disposition);
    if (plain) return plain[1];
  }

  return "export.csv";
}

// Fetched rather than opened as a link so a rejected export (a stale id in the
// selection, say) reaches the page's error banner instead of silently landing
// in the downloads folder as a file full of JSON.
export async function downloadExport(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw await readApiErrorDetail(response);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = exportFilename(response.headers.get("Content-Disposition"));
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
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
